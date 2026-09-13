import { AppError, NotFoundError } from '../../common/errors';
import { countWorkingDays, round2, toNumber } from '../../utils/formatters';
import {
  aggregateByDepartment,
  aggregateByDesignationGrade,
  DEFAULT_HSN_SAC,
  SiteEmployeeBillingRow,
} from './billing.calculation';
import {
  assembleBillingTotals,
  buildValidationResult,
} from './billing-engine.calculation';
import { billingEngineRepository, ClientGradeRate } from './billing-engine.repository';
import {
  BillingEngineCalculateInput,
  BillingEngineContext,
  BillingEngineResult,
  BillingEngineValidation,
  BillingEngineValidationInput,
} from './billing-engine.types';
import { BillingRepository } from './billing.repository';
import {
  computeEmployeeLwf,
  computeStatutoryGrossEarned,
} from '../statutory/statutory.calculation';
import { computeBasicEarned } from './billing.calculation';

export class BillingEngineService {
  private billingRepo = new BillingRepository();

  async validate(input: BillingEngineValidationInput): Promise<BillingEngineValidation> {
    const clientRow = await billingEngineRepository.getClientSiteContext(input.clientId, input.siteId);
    if (!clientRow) throw new NotFoundError('Client site', input.siteId);

    const configRow = await billingEngineRepository.getBillingConfiguration(input.siteId);
    const contractRow = await billingEngineRepository.getActiveContract(
      input.clientId,
      input.siteId,
      input.month,
      input.year,
    );
    const attendanceRegister = await billingEngineRepository.getAttendanceRegister(
      input.clientId,
      input.month,
      input.year,
    );
    const payrollRun = await billingEngineRepository.getPayrollRun(input.month, input.year);

    return buildValidationResult({
      billingConfiguration: Boolean(configRow),
      contractActive: Boolean(contractRow),
      attendanceProcessed: attendanceRegister
        ? billingEngineRepository.isAttendanceProcessed(attendanceRegister.status)
        : false,
      payrollProcessed: payrollRun
        ? billingEngineRepository.isPayrollProcessed(payrollRun.status)
        : false,
      requirePayroll: input.requirePayroll,
      requireAttendance: input.requireAttendance,
    });
  }

  async calculate(input: BillingEngineCalculateInput): Promise<BillingEngineResult> {
    const validation = await this.validate(input);

    if (!input.skipValidation && !validation.valid) {
      throw new AppError(400, validation.errors.join(' '));
    }

    const ctx = await this.loadContext(input);

    const siteRow = await this.billingRepo.getSiteForBilling(input.siteId);
    if (!siteRow) throw new NotFoundError('Site', input.siteId);

    const workingDays = ctx.workingDays;
    const employees = await this.billingRepo.getSiteEmployeesBillingData(input.siteId, input.month, input.year);
    const gradeRates = await billingEngineRepository.getClientGradeRates(input.clientId, input.siteId);

    const configRow = await billingEngineRepository.getBillingConfiguration(input.siteId);
    const contractRow = await billingEngineRepository.getActiveContract(
      input.clientId,
      input.siteId,
      input.month,
      input.year,
    );

    const configBillingRate = configRow?.billing_rate != null ? Number(configRow.billing_rate) : null;
    const contractBillingRate = contractRow?.billing_rate != null ? Number(contractRow.billing_rate) : null;
    const siteMonthly = toNumber(siteRow.billing_rate_per_month as string | null) || null;
    const siteDaily = toNumber(siteRow.billing_rate_per_day as string | null) || null;

    const siteDailyFallback = this.resolveDailyRate(
      siteMonthly,
      siteDaily,
      workingDays,
      configBillingRate,
      contractBillingRate,
      ctx.billingType,
    );

    const gradeAggregates = aggregateByDesignationGrade(employees, workingDays);
    const deptAggregates = aggregateByDepartment(employees, workingDays);

    let employeeCharges = 0;
    let pfWageBase = 0;

    if (gradeAggregates.length > 0) {
      for (const grade of gradeAggregates) {
        const dailyRate = this.resolveGradeDailyRate(
          grade.designationGradeId,
          employees,
          gradeRates,
          workingDays,
          siteDailyFallback,
          configBillingRate,
          contractBillingRate,
          ctx.billingType,
        );

        pfWageBase = round2(pfWageBase + grade.basicEarned);

        if (grade.manDays > 0 && dailyRate > 0) {
          employeeCharges = round2(employeeCharges + grade.manDays * dailyRate);
        }

        employeeCharges = round2(
          employeeCharges
            + grade.overtimePay
            + grade.nightAllowance
            + grade.punctualityAward
            + grade.bonus,
        );
      }
    } else {
      for (const dept of deptAggregates) {
        const dailyRate = this.resolveDeptDailyRate(
          dept.departmentId,
          employees,
          workingDays,
          siteDailyFallback,
          configBillingRate,
          contractBillingRate,
          ctx.billingType,
        );

        pfWageBase = round2(pfWageBase + dept.basicEarned);

        if (dept.manDays > 0 && dailyRate > 0) {
          employeeCharges = round2(employeeCharges + dept.manDays * dailyRate);
        }

        employeeCharges = round2(
          employeeCharges
            + dept.overtimePay
            + dept.nightAllowance
            + dept.punctualityAward
            + dept.bonus,
        );
      }
    }

    if (employeeCharges <= 0 && employees.length === 0) {
      const headcount = await this.billingRepo.countEmployeesAtSite(input.siteId);
      const deployedCount = headcount > 0 ? headcount : Number(siteRow.required_headcount) || 0;
      const unitRate = this.resolveUnitRate(
        siteMonthly,
        siteDaily,
        workingDays,
        configBillingRate,
        contractBillingRate,
        ctx.billingType,
      );
      if (deployedCount > 0 && unitRate > 0) {
        employeeCharges = round2(deployedCount * unitRate);
      }
    }

    // When a payroll run exists, the invoice must mirror the payslips. We therefore
    // source the billing figures from the authoritative payroll entries rather than
    // re-deriving them from raw attendance + billing rates:
    //   - Manpower Arrangement Charges = sum of employee earned GROSS salary
    //   - EPF base                     = sum of employee earned BASIC
    let payrollEmployeeLwf = 0;
    if (ctx.payrollRunId) {
      const payrollAgg = await billingEngineRepository.getPayrollBillingAggregateForSite(
        input.siteId,
        ctx.payrollRunId,
      );
      if (payrollAgg.entryCount > 0) {
        employeeCharges = round2(payrollAgg.grossEarnings);
        pfWageBase = round2(payrollAgg.basicEarned);
        payrollEmployeeLwf = round2(payrollAgg.employeeLwf);
      }
    }

    const pfContribution =
      pfWageBase > 0 ? round2(pfWageBase * (ctx.pfPct / 100)) : 0;
    const esicContribution =
      employeeCharges > 0 ? round2(employeeCharges * (ctx.esicPct / 100)) : 0;
    const lwfAmount = this.resolveLwfAmount(
      ctx,
      employees,
      workingDays,
      employeeCharges,
      payrollEmployeeLwf,
    );

    const sacCode = ctx.sacCode || DEFAULT_HSN_SAC;

    const totals = assembleBillingTotals({
      month: input.month,
      year: input.year,
      sacCode,
      employeeCharges,
      pfContribution,
      pfWageBase,
      esicContribution,
      lwfAmount,
      serviceChargePct: ctx.serviceChargePct,
      pfPct: ctx.pfPct,
      esicPct: ctx.esicPct,
      lwfPct: ctx.lwfPct,
      enabledComponents: ctx.enabledComponents,
      gstPct: ctx.gstPct,
      gstType: ctx.gstType,
      companyState: ctx.companyState,
      clientState: ctx.clientState ?? ctx.siteState,
    });

    const totalManDays = round2(
      gradeAggregates.length > 0
        ? gradeAggregates.reduce((s, g) => s + g.manDays, 0)
        : deptAggregates.reduce((s, d) => s + d.manDays, 0),
    );

    const alreadyInvoiced = await billingEngineRepository.siteInvoiceExists(
      input.siteId,
      input.month,
      input.year,
    );

    return {
      clientId: ctx.clientId,
      clientName: ctx.clientName,
      siteId: ctx.siteId,
      siteName: ctx.siteName,
      month: input.month,
      year: input.year,
      workingDays,
      employeeCount: employees.length,
      totalManDays,
      billingConfigurationId: ctx.billingConfigurationId,
      contractId: ctx.contractId,
      attendanceRegisterId: ctx.attendanceRegisterId,
      payrollRunId: ctx.payrollRunId,
      validation,
      employeeCharges: totals.employeeCharges,
      pfContribution: totals.pfContribution,
      esicContribution: totals.esicContribution,
      lwfAmount: totals.lwfAmount,
      serviceChargeAmount: totals.serviceChargeAmount,
      otherCharges: totals.otherCharges,
      penaltyAmount: totals.penaltyAmount,
      adjustmentAmount: totals.adjustmentAmount,
      discountAmount: totals.discountAmount,
      taxableValue: totals.taxableValue,
      tax: totals.tax,
      grandTotal: totals.grandTotal,
      components: totals.components,
      lineItems: totals.components,
      calculationSnapshot: {
        billingType: ctx.billingType,
        serviceChargePct: ctx.serviceChargePct,
        pfPct: ctx.pfPct,
        esicPct: ctx.esicPct,
        lwfPct: ctx.lwfPct,
        pfWageBase,
        gstPct: ctx.gstPct,
        gstType: ctx.gstType,
        gradeRateCount: gradeRates.length,
        employeeCount: employees.length,
        generatedAt: new Date().toISOString(),
      },
      alreadyInvoiced,
      placeOfSupply: ctx.clientState ?? ctx.siteState,
      natureOfService: ctx.natureOfService,
      sacCode: ctx.sacCode,
    };
  }

  private async loadContext(input: BillingEngineCalculateInput): Promise<BillingEngineContext> {
    const clientRow = await billingEngineRepository.getClientSiteContext(input.clientId, input.siteId);
    if (!clientRow) throw new NotFoundError('Client site', input.siteId);

    const configRow = await billingEngineRepository.getBillingConfiguration(input.siteId);
    const contractRow =
      (configRow?.contract_id
        ? await billingEngineRepository.getActiveContract(input.clientId, input.siteId, input.month, input.year)
        : null) ??
      (await billingEngineRepository.getActiveContract(input.clientId, input.siteId, input.month, input.year));

    const attendanceRegister = await billingEngineRepository.getAttendanceRegister(
      input.clientId,
      input.month,
      input.year,
    );
    const payrollRun = await billingEngineRepository.getPayrollRun(input.month, input.year);

    const enabledComponents = configRow?.id
      ? await billingEngineRepository.getEnabledComponents(String(configRow.id))
      : [];

    const companyState = await billingEngineRepository.getCompanyState();
    const workingDays = countWorkingDays(input.year, input.month);

    return billingEngineRepository.buildContextFromRows({
      clientRow,
      configRow,
      contractRow,
      companyState,
      enabledComponents,
      month: input.month,
      year: input.year,
      workingDays,
      attendanceRegisterId: attendanceRegister?.id ?? null,
      payrollRunId: payrollRun?.id ?? null,
    });
  }

  /**
   * Billed LWF = the lesser of the configured percentage rate (e.g. 0.4% of the
   * manpower amount) and twice the total employee LWF contribution. LWF is only
   * billed for LWF-applicable employees, so when there is no employee LWF the line
   * is dropped (min => 0).
   */
  private resolveLwfAmount(
    ctx: BillingEngineContext,
    employees: SiteEmployeeBillingRow[],
    workingDays: number,
    employeeCharges: number,
    payrollEmployeeLwf: number,
  ): number {
    let employeeLwfTotal = payrollEmployeeLwf;
    if (employeeLwfTotal <= 0) {
      let attendanceStyleTotal = 0;
      for (const emp of employees) {
        if (!emp.statutoryConfig.lwfApplicable) continue;
        const basicEarned = computeBasicEarned(emp.basicSalary, workingDays, emp.presentDays);
        const statutoryGross = computeStatutoryGrossEarned(
          basicEarned,
          0,
          emp.nightAllowance,
          emp.punctualityAward,
          emp.overtimePay,
        );
        attendanceStyleTotal += computeEmployeeLwf(statutoryGross, emp.statutoryConfig);
      }
      employeeLwfTotal = round2(attendanceStyleTotal);
    }

    const employeeCap = round2(employeeLwfTotal * 2);
    if (employeeCap <= 0) return 0;

    const pctAmount = employeeCharges > 0 ? round2(employeeCharges * (ctx.lwfPct / 100)) : 0;
    if (pctAmount <= 0) return employeeCap;

    return round2(Math.min(pctAmount, employeeCap));
  }

  private resolveGradeDailyRate(
    designationGradeId: string,
    employees: SiteEmployeeBillingRow[],
    gradeRates: ClientGradeRate[],
    workingDays: number,
    siteDailyFallback: number,
    configBillingRate: number | null,
    contractBillingRate: number | null,
    billingType: string,
  ): number {
    const clientRate = gradeRates.find((r) => r.designationGradeId === designationGradeId);
    if (clientRate?.ratePerDay) return clientRate.ratePerDay;
    if (clientRate?.ratePerMonth && workingDays > 0) return round2(clientRate.ratePerMonth / workingDays);

    if (billingType === 'daily' && configBillingRate) return configBillingRate;
    if (billingType === 'monthly' && configBillingRate && workingDays > 0) return round2(configBillingRate / workingDays);
    if (contractBillingRate && workingDays > 0) return round2(contractBillingRate / workingDays);

    const emp = employees.find((e) => e.designationGradeId === designationGradeId);
    if (emp?.grossSalary && workingDays > 0) return round2(emp.grossSalary / workingDays);
    return siteDailyFallback;
  }

  private resolveDeptDailyRate(
    departmentId: string,
    employees: SiteEmployeeBillingRow[],
    workingDays: number,
    siteDailyFallback: number,
    configBillingRate: number | null,
    contractBillingRate: number | null,
    billingType: string,
  ): number {
    if (billingType === 'daily' && configBillingRate) return configBillingRate;
    if (billingType === 'monthly' && configBillingRate && workingDays > 0) return round2(configBillingRate / workingDays);
    if (contractBillingRate && workingDays > 0) return round2(contractBillingRate / workingDays);

    const deptEmployees = employees.filter((e) => e.departmentId === departmentId);
    if (deptEmployees.length && workingDays > 0) {
      const avgGross = deptEmployees.reduce((s, e) => s + e.grossSalary, 0) / deptEmployees.length;
      if (avgGross > 0) return round2(avgGross / workingDays);
    }
    return siteDailyFallback;
  }

  private resolveDailyRate(
    siteMonthly: number | null,
    siteDaily: number | null,
    workingDays: number,
    configBillingRate: number | null,
    contractBillingRate: number | null,
    billingType: string,
  ): number {
    if (billingType === 'daily' && configBillingRate) return configBillingRate;
    if (siteDaily && siteDaily > 0) return siteDaily;
    if (billingType === 'monthly' && configBillingRate && workingDays > 0) return round2(configBillingRate / workingDays);
    if (contractBillingRate && workingDays > 0) return round2(contractBillingRate / workingDays);
    if (siteMonthly && siteMonthly > 0 && workingDays > 0) return round2(siteMonthly / workingDays);
    return 0;
  }

  private resolveUnitRate(
    siteMonthly: number | null,
    siteDaily: number | null,
    workingDays: number,
    configBillingRate: number | null,
    contractBillingRate: number | null,
    billingType: string,
  ): number {
    if (billingType === 'monthly') {
      if (configBillingRate) return configBillingRate;
      if (contractBillingRate) return contractBillingRate;
      if (siteMonthly) return siteMonthly;
    }
    if (billingType === 'daily') {
      if (configBillingRate) return round2(configBillingRate * workingDays);
      if (siteDaily) return round2(siteDaily * workingDays);
    }
    return this.resolveDailyRate(siteMonthly, siteDaily, workingDays, configBillingRate, contractBillingRate, billingType);
  }
}

export const billingEngineService = new BillingEngineService();

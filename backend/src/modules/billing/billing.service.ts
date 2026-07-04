import {
  CreateSiteInvoiceInput,
  GenerateSiteInvoicesInput,
  GeneratedSiteInvoice,
  InvoicePreviewDto,
  SuggestedInvoiceLineItem,
  UpdateInvoiceInput,
  UpdateInvoiceStatusInput,
} from './billing.types';
import { InvoiceStatus } from '../../types/enums';
import { countWorkingDays, round2, toNumber, monthName } from '../../utils/formatters';
import { AppError, NotFoundError } from '../../common/errors';
import { withTransaction } from '../../database/pool';
import { billingInvoiceService } from './billing-invoice.service';
import { billingEngineService } from './billing-engine.service';
import { BillingEngineResult } from './billing-engine.types';
import { BILLING_COMPONENT_CODE } from './billing.constants';
import { invoiceAuditRepository } from './invoice-audit.repository';
import { invoicePaymentRepository } from './invoice-payment.repository';
import {
  aggregateByDepartment,
  aggregateByDesignationGrade,
  DEFAULT_HSN_SAC,
  SiteEmployeeBillingRow,
} from './billing.calculation';
import { BillingRepository, STATUS_LABELS } from './billing.repository';

const ALLOWED_STATUS_TRANSITIONS: Record<number, number[]> = {
  [InvoiceStatus.Draft]: [InvoiceStatus.Generated, InvoiceStatus.Sent, InvoiceStatus.Cancelled],
  [InvoiceStatus.Generated]: [InvoiceStatus.Approved, InvoiceStatus.Sent, InvoiceStatus.Cancelled],
  [InvoiceStatus.Approved]: [InvoiceStatus.Sent, InvoiceStatus.Cancelled],
  [InvoiceStatus.Sent]: [
    InvoiceStatus.Viewed,
    InvoiceStatus.PartiallyPaid,
    InvoiceStatus.Paid,
    InvoiceStatus.Overdue,
    InvoiceStatus.Cancelled,
  ],
  [InvoiceStatus.Viewed]: [
    InvoiceStatus.PartiallyPaid,
    InvoiceStatus.Paid,
    InvoiceStatus.Overdue,
    InvoiceStatus.Cancelled,
  ],
  [InvoiceStatus.PartiallyPaid]: [InvoiceStatus.Paid, InvoiceStatus.Overdue, InvoiceStatus.Cancelled],
  [InvoiceStatus.Paid]: [],
  [InvoiceStatus.Overdue]: [InvoiceStatus.PartiallyPaid, InvoiceStatus.Paid, InvoiceStatus.Cancelled],
  [InvoiceStatus.Cancelled]: [],
};

export class BillingService {
  private repo = new BillingRepository();

  resolveUnitRate(
    ratePerMonth: number | null,
    ratePerDay: number | null,
    workingDays: number,
  ): number {
    const monthly = ratePerMonth ?? 0;
    const daily = ratePerDay ?? 0;
    if (monthly > 0) return monthly;
    if (daily > 0) return round2(daily * workingDays);
    return 0;
  }

  resolveDailyRate(ratePerMonth: number | null, ratePerDay: number | null, workingDays: number): number {
    const daily = ratePerDay ?? 0;
    const monthly = ratePerMonth ?? 0;
    if (daily > 0) return daily;
    if (monthly > 0 && workingDays > 0) return round2(monthly / workingDays);
    return 0;
  }

  private resolveGradeDailyRate(
    employees: SiteEmployeeBillingRow[],
    designationGradeId: string,
    workingDays: number,
    siteDailyFallback: number,
  ): number {
    const emp = employees.find((e) => e.designationGradeId === designationGradeId);
    const monthlyGross = emp?.grossSalary ?? 0;
    if (monthlyGross > 0 && workingDays > 0) return round2(monthlyGross / workingDays);
    return siteDailyFallback;
  }

  private resolveDeptDailyRate(
    employees: SiteEmployeeBillingRow[],
    departmentId: string,
    workingDays: number,
    siteDailyFallback: number,
  ): number {
    const deptEmployees = employees.filter((e) => e.departmentId === departmentId);
    if (!deptEmployees.length) return siteDailyFallback;
    const avgGross =
      deptEmployees.reduce((sum, e) => sum + e.grossSalary, 0) / deptEmployees.length;
    if (avgGross > 0 && workingDays > 0) return round2(avgGross / workingDays);
    return siteDailyFallback;
  }

  private gradeMonthlyGross(
    employees: SiteEmployeeBillingRow[],
    designationGradeId: string,
  ): number {
    const emp = employees.find((e) => e.designationGradeId === designationGradeId);
    return emp?.grossSalary ?? 0;
  }

  private deptMonthlyGross(
    employees: SiteEmployeeBillingRow[],
    departmentId: string,
  ): number {
    const deptEmployees = employees.filter((e) => e.departmentId === departmentId);
    if (!deptEmployees.length) return 0;
    return round2(
      deptEmployees.reduce((sum, e) => sum + e.grossSalary, 0) / deptEmployees.length,
    );
  }

  async buildLineItemsForSite(
    site: Record<string, unknown>,
    month: number,
    year: number,
  ): Promise<Array<{ description: string; quantity: number; unitRate: number; hsnSacCode: string }>> {
    const preview = await this.buildSiteInvoicePreview(String(site.id), month, year, 18);
    return preview.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitRate: item.unitRate,
      hsnSacCode: item.hsnSacCode,
    }));
  }

  async buildSiteInvoicePreview(
    siteId: string,
    month: number,
    year: number,
    gstRate = 18,
  ): Promise<InvoicePreviewDto> {
    const site = await this.repo.getSiteForBilling(siteId);
    if (!site) throw new NotFoundError('Site', siteId);

    const clientId = String(site.client_id);
    const siteName = String(site.site_name);
    const workingDays = countWorkingDays(year, month);
    const periodLabel = monthName(month, year);
    const employees = await this.repo.getSiteEmployeesBillingData(siteId, month, year);
    const gradeAggregates = aggregateByDesignationGrade(employees, workingDays);
    const deptAggregates = aggregateByDepartment(employees, workingDays);

    const siteDailyFallback = this.resolveDailyRate(
      toNumber(site.billing_rate_per_month as string | null) || null,
      toNumber(site.billing_rate_per_day as string | null) || null,
      workingDays,
    );

    const lineItems: InvoicePreviewDto['lineItems'] = [];
    let totalManDays = 0;
    let totalOvertimePay = 0;
    let totalEmployerPf = 0;
    let totalEmployerEsi = 0;

    if (gradeAggregates.length > 0) {
      for (const grade of gradeAggregates) {
        const dailyRate = this.resolveGradeDailyRate(
          employees,
          grade.designationGradeId,
          workingDays,
          siteDailyFallback,
        );

        totalManDays = round2(totalManDays + grade.manDays);
        totalOvertimePay = round2(totalOvertimePay + grade.overtimePay);
        totalEmployerPf = round2(totalEmployerPf + grade.employerPf);
        totalEmployerEsi = round2(totalEmployerEsi + grade.employerEsi);

        if (grade.manDays > 0 && dailyRate > 0) {
          lineItems.push({
            description: `${grade.departmentName} / ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel} (${grade.headcount} staff, ${grade.manDays} man-days)`,
            quantity: grade.manDays,
            unitRate: dailyRate,
            amount: round2(grade.manDays * dailyRate),
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'manpower',
          });
        }

        if (grade.overtimePay > 0) {
          lineItems.push({
            description: `Overtime - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.overtimePay,
            amount: grade.overtimePay,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'overtime',
          });
        }

        if (grade.nightAllowance > 0) {
          lineItems.push({
            description: `Night Allowance - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.nightAllowance,
            amount: grade.nightAllowance,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'night_allowance',
          });
        }

        if (grade.punctualityAward > 0) {
          lineItems.push({
            description: `Punctuality Award - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.punctualityAward,
            amount: grade.punctualityAward,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'punctuality_award',
          });
        }
      }
    } else {
      for (const dept of deptAggregates) {
        const dailyRate = this.resolveDeptDailyRate(
          employees,
          dept.departmentId,
          workingDays,
          siteDailyFallback,
        );

        totalManDays = round2(totalManDays + dept.manDays);
        totalOvertimePay = round2(totalOvertimePay + dept.overtimePay);
        totalEmployerPf = round2(totalEmployerPf + dept.employerPf);
        totalEmployerEsi = round2(totalEmployerEsi + dept.employerEsi);

        if (dept.manDays > 0 && dailyRate > 0) {
          const amount = round2(dept.manDays * dailyRate);
          lineItems.push({
            description: `${dept.departmentName} manpower - ${siteName} - ${periodLabel} (${dept.headcount} staff, ${dept.manDays} man-days)`,
            quantity: dept.manDays,
            unitRate: dailyRate,
            amount,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'manpower',
          });
        }

        if (dept.overtimePay > 0) {
          lineItems.push({
            description: `Overtime charges - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.overtimePay,
            amount: dept.overtimePay,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'overtime',
          });
        }

        if (dept.nightAllowance > 0) {
          lineItems.push({
            description: `Night Allowance - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.nightAllowance,
            amount: dept.nightAllowance,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'night_allowance',
          });
        }

        if (dept.punctualityAward > 0) {
          lineItems.push({
            description: `Punctuality Award - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.punctualityAward,
            amount: dept.punctualityAward,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'punctuality_award',
          });
        }
      }
    }

    if (lineItems.length === 0 && employees.length === 0) {
      const headcount = await this.repo.countEmployeesAtSite(siteId);
      const deployedCount = headcount > 0 ? headcount : Number(site.required_headcount) || 0;
      const monthlyRate = toNumber(site.billing_rate_per_month as string | null);
      const dailyRate = toNumber(site.billing_rate_per_day as string | null);
      const unitRate = this.resolveUnitRate(
        monthlyRate > 0 ? monthlyRate : null,
        dailyRate > 0 ? dailyRate : null,
        workingDays,
      );
      if (deployedCount > 0 && unitRate > 0) {
        lineItems.push({
          description: `Manpower services - ${siteName} - ${periodLabel} (${deployedCount} personnel)`,
          quantity: deployedCount,
          unitRate,
          amount: round2(deployedCount * unitRate),
          hsnSacCode: DEFAULT_HSN_SAC,
          category: 'manpower',
        });
      }
    }

    if (totalEmployerPf > 0) {
      lineItems.push({
        description: `Employer PF contribution reimbursement - ${siteName} - ${periodLabel}`,
        quantity: 1,
        unitRate: totalEmployerPf,
        amount: totalEmployerPf,
        hsnSacCode: DEFAULT_HSN_SAC,
        category: 'pf',
      });
    }

    if (totalEmployerEsi > 0) {
      lineItems.push({
        description: `Employer ESIC contribution reimbursement - ${siteName} - ${periodLabel}`,
        quantity: 1,
        unitRate: totalEmployerEsi,
        amount: totalEmployerEsi,
        hsnSacCode: DEFAULT_HSN_SAC,
        category: 'esi',
      });
    }

    const subTotal = round2(lineItems.reduce((sum, item) => sum + item.amount, 0));
    const gstAmount = round2(subTotal * (gstRate / 100));
    const totalAmount = round2(subTotal + gstAmount);
    const alreadyInvoiced = await this.repo.siteInvoiceExists(siteId, month, year);

    return {
      siteId,
      siteName,
      clientId,
      clientName: String(site.company_name),
      month,
      year,
      workingDays,
      employeeCount: employees.length,
      totalManDays,
      totalOvertimeHours: totalOvertimePay,
      totalEmployerPf,
      totalEmployerEsi,
      subTotal,
      gstRate,
      gstAmount,
      totalAmount,
      alreadyInvoiced,
      lineItems,
    };
  }

  async getSuggestedLineItems(
    clientId: string,
    siteId: string,
    month: number,
    year: number,
  ): Promise<SuggestedInvoiceLineItem[]> {
    const site = await this.repo.getSiteForBilling(siteId);
    if (!site || String(site.client_id) !== clientId) {
      throw new NotFoundError('Site', siteId);
    }

    const workingDays = countWorkingDays(year, month);
    const periodLabel = monthName(month, year);
    const siteName = String(site.site_name);
    const employees = await this.repo.getSiteEmployeesBillingData(siteId, month, year);
    const gradeAggregates = aggregateByDesignationGrade(employees, workingDays);
    const deptAggregates = aggregateByDepartment(employees, workingDays);

    const siteDailyFallback = this.resolveDailyRate(
      toNumber(site.billing_rate_per_month as string | null) || null,
      toNumber(site.billing_rate_per_day as string | null) || null,
      workingDays,
    );

    if (gradeAggregates.length > 0) {
      const suggestions: SuggestedInvoiceLineItem[] = [];

      for (const grade of gradeAggregates) {
        const monthlyGross = this.gradeMonthlyGross(employees, grade.designationGradeId);
        const dailyRate = this.resolveGradeDailyRate(
          employees,
          grade.designationGradeId,
          workingDays,
          siteDailyFallback,
        );
        const unitRate = monthlyGross > 0 ? monthlyGross : round2(dailyRate * workingDays);
        if (unitRate <= 0) continue;

        const quantity = grade.headcount > 0 ? grade.headcount : 1;

        suggestions.push({
          departmentId: grade.departmentId,
          departmentName: grade.departmentName,
          description: `${grade.departmentName} / ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
          quantity,
          unitRate,
          ratePerDay: dailyRate > 0 ? dailyRate : null,
          ratePerMonth: monthlyGross > 0 ? monthlyGross : null,
          hsnSacCode: '998519',
        });
      }

      if (suggestions.length > 0) return suggestions;
    }

    if (deptAggregates.length > 0) {
      const suggestions: SuggestedInvoiceLineItem[] = [];

      for (const dept of deptAggregates) {
        const monthlyGross = this.deptMonthlyGross(employees, dept.departmentId);
        const dailyRate = this.resolveDeptDailyRate(
          employees,
          dept.departmentId,
          workingDays,
          siteDailyFallback,
        );
        const unitRate = monthlyGross > 0 ? monthlyGross : round2(dailyRate * workingDays);
        if (unitRate <= 0) continue;

        const quantity = dept.headcount > 0 ? dept.headcount : 1;

        suggestions.push({
          departmentId: dept.departmentId,
          departmentName: dept.departmentName,
          description: `${dept.departmentName} services - ${siteName} - ${periodLabel}`,
          quantity,
          unitRate,
          ratePerDay: dailyRate > 0 ? dailyRate : null,
          ratePerMonth: monthlyGross > 0 ? monthlyGross : null,
          hsnSacCode: '998519',
        });
      }

      if (suggestions.length > 0) return suggestions;
    }

    const headcount = await this.repo.countEmployeesAtSite(siteId);
    const deployedCount = headcount > 0 ? headcount : Number(site.required_headcount) || 0;
    const monthlyRate = toNumber(site.billing_rate_per_month as string | null);
    const dailyRate = toNumber(site.billing_rate_per_day as string | null);
    const unitRate = this.resolveUnitRate(
      monthlyRate > 0 ? monthlyRate : null,
      dailyRate > 0 ? dailyRate : null,
      workingDays,
    );

    if (deployedCount <= 0 || unitRate <= 0) return [];

    return [
      {
        departmentId: '',
        departmentName: 'General',
        description: `Manpower services - ${siteName} - ${periodLabel}`,
        quantity: deployedCount,
        unitRate,
        ratePerDay: dailyRate > 0 ? dailyRate : null,
        ratePerMonth: monthlyRate > 0 ? monthlyRate : null,
        hsnSacCode: '998519',
      },
    ];
  }

  async getInvoiceById(id: string) {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice;
  }

  getInvoicesBySite(
    siteId: string,
    filter: {
      pageSize: number;
      cursor?: string | null;
      direction?: 'next' | 'prev';
      page?: number;
      month?: number;
      year?: number;
    },
  ) {
    return this.repo.findBySite(siteId, filter);
  }

  async createSiteInvoice(input: CreateSiteInvoiceInput) {
    const site = await this.repo.getSiteForBilling(input.siteId);
    if (!site) throw new NotFoundError('Site', input.siteId);

    if (await this.repo.siteInvoiceExists(input.siteId, input.month, input.year)) {
      throw new AppError(409, `Invoice already exists for site ${site.site_name} for ${input.month}/${input.year}.`);
    }

    const result = await this.repo.createInvoice({
      clientId: String(site.client_id),
      siteId: input.siteId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      month: input.month,
      year: input.year,
      gstRate: input.gstRate,
      notes: input.notes ?? null,
      termsAndConditions: input.termsAndConditions ?? null,
      lineItems: input.lineItems,
      createdBy: input.createdBy,
    });

    return { ...result, siteId: input.siteId, siteName: String(site.site_name) };
  }

  async previewSiteInvoice(siteId: string, month: number, year: number, _gstRate = 18) {
    const site = await this.repo.getSiteForBilling(siteId);
    if (!site) throw new NotFoundError('Site', siteId);

    const engineResult = await billingEngineService.calculate({
      clientId: String(site.client_id),
      siteId,
      month,
      year,
      skipValidation: true,
    });

    return this.mapEngineResultToPreview(engineResult);
  }

  private mapEngineResultToPreview(result: BillingEngineResult): InvoicePreviewDto {
    const gstRate =
      result.tax.gstType === 'igst'
        ? result.tax.igstRate
        : round2(result.tax.cgstRate + result.tax.sgstRate);

    return {
      siteId: result.siteId,
      siteName: result.siteName,
      clientId: result.clientId,
      clientName: result.clientName,
      month: result.month,
      year: result.year,
      workingDays: result.workingDays,
      employeeCount: result.employeeCount,
      totalManDays: result.totalManDays,
      totalOvertimeHours: 0,
      totalEmployerPf: result.pfContribution,
      totalEmployerEsi: result.esicContribution,
      subTotal: result.taxableValue,
      gstRate,
      gstAmount: result.tax.gstAmount,
      totalAmount: result.grandTotal,
      alreadyInvoiced: result.alreadyInvoiced,
      lineItems: result.lineItems.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitRate: line.unitRate,
        amount: line.amount,
        hsnSacCode: line.hsnSacCode,
        category: this.mapComponentCategory(line.componentCode),
      })),
    };
  }

  private mapComponentCategory(code: string): InvoicePreviewDto['lineItems'][number]['category'] {
    switch (code) {
      case BILLING_COMPONENT_CODE.PF_CONTRIBUTION:
        return 'pf';
      case BILLING_COMPONENT_CODE.ESIC_CONTRIBUTION:
        return 'esi';
      case BILLING_COMPONENT_CODE.LWF:
        return 'esi';
      default:
        return 'manpower';
    }
  }

  async generateInvoiceForSite(input: GenerateSiteInvoicesInput): Promise<GeneratedSiteInvoice> {
    if (!input.siteId) throw new AppError(400, 'siteId is required for single-site generation.');

    const result = await billingInvoiceService.generateForSite({
      siteId: input.siteId,
      month: input.month,
      year: input.year,
      notes: input.notes,
      skipValidation: false,
      createdBy: input.createdBy,
    });

    return {
      siteId: result.siteId,
      siteName: result.siteName,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      totalAmount: result.totalAmount,
    };
  }

  async updateInvoice(id: string, input: UpdateInvoiceInput) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);
    if (current.isLocked || current.status !== InvoiceStatus.Draft) {
      throw new AppError(400, 'Only draft, unlocked invoices can be edited. Create a revision for generated invoices.');
    }

    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Invoice', id);

    const lineItems = input.lineItems ?? existing.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitRate: item.unitRate,
      hsnSacCode: item.hsnSacCode ?? undefined,
    }));

    const gstRate = input.gstRate ?? existing.gstRate;
    const subTotal = round2(lineItems.reduce((sum, li) => sum + li.quantity * li.unitRate, 0));
    const gstAmount = round2(subTotal * (gstRate / 100));
    const totalAmount = round2(subTotal + gstAmount);

    await this.repo.updateInvoiceRecord(id, {
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      gstRate: input.gstRate,
      subTotal,
      gstAmount,
      totalAmount,
      notes: input.notes,
      termsAndConditions: input.termsAndConditions,
      updatedBy: input.updatedBy,
    });

    if (input.lineItems) {
      await this.repo.replaceLineItems(id, lineItems, input.updatedBy);
    }

    await invoiceAuditRepository.log({
      invoiceId: id,
      action: 'invoice_updated',
      oldValues: {
        subTotal: existing.subTotal,
        gstRate: existing.gstRate,
        totalAmount: existing.totalAmount,
        lineItemCount: existing.lineItems.length,
      },
      newValues: {
        subTotal,
        gstRate,
        totalAmount,
        lineItemCount: lineItems.length,
      },
      createdBy: input.updatedBy,
    });

    return this.getInvoiceById(id);
  }

  async deleteInvoice(id: string, deletedBy: string) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);

    await withTransaction(async (client) => {
      await invoiceAuditRepository.log(
        {
          invoiceId: id,
          action: 'invoice_deleted',
          oldValues: {
            status: current.status,
            statusLabel: STATUS_LABELS[current.status] ?? 'Unknown',
            totalAmount: current.totalAmount,
            paidAmount: current.paidAmount,
            isLocked: current.isLocked,
          },
          newValues: { deleted: true },
          createdBy: deletedBy,
        },
        client,
      );

      await invoicePaymentRepository.softDeleteByInvoiceId(id, deletedBy, client);

      const { rowCount } = await client.query(
        `UPDATE invoices SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
         WHERE id = $1 AND NOT is_deleted`,
        [id, deletedBy],
      );
      if (!rowCount) throw new NotFoundError('Invoice', id);
    });
  }

  async updateInvoiceStatus(id: string, input: UpdateInvoiceStatusInput) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);

    const allowed = ALLOWED_STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new AppError(
        400,
        `Cannot transition from ${STATUS_LABELS[current.status] ?? 'Unknown'} to ${STATUS_LABELS[input.status] ?? 'Unknown'}.`,
      );
    }

    let paidAmount = current.paidAmount;
    if (input.status === InvoiceStatus.Paid) {
      paidAmount = input.paidAmount ?? current.totalAmount;
    } else if (input.status === InvoiceStatus.PartiallyPaid) {
      paidAmount = input.paidAmount ?? current.paidAmount;
      if (paidAmount <= 0 || paidAmount >= current.totalAmount) {
        throw new AppError(400, 'Partially paid status requires a paid amount between 0 and total.');
      }
    } else if (input.status === InvoiceStatus.Cancelled || input.status === InvoiceStatus.Sent) {
      paidAmount = input.paidAmount ?? current.paidAmount;
    }

    await this.repo.updateInvoiceStatusRecord(id, input.status, paidAmount, input.updatedBy);
    await this.repo.logStatusEvent(id, current.status, input.status, input.note ?? null, input.updatedBy);

    await invoiceAuditRepository.log({
      invoiceId: id,
      action: 'invoice_status_changed',
      oldValues: { status: current.status, paidAmount: current.paidAmount },
      newValues: { status: input.status, paidAmount, note: input.note ?? null },
      createdBy: input.updatedBy,
    });

    return this.getInvoiceById(id);
  }

  async generateInvoicesBySites(input: GenerateSiteInvoicesInput): Promise<{
    generated: number;
    skipped: number;
    invoices: GeneratedSiteInvoice[];
  }> {
    if (input.siteId) {
      const invoice = await this.generateInvoiceForSite(input);
      return { generated: 1, skipped: 0, invoices: [invoice] };
    }

    const sites = await this.repo.getActiveSites(input.siteIds);

    const invoices: GeneratedSiteInvoice[] = [];
    let skipped = 0;

    for (const site of sites) {
      const siteId = String(site.id);

      if (await this.repo.siteInvoiceExists(siteId, input.month, input.year)) {
        skipped++;
        continue;
      }

      try {
        const result = await billingInvoiceService.generateForSite({
          siteId,
          month: input.month,
          year: input.year,
          notes: input.notes,
          skipValidation: false,
          createdBy: input.createdBy,
        });

        invoices.push({
          siteId: result.siteId,
          siteName: result.siteName,
          invoiceId: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          totalAmount: result.totalAmount,
        });
      } catch {
        skipped++;
      }
    }

    return { generated: invoices.length, skipped, invoices };
  }
}

export const billingService = new BillingService();

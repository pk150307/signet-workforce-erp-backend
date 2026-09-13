import {
  buildConfigSnapshot,
  calculateEarningBasic,
  calculateEarningHra,
  calculateEpf,
  calculateEsic,
  calculateFixedTotal,
  calculateGrossEarnings,
  calculateGrossTotal,
  calculateLwf,
  calculateMonthDays,
  calculateNetPay,
  calculateSalaryRow,
  calculateTotalDeduction,
  DEFAULT_SALARY_STATUTORY_CONFIG,
  getOtAmountFromAttendance,
  normalizeSalaryStatutoryConfig,
} from '../modules/salary-register/salary-register.calculation';
import {
  computeEmployeeEsi,
  computeEmployeeLwf,
  computeEmployeePf,
  computeEsiGrossEarned,
  computeStatutoryGrossEarned,
  resolveStatutoryConfig,
} from '../modules/statutory/statutory.calculation';

describe('salary-register.calculation', () => {
  const config = { ...DEFAULT_SALARY_STATUTORY_CONFIG };

  describe('month days', () => {
    it('returns calendar days for each month', () => {
      expect(calculateMonthDays(2026, 1)).toBe(31);
      expect(calculateMonthDays(2026, 2)).toBe(28);
      expect(calculateMonthDays(2026, 4)).toBe(30);
      expect(calculateMonthDays(2026, 8)).toBe(31);
    });
  });

  describe('pro-rata earnings', () => {
    it('31 month days / 29 pay days', () => {
      expect(calculateEarningBasic(15221, 29, 31)).toBe(14239);
      expect(calculateEarningHra(1000, 29, 31)).toBe(935);
    });

    it('30 month days / 30 pay days', () => {
      expect(calculateEarningBasic(15000, 30, 30)).toBe(15000);
      expect(calculateEarningHra(1000, 30, 30)).toBe(1000);
    });

    it('28 month days / 20 pay days', () => {
      expect(calculateEarningBasic(14000, 20, 28)).toBe(10000);
      expect(calculateEarningHra(2800, 20, 28)).toBe(2000);
    });
  });

  describe('fixed total', () => {
    it('sums basic + hra', () => {
      expect(calculateFixedTotal(15221, 1000)).toBe(16221);
    });
  });

  describe('OT amount — attendance source of truth (mandatory)', () => {
    it('uses attendance OT amount and ignores OT hours entirely', () => {
      const otHours = 80;
      const attendanceOtAmount = 4500;
      const otAmount = getOtAmountFromAttendance(attendanceOtAmount);

      expect(otAmount).toBe(4500);

      const row = calculateSalaryRow({
        monthDays: 31,
        payDays: 29,
        basic: 15221,
        hra: 1000,
        otAmount: attendanceOtAmount,
        nAll: 0,
        attAwAfd: 0,
        pfEligible: true,
        esiEligible: true,
        lwfEligible: true,
        config,
      });

      expect(row.otAmount).toBe(4500);
      expect(otHours).toBe(80);
      expect(row.otAmount).not.toBe(Math.round((16221 / 31 / 8) * otHours));
    });

    it('does not recalculate OT from hours even when OT basis would change Excel result', () => {
      const attendanceOtAmount = 2000;
      const row = calculateSalaryRow({
        monthDays: 31,
        payDays: 29,
        basic: 15221,
        hra: 1000,
        otAmount: attendanceOtAmount,
        nAll: 600,
        attAwAfd: 400,
        pfEligible: true,
        esiEligible: true,
        lwfEligible: true,
        config,
      });
      expect(row.otAmount).toBe(2000);
    });
  });

  describe('gross / net — statutory synced with payslip', () => {
    it('matches payslip PF/ESI/LWF for the same wage bases', () => {
      const row = calculateSalaryRow({
        monthDays: 31,
        payDays: 29,
        basic: 15221,
        hra: 1000,
        otAmount: 2000,
        nAll: 600,
        attAwAfd: 400,
        bonus: 100,
        pfEligible: true,
        esiEligible: true,
        lwfEligible: true,
        config,
      });

      const statutory = resolveStatutoryConfig(null, {
        employee_pf_percentage: config.employeePfPercentage,
        employee_esi_percentage: config.employeeEsiPercentage,
        employee_lwf_percentage: config.employeeLwfPercentage,
        employee_pf_max_amount: config.employeePfMaxAmount,
        employee_esi_max_amount: config.employeeEsiMaxAmount,
        employee_lwf_max_amount: config.employeeLwfMaxAmount,
      });

      const esiGross = computeEsiGrossEarned(row.earningBasic, row.earningHra, row.nAll, row.otAmount);
      const lwfGross = computeStatutoryGrossEarned(
        row.earningBasic,
        row.earningHra,
        row.nAll,
        row.attAwAfd,
        row.otAmount,
        100,
      );

      expect(row.earningBasic).toBe(14239);
      expect(row.earningHra).toBe(935);
      expect(row.otAmount).toBe(2000);
      expect(row.grossEarnings).toBe(14239 + 935 + 2000 + 600);
      expect(row.grossTotal).toBe(row.grossEarnings + 400);
      expect(row.epf).toBe(computeEmployeePf(row.earningBasic, statutory));
      expect(row.esic).toBe(computeEmployeeEsi(esiGross, row.fixedTotal, statutory));
      expect(row.lwf).toBe(computeEmployeeLwf(lwfGross, statutory));
      // LWF includes punctuality (+ bonus); must not equal rate% of grossEarnings alone
      expect(row.lwf).not.toBe(Math.min(Math.round(row.grossEarnings * 0.002), 300));
      expect(row.totalDeduction).toBe(row.esic + row.epf + row.lwf);
      expect(row.netPay).toBe(row.grossTotal - row.totalDeduction);
    });
  });

  describe('EPF', () => {
    it('returns 0 when not eligible', () => {
      expect(calculateEpf(15000, false, config)).toBe(0);
    });

    it('applies contribution max (₹1800)', () => {
      expect(calculateEpf(20000, true, config)).toBe(1800);
    });

    it('uses rate of earning basic under the max', () => {
      expect(calculateEpf(10000, true, config)).toBe(1200);
    });
  });

  describe('ESIC', () => {
    it('returns 0 when not eligible', () => {
      expect(calculateEsic(15000, 1000, 0, 0, 16000, false, config)).toBe(0);
    });

    it('applies rate on ESI gross (basic+hra+night+OT)', () => {
      expect(calculateEsic(10000, 2000, 500, 500, 12000, true, config)).toBe(98);
    });

    it('returns 0 when monthly gross above ₹21,000 ceiling', () => {
      expect(calculateEsic(20000, 5000, 0, 0, 25000, true, config)).toBe(0);
    });
  });

  describe('LWF', () => {
    it('returns 0 when not eligible', () => {
      expect(calculateLwf(10000, 2000, 0, 0, 0, 0, false, config)).toBe(0);
    });

    it('applies default ₹35 cap (same as payslip)', () => {
      expect(calculateLwf(20000, 5000, 1000, 1000, 2000, 0, true, config)).toBe(35);
    });

    it('includes punctuality in wage base like payslip', () => {
      const withoutPa = calculateLwf(10000, 0, 0, 0, 0, 0, true, {
        ...config,
        employeeLwfMaxAmount: 0,
      });
      const withPa = calculateLwf(10000, 0, 0, 5000, 0, 0, true, {
        ...config,
        employeeLwfMaxAmount: 0,
      });
      expect(withPa).toBeGreaterThan(withoutPa);
    });
  });

  describe('deductions and net', () => {
    it('sums deductions', () => {
      expect(calculateTotalDeduction(10, 20, 30)).toBe(60);
    });

    it('computes net pay', () => {
      expect(calculateNetPay(1000, 250)).toBe(750);
    });

    it('sums gross earnings components', () => {
      expect(calculateGrossEarnings(100, 20, 30, 40)).toBe(190);
      expect(calculateGrossTotal(190, 10)).toBe(200);
    });
  });

  describe('config snapshot', () => {
    it('uses payslip-compatible percentage defaults', () => {
      const snap = buildConfigSnapshot({
        employeePfPercentage: 12,
        employeeEsiPercentage: 0.75,
        employeeLwfPercentage: 0.2,
        employeePfMaxAmount: 1800,
        employeeLwfMaxAmount: 35,
      });
      expect(snap.employeePfPercentage).toBe(12);
      expect(snap.employeeEsiPercentage).toBe(0.75);
      expect(snap.employeeLwfPercentage).toBe(0.2);
      expect(snap.employeePfMaxAmount).toBe(1800);
      expect(snap.employeeLwfMaxAmount).toBe(35);
    });

    it('normalizes legacy decimal-rate snapshots', () => {
      const snap = normalizeSalaryStatutoryConfig({
        epfRate: 0.12,
        esicRate: 0.0075,
        lwfRate: 0.002,
        lwfCap: 300,
        pfWageCeiling: 15000,
        esicCeiling: null,
      });
      expect(snap.employeePfPercentage).toBe(12);
      expect(snap.employeeEsiPercentage).toBe(0.75);
      expect(snap.employeeLwfPercentage).toBe(0.2);
      expect(snap.employeePfMaxAmount).toBe(1800);
      expect(snap.employeeLwfMaxAmount).toBe(300);
    });
  });
});

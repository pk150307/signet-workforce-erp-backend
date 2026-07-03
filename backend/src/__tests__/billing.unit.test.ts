import { amountInWords } from '../utils/amount-in-words';
import {
  formatFyShort,
  formatInvoiceNumber,
  resolveFinancialYear,
} from '../modules/billing/invoice-series.service';

describe('billing unit helpers', () => {
  describe('resolveFinancialYear', () => {
    it('uses same calendar year start for April–December', () => {
      expect(resolveFinancialYear(6, 2026)).toEqual({ start: 2026, end: 2027 });
      expect(resolveFinancialYear(4, 2025)).toEqual({ start: 2025, end: 2026 });
    });

    it('uses previous year start for January–March', () => {
      expect(resolveFinancialYear(1, 2026)).toEqual({ start: 2025, end: 2026 });
      expect(resolveFinancialYear(3, 2026)).toEqual({ start: 2025, end: 2026 });
    });
  });

  describe('formatFyShort', () => {
    it('formats two-digit FY range', () => {
      expect(formatFyShort(2026, 2027)).toBe('26-27');
    });
  });

  describe('formatInvoiceNumber', () => {
    it('replaces template placeholders', () => {
      const number = formatInvoiceNumber('{seq}/{fy_short}', 44, null, 2026, 2027);
      expect(number).toBe('44/26-27');
    });

    it('applies prefix when provided', () => {
      const number = formatInvoiceNumber('{prefix}{seq}', 7, 'INV', 2026, 2027);
      expect(number).toBe('INV7');
    });
  });

  describe('amountInWords', () => {
    it('converts whole rupees', () => {
      expect(amountInWords(100000)).toBe('Rupees One Lakh Only');
    });

    it('includes paise when present', () => {
      expect(amountInWords(1234.56)).toBe('Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only');
    });

    it('handles zero', () => {
      expect(amountInWords(0)).toBe('Rupees Zero Only');
    });
  });
});

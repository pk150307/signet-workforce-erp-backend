import { resolveReportBounds } from '../modules/reports/reports.repository';

describe('resolveReportBounds', () => {
  it('returns no dates when month and year are omitted', () => {
    expect(resolveReportBounds({})).toEqual({});
  });

  it('uses the full year when only year is provided', () => {
    expect(resolveReportBounds({ year: 2026 })).toEqual({
      year: 2026,
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
  });

  it('uses the selected month when both month and year are provided', () => {
    expect(resolveReportBounds({ month: 2, year: 2024 })).toEqual({
      month: 2,
      year: 2024,
      fromDate: '2024-02-01',
      toDate: '2024-02-29',
    });
  });
});

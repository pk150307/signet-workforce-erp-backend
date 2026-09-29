import { formatDate, formatPersonName } from '../utils/formatters';

describe('formatDate', () => {
  it('keeps YYYY-MM-DD strings unchanged', () => {
    expect(formatDate('2001-01-01')).toBe('2001-01-01');
    expect(formatDate('2001-01-01T00:00:00')).toBe('2001-01-01');
    expect(formatDate('2001-01-01T18:30:00.000Z')).toBe('2001-01-01');
  });

  it('does not shift midnight UTC calendar dates', () => {
    expect(formatDate(new Date('2001-01-01T00:00:00.000Z'))).toBe('2001-01-01');
  });

  it('uses local calendar parts for local midnight dates', () => {
    expect(formatDate(new Date(2001, 0, 1))).toBe('2001-01-01');
  });
});

describe('formatPersonName', () => {
  it('joins first and last name when both are present', () => {
    expect(formatPersonName('Piyush', 'Kumar')).toBe('Piyush Kumar');
  });

  it('returns first name only when last name is blank', () => {
    expect(formatPersonName('Piyush', '')).toBe('Piyush');
    expect(formatPersonName('Piyush', '   ')).toBe('Piyush');
    expect(formatPersonName('Piyush', null)).toBe('Piyush');
  });
});

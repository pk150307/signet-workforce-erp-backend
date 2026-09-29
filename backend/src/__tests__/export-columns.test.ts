import {
  applyExportColumnSelection,
  parseExportColumnQuery,
  resolveExportColumns,
} from '../utils/export-columns';

const CATALOG = [
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'softCode', label: 'Soft Code' },
  { key: 'ifscCode', label: 'IFSC' },
] as const;

describe('parseExportColumnQuery', () => {
  it('splits comma-separated values', () => {
    expect(parseExportColumnQuery('employeeCode,softCode')).toEqual(['employeeCode', 'softCode']);
  });

  it('returns undefined for empty input', () => {
    expect(parseExportColumnQuery('')).toBeUndefined();
    expect(parseExportColumnQuery(undefined)).toBeUndefined();
  });
});

describe('resolveExportColumns', () => {
  it('returns the full catalog when nothing is requested', () => {
    expect(resolveExportColumns(CATALOG).map((column) => column.key)).toEqual([
      'employeeCode',
      'softCode',
      'ifscCode',
    ]);
  });

  it('keeps catalog order for selected keys', () => {
    expect(resolveExportColumns(CATALOG, ['ifscCode', 'employeeCode']).map((column) => column.key))
      .toEqual(['employeeCode', 'ifscCode']);
  });
});

describe('applyExportColumnSelection', () => {
  it('projects rows and PDF omit headers to the selected columns', () => {
    const result = applyExportColumnSelection(
      CATALOG,
      ['softCode', 'ifscCode'],
      [['SIG-1', 'SC-1', 'SBIN0001']],
      ['IFSC'],
    );

    expect(result.headers).toEqual(['Soft Code', 'IFSC']);
    expect(result.rows).toEqual([['SC-1', 'SBIN0001']]);
    expect(result.omitHeaders).toEqual(['IFSC']);
  });
});

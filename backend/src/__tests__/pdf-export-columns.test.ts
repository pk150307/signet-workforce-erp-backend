import { omitExportColumns } from '../utils/pdf-export';

describe('omitExportColumns', () => {
  it('drops named headers and matching cells', () => {
    const result = omitExportColumns(
      ['Employee Code', 'Name', 'Status', 'Effective Date'],
      [
        ['SIG-1', 'Aman Kumar', 'Active', '2026-01-01'],
        ['SIG-2', 'Suresh', 'Active', ''],
      ],
      ['Status', 'Effective Date'],
    );

    expect(result.headers).toEqual(['Employee Code', 'Name']);
    expect(result.rows).toEqual([
      ['SIG-1', 'Aman Kumar'],
      ['SIG-2', 'Suresh'],
    ]);
  });
});

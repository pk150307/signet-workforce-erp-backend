import { executeBatchInsert } from '../utils/batch-insert';

describe('executeBatchInsert', () => {
  it('does nothing for an empty row set', async () => {
    const queryFn = jest.fn();
    await executeBatchInsert(queryFn, 'INSERT INTO t (a) VALUES', []);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('chunks rows and remaps placeholders', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queryFn = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
    };

    await executeBatchInsert(
      queryFn,
      'INSERT INTO t (a, b) VALUES',
      [
        [1, 'x'],
        [2, 'y'],
        [3, 'z'],
      ],
      { chunkSize: 2, casts: { 2: '::text' }, suffix: 'ON CONFLICT DO NOTHING' },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('($1,$2::text),($3,$4::text)');
    expect(calls[0].sql).toContain('ON CONFLICT DO NOTHING');
    expect(calls[0].params).toEqual([1, 'x', 2, 'y']);
    expect(calls[1].params).toEqual([3, 'z']);
  });
});

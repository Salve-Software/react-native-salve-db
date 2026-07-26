import { mapQueryResultToRows } from '../mapQueryResultToRows';

describe('mapQueryResultToRows', () => {
  test('zips columns with each row into a plain object', () => {
    const rows = mapQueryResultToRows({
      columns: ['id', 'name'],
      rows: [
        [1, 'Ana'],
        [2, 'Bruno'],
      ],
    });

    expect(rows).toEqual([
      { id: 1, name: 'Ana' },
      { id: 2, name: 'Bruno' },
    ]);
  });

  test('empty result produces an empty array', () => {
    expect(mapQueryResultToRows({ columns: ['id'], rows: [] })).toEqual([]);
  });

  test('null cells map to null values', () => {
    const rows = mapQueryResultToRows({ columns: ['id', 'deletedAt'], rows: [[1, null]] });
    expect(rows).toEqual([{ id: 1, deletedAt: null }]);
  });
});

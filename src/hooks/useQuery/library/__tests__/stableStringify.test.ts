import { stableStringify } from '../stableStringify';

describe('stableStringify', () => {
  test('produces the same string for objects with the same keys in a different order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  test('produces different strings for objects with different values', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });

  test('preserves array order', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  test('sorts keys recursively in nested objects', () => {
    const a = { outer: { z: 1, a: 2 } };
    const b = { outer: { a: 2, z: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  test('is stable for primitives and matches JSON.stringify', () => {
    expect(stableStringify('active')).toBe(JSON.stringify('active'));
    expect(stableStringify(10)).toBe(JSON.stringify(10));
    expect(stableStringify(null)).toBe(JSON.stringify(null));
  });

  test('rejects bigint values instead of throwing JSON.stringify\'s opaque error', () => {
    expect(() => stableStringify([1n])).toThrow(/bigint/);
  });

  test('rejects NaN and Infinity instead of silently collapsing them to null', () => {
    expect(() => stableStringify([NaN])).toThrow(/non-finite/);
    expect(() => stableStringify([Infinity])).toThrow(/non-finite/);
    expect(() => stableStringify([-Infinity])).toThrow(/non-finite/);
  });

  test('rejects Map and Set instead of silently serializing them as {}', () => {
    expect(() => stableStringify([new Map([['a', 1]])])).toThrow(/Map/);
    expect(() => stableStringify([new Set([1, 2])])).toThrow(/Set/);
  });

  test('rejects functions and symbols', () => {
    expect(() => stableStringify([() => {}])).toThrow(/function/);
    expect(() => stableStringify([Symbol('x')])).toThrow(/symbol/);
  });

  test('rejects undefined instead of silently coercing it to null', () => {
    expect(() => stableStringify([undefined])).toThrow(/undefined/);
    expect(() => stableStringify({ a: undefined })).toThrow(/undefined/);
  });
});

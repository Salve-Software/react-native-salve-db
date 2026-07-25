import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asObject, optionalNumber, optionalString, requireNumber, requireString } from '../validation';

describe('asObject', () => {
  it('accepts a plain object', () => {
    assert.deepEqual(asObject({ a: 1 }), { a: 1 });
  });

  it('rejects null, arrays, and primitives', () => {
    assert.equal(asObject(null), null);
    assert.equal(asObject([1, 2]), null);
    assert.equal(asObject('x'), null);
    assert.equal(asObject(42), null);
    assert.equal(asObject(undefined), null);
  });
});

describe('requireString', () => {
  it('accepts a non-empty string', () => {
    const result = requireString({ name: 'Ana' }, 'name');
    assert.deepEqual(result, { ok: true, value: 'Ana' });
  });

  it('rejects a missing field', () => {
    const result = requireString({}, 'name');
    assert.equal(result.ok, false);
  });

  it('rejects an empty/whitespace-only string', () => {
    assert.equal(requireString({ name: '' }, 'name').ok, false);
    assert.equal(requireString({ name: '   ' }, 'name').ok, false);
  });

  it('rejects a wrong-typed value', () => {
    assert.equal(requireString({ name: 42 }, 'name').ok, false);
  });
});

describe('requireNumber', () => {
  it('accepts a finite number', () => {
    const result = requireNumber({ price: 9.99 }, 'price');
    assert.deepEqual(result, { ok: true, value: 9.99 });
  });

  it('rejects a non-number', () => {
    assert.equal(requireNumber({ price: '9.99' }, 'price').ok, false);
  });

  it('rejects NaN/Infinity', () => {
    assert.equal(requireNumber({ price: NaN }, 'price').ok, false);
    assert.equal(requireNumber({ price: Infinity }, 'price').ok, false);
  });

  it('enforces an inclusive min', () => {
    assert.equal(requireNumber({ price: 0 }, 'price', { min: 0 }).ok, true);
    assert.equal(requireNumber({ price: -1 }, 'price', { min: 0 }).ok, false);
  });
});

describe('optionalString / optionalNumber', () => {
  it('succeeds with undefined when the field is absent', () => {
    assert.deepEqual(optionalString({}, 'name'), { ok: true, value: undefined });
    assert.deepEqual(optionalNumber({}, 'price'), { ok: true, value: undefined });
  });

  it('validates the field when present', () => {
    assert.equal(optionalString({ name: 1 }, 'name').ok, false);
    assert.equal(optionalNumber({ price: 'x' }, 'price').ok, false);
    assert.deepEqual(optionalString({ name: 'Ana' }, 'name'), { ok: true, value: 'Ana' });
  });
});

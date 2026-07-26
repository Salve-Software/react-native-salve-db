import type { IResourceBase, WritableFields } from '../rest/types';
import { asObject, fail, ok, optionalNumber, optionalString, requireNumber, requireString, type ParseResult } from '../rest/validation';

export interface IProduct extends IResourceBase {
  name: string;
  price: number;
}

type IProductFields = WritableFields<IProduct>;

export function parseCreateProduct(body: unknown): ParseResult<IProductFields> {
  const source = asObject(body);
  if (source === null) return fail('Body must be a JSON object');

  const name = requireString(source, 'name');
  if (!name.ok) return fail(name.error);

  const price = requireNumber(source, 'price', { min: 0 });
  if (!price.ok) return fail(price.error);

  return ok({ name: name.value, price: price.value });
}

export function parsePatchProduct(body: unknown): ParseResult<Partial<IProductFields>> {
  const source = asObject(body);
  if (source === null) return fail('Body must be a JSON object');

  const name = optionalString(source, 'name');
  if (!name.ok) return fail(name.error);

  const price = optionalNumber(source, 'price', { min: 0 });
  if (!price.ok) return fail(price.error);

  const patch: Partial<IProductFields> = {};
  if (name.value !== undefined) patch.name = name.value;
  if (price.value !== undefined) patch.price = price.value;

  return ok(patch);
}

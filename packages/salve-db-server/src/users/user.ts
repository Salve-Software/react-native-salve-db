import type { IResourceBase, WritableFields } from '../rest/types';
import { asObject, fail, ok, optionalString, requireString, type ParseResult } from '../rest/validation';

export interface IUser extends IResourceBase {
  name: string;
  email: string;
}

type IUserFields = WritableFields<IUser>;

export function parseCreateUser(body: unknown): ParseResult<IUserFields> {
  const source = asObject(body);
  if (source === null) return fail('Body must be a JSON object');

  const name = requireString(source, 'name');
  if (!name.ok) return fail(name.error);

  const email = requireString(source, 'email');
  if (!email.ok) return fail(email.error);

  return ok({ name: name.value, email: email.value });
}

export function parsePatchUser(body: unknown): ParseResult<Partial<IUserFields>> {
  const source = asObject(body);
  if (source === null) return fail('Body must be a JSON object');

  const name = optionalString(source, 'name');
  if (!name.ok) return fail(name.error);

  const email = optionalString(source, 'email');
  if (!email.ok) return fail(email.error);

  const patch: Partial<IUserFields> = {};
  if (name.value !== undefined) patch.name = name.value;
  if (email.value !== undefined) patch.email = email.value;

  return ok(patch);
}

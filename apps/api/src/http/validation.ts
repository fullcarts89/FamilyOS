import type { z } from 'zod';
import { ApiError, notFound } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed IDs get the same 404 as unknown ones, so probing reveals nothing. */
export function uuidParam(value: string | undefined): string {
  if (!value || !UUID.test(value)) throw notFound();
  return value.toLowerCase();
}

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  const parsed = schema.safeParse(raw);
  // Field names only: the rejected values may be household content.
  if (!parsed.success) throw new ApiError(422, 'invalid_body');
  return parsed.data;
}

/** Like parseBody, but an empty body counts as `{}` (for actions whose fields are all optional). */
export async function parseOptionalBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, 'invalid_json');
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(422, 'invalid_body');
  return parsed.data;
}

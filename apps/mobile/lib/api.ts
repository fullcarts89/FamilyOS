import { config } from './config';
import { supabase } from './supabase';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

/** Calls the FamilyOS API with the current session token. The app never queries the database directly. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiRequestError(401, 'unauthenticated');
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiRequestError(res.status, payload.error ?? 'request_failed');
  return payload as T;
}

export interface MyHousehold {
  id: string;
  name: string;
  memberId: string;
  role: 'owner' | 'adult' | 'caregiver';
}

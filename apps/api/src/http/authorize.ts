import { can, type Action } from '@familyos/domain';
import type { Context } from 'hono';
import type { AppEnv } from './env';
import { forbidden } from './errors';

/** Role check for the current member. Runs after row-level security has already scoped the request. */
export function authorize(c: Context<AppEnv>, action: Action): void {
  if (!can(c.get('member').role, action)) throw forbidden();
}

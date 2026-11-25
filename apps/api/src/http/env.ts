import type { FetchPolicy } from '@familyos/calendar';
import type { Database } from '@familyos/db';
import type { MemberRole } from '@familyos/domain';
import type { Kysely, Transaction } from 'kysely';
import type { AuthAdmin } from '../auth/admin';
import type { AuthenticatedUser, TokenVerifier } from '../auth/verify';
import type { Logger } from '../logger';

export interface Deps {
  db: Kysely<Database>;
  verifyToken: TokenVerifier;
  authAdmin: AuthAdmin;
  logger: Logger;
  inviteLinkBase: string;
  /** Browser origins allowed by CORS; empty means none. */
  corsOrigins?: string[];
  now?: () => Date;
  /** Encrypts calendar subscription addresses (CALENDAR_ENCRYPTION_KEY); calendars are off without it. */
  calendarKey?: Buffer;
  /** How calendars are fetched; tests point it at a local server. */
  calendarFetchPolicy?: FetchPolicy;
  /** Deployed commit, shown by the health checks so a rollback can be confirmed. */
  version?: string;
}

export interface CurrentMember {
  id: string;
  role: MemberRole;
  householdId: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    user: AuthenticatedUser;
    trx: Transaction<Database>;
    member: CurrentMember;
    /** The Monarch sync key's row, on `/sync/monarch` requests. */
    syncId: string;
  };
}

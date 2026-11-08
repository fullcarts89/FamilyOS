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
  };
}

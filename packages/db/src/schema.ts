import type { ColumnType, Generated } from 'kysely';
import type { MemberRole, WorkItemStatus } from '@familyos/domain';

/** Kysely table types for schema `app` (migrations in supabase/migrations). */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<
  Record<string, unknown>,
  Record<string, unknown> | undefined,
  Record<string, unknown>
>;

export type { MemberRole };
export type MemberStatus = 'active' | 'removed';
export type Visibility = 'household' | 'private';
export type WorkItemType = 'task' | 'project' | 'routine' | 'issue';
export type SourceKind = 'text' | 'photo' | 'document' | 'email';
export type AuditEntityType = 'household' | 'member' | 'invite' | 'work_item' | 'source';

export interface SchemaInfoTable {
  key: string;
  value: string;
}

export interface HouseholdTable {
  id: Generated<string>;
  name: string;
  timezone: Generated<string>;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MemberTable {
  id: Generated<string>;
  household_id: string;
  user_id: string | null;
  display_name: string;
  role: MemberRole;
  status: Generated<MemberStatus>;
  created_at: Timestamp;
  removed_at: Timestamp | null;
}

export interface InviteTable {
  id: Generated<string>;
  household_id: string;
  email: string;
  role: Extract<MemberRole, 'adult' | 'caregiver'>;
  token_hash: Buffer;
  invited_by_member_id: string;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  accepted_member_id: string | null;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SourceTable {
  id: Generated<string>;
  household_id: string;
  kind: SourceKind;
  storage_ref: string | null;
  provenance: Json;
  created_by_member_id: string;
  created_at: Timestamp;
}

export interface WorkItemTable {
  id: Generated<string>;
  household_id: string;
  type: Generated<WorkItemType>;
  title: string;
  description: string | null;
  status: Generated<WorkItemStatus>;
  owner_member_id: string | null;
  due_at: Timestamp | null;
  priority: number | null;
  visibility: Generated<Visibility>;
  created_by_member_id: string;
  source_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditEventTable {
  id: Generated<string>;
  household_id: string;
  actor_member_id: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: string;
  payload: Json;
  request_id: string | null;
  created_at: Timestamp;
}

export interface Database {
  'app.schema_info': SchemaInfoTable;
  'app.household': HouseholdTable;
  'app.member': MemberTable;
  'app.invite': InviteTable;
  'app.source': SourceTable;
  'app.work_item': WorkItemTable;
  'app.audit_event': AuditEventTable;
}

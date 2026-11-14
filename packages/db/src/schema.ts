import type { ColumnType, Generated } from 'kysely';
import type { MemberRole, RecurrenceRule, WorkItemStatus } from '@familyos/domain';

/** Kysely table types for schema `app` (migrations in supabase/migrations). */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
/** A DATE column: read as YYYY-MM-DD (see client.ts), never shifted through a timezone. */
type LocalDate = ColumnType<string, string, string>;
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
export type AuditEntityType =
  'household' | 'member' | 'invite' | 'work_item' | 'source' | 'comment';

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
  /** 'owner' only for the invite created with a new household, which has no inviter. */
  role: Extract<MemberRole, 'owner' | 'adult' | 'caregiver'>;
  token_hash: Buffer;
  invited_by_member_id: string | null;
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
  /** All-day due date in the household's timezone. Exclusive with due_at. */
  due_on: ColumnType<string | null, string | null | undefined, string | null>;
  parent_id: string | null;
  priority: number | null;
  visibility: Generated<Visibility>;
  created_by_member_id: string;
  source_id: string | null;
  /** Set on routine occurrences: the rule and the occurrence's place in the series. */
  recurrence_rule_id: string | null;
  occurrence_index: number | null;
  occurrence_on: ColumnType<string | null, string | null | undefined, string | null>;
  completed_at: Timestamp | null;
  completed_by_member_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RecurrenceRuleTable {
  id: Generated<string>;
  household_id: string;
  routine_id: string;
  rule: ColumnType<RecurrenceRule, RecurrenceRule, RecurrenceRule>;
  timezone: string;
  start_on: LocalDate;
  /** HH:MM:SS local wall-clock time, or null for all-day. */
  local_time: string | null;
  rotation: ColumnType<string[], string[] | undefined, string[]>;
  paused_at: Timestamp | null;
  generate_from: LocalDate;
  materialized_through: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OccurrenceExceptionTable {
  id: Generated<string>;
  household_id: string;
  recurrence_rule_id: string;
  occurrence_index: number;
  kind: 'skip' | 'owner';
  reason: 'member' | 'paused' | null;
  owner_member_id: string | null;
  created_by_member_id: string | null;
  created_at: Timestamp;
}

export interface CommentTable {
  id: Generated<string>;
  household_id: string;
  work_item_id: string;
  author_member_id: string;
  body: string;
  created_at: Timestamp;
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

export interface ServiceHeartbeatTable {
  service: 'worker';
  seen_at: Timestamp;
}

export interface Database {
  'app.schema_info': SchemaInfoTable;
  'app.household': HouseholdTable;
  'app.member': MemberTable;
  'app.invite': InviteTable;
  'app.source': SourceTable;
  'app.work_item': WorkItemTable;
  'app.recurrence_rule': RecurrenceRuleTable;
  'app.occurrence_exception': OccurrenceExceptionTable;
  'app.comment': CommentTable;
  'app.audit_event': AuditEventTable;
  'app.service_heartbeat': ServiceHeartbeatTable;
}

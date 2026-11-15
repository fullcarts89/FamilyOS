import type { ColumnType, Generated } from 'kysely';
import type {
  CalendarRule,
  CareAction,
  EventKind,
  MemberRole,
  RecurrenceRule,
  WorkItemStatus,
} from '@familyos/domain';

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
  | 'household'
  | 'member'
  | 'invite'
  | 'work_item'
  | 'source'
  | 'comment'
  | 'event'
  | 'calendar'
  | 'contact'
  | 'decision'
  | 'meal'
  | 'grocery_item'
  | 'weekly_plan'
  | 'budget';

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
  /** #RRGGBB, uppercase. Assigned from the palette on insert when not given. */
  color: ColumnType<string, string | undefined, string>;
  /** Pets only, e.g. 'Dog'. */
  species: string | null;
  note: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  /** The child or pet the item is about ("Biscuit's flea meds"). */
  subject_member_id: string | null;
  /** The contact it involves ("plumber" on the renovation). */
  contact_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** The status it had when it was finished, so undoing the completion restores it. */
  completed_from_status: ColumnType<
    WorkItemStatus | null,
    WorkItemStatus | null | undefined,
    WorkItemStatus | null
  >;
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

export interface EventTable {
  id: Generated<string>;
  household_id: string;
  title: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  all_day: Generated<boolean>;
  location: string | null;
  notes: string | null;
  kind: Generated<EventKind>;
  recurrence: ColumnType<CalendarRule | null, CalendarRule | null | undefined, CalendarRule | null>;
  recurs_until: ColumnType<string | null, string | null | undefined, string | null>;
  timezone: string;
  care_member_id: string | null;
  care_action: CareAction | null;
  care_place: string | null;
  /** Imported occurrences: the calendar, the event's UID and its RECURRENCE-ID (or 'single'). */
  source_calendar_id: ColumnType<string | null, string | null | undefined, string | null>;
  external_uid: ColumnType<string | null, string | null | undefined, string | null>;
  external_recurrence_id: ColumnType<string | null, string | null | undefined, string | null>;
  created_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type CalendarStatus = 'pending' | 'ok' | 'error';

export interface CalendarSourceTable {
  id: Generated<string>;
  household_id: string;
  member_id: string;
  label: string;
  /** AES-256-GCM ciphertext (with tag) of the ICS address; the key never reaches the database. */
  url_ciphertext: Buffer;
  url_nonce: Buffer;
  url_hint: string;
  color: string | null;
  status: Generated<CalendarStatus>;
  last_synced_at: Timestamp | null;
  last_error_code: string | null;
  created_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EventMemberTable {
  household_id: string;
  event_id: string;
  member_id: string;
}

export interface EventExceptionTable {
  id: Generated<string>;
  household_id: string;
  event_id: string;
  occurrence_date: LocalDate;
  kind: 'skip' | 'cover';
  cover_member_id: string | null;
  created_by_member_id: string;
  created_at: Timestamp;
}

export interface NotificationPrefs {
  morning_checkin?: boolean;
  handoff_reminders?: boolean;
  partner_changes?: boolean;
  weekly_reset_reminder?: boolean;
}

export interface MemberStateTable {
  member_id: string;
  household_id: string;
  last_seen_at: Timestamp | null;
  notifications: ColumnType<NotificationPrefs, NotificationPrefs | undefined, NotificationPrefs>;
  /** HH:MM:SS local times, both or neither. */
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  haptics: Generated<boolean>;
  sound: Generated<boolean>;
  /** HH:MM:SS local times. */
  morning_time: Generated<string>;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekly_reset_day: Generated<number>;
  weekly_reset_time: Generated<string>;
  hide_details: Generated<boolean>;
  version: Generated<number>;
  updated_at: Timestamp;
}

export interface DevicePushTokenTable {
  id: Generated<string>;
  member_id: string;
  household_id: string;
  expo_push_token: string;
  platform: 'ios';
  created_at: Generated<Date>;
  last_used_at: Timestamp;
}

export type NotificationLogKind =
  'morning_checkin' | 'handoff_reminder' | 'partner_changes' | 'weekly_reset_reminder';
export type NotificationLogStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface NotificationLogTable {
  /** bigint, read as a string. */
  id: Generated<string>;
  member_id: string;
  household_id: string;
  kind: NotificationLogKind;
  dedupe_key: string;
  sent_at: Timestamp;
  status: NotificationLogStatus;
}

export interface MemberAcknowledgmentTable {
  member_id: string;
  household_id: string;
  key: string;
  acknowledged_at: Timestamp;
}

export type ContactCategory =
  'health' | 'childcare' | 'home' | 'services' | 'school' | 'family' | 'pets' | 'other';

export interface ContactTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  category: Generated<ContactCategory>;
  role: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  for_member_id: string | null;
  created_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type DecisionStatus = 'open' | 'decided' | 'dropped';

export interface DecisionTable {
  id: Generated<string>;
  household_id: string;
  question: string;
  context: string | null;
  due_on: ColumnType<string | null, string | null | undefined, string | null>;
  status: Generated<DecisionStatus>;
  decided_option_id: string | null;
  decided_at: Timestamp | null;
  decided_via: 'agreement' | 'call' | null;
  decided_by_member_id: string | null;
  created_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DecisionOptionTable {
  id: Generated<string>;
  household_id: string;
  decision_id: string;
  label: string;
  detail: string | null;
  position: Generated<number>;
  created_at: Timestamp;
}

export interface DecisionVoteTable {
  household_id: string;
  decision_id: string;
  member_id: string;
  option_id: string;
  voted_at: Timestamp;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface MealTable {
  id: Generated<string>;
  household_id: string;
  on_date: LocalDate;
  slot: Generated<MealSlot>;
  title: string;
  cook_member_id: string | null;
  notes: string | null;
  created_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type GroceryAisle =
  | 'produce'
  | 'dairy_eggs'
  | 'meat_fish'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'household'
  | 'baby'
  | 'pet'
  | 'other';

export interface GroceryItemTable {
  id: Generated<string>;
  household_id: string;
  name: string;
  detail: string | null;
  aisle: Generated<GroceryAisle>;
  position: Generated<number>;
  checked_at: Timestamp | null;
  checked_by_member_id: string | null;
  added_by_member_id: string;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WeeklyPlanTable {
  id: Generated<string>;
  household_id: string;
  /** The Monday the week starts on, in the household's timezone. */
  week_start: LocalDate;
  notes: string | null;
  committed_at: Timestamp | null;
  committed_by_member_id: string | null;
  version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** numeric(12,2): read as a decimal string, written as a number or string. */
type Money = ColumnType<string | null, number | string | null, number | string | null>;

export interface BudgetSnapshotTable {
  id: Generated<string>;
  household_id: string;
  /** First day of the month. */
  month: LocalDate;
  category: string;
  category_group: string | null;
  budgeted: Money;
  actual: Money;
  imported_at: Timestamp;
  imported_by_member_id: string;
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
  'app.event': EventTable;
  'app.event_member': EventMemberTable;
  'app.event_exception': EventExceptionTable;
  'app.calendar_source': CalendarSourceTable;
  'app.member_state': MemberStateTable;
  'app.member_acknowledgment': MemberAcknowledgmentTable;
  'app.device_push_token': DevicePushTokenTable;
  'app.notification_log': NotificationLogTable;
  'app.contact': ContactTable;
  'app.decision': DecisionTable;
  'app.decision_option': DecisionOptionTable;
  'app.decision_vote': DecisionVoteTable;
  'app.meal': MealTable;
  'app.grocery_item': GroceryItemTable;
  'app.weekly_plan': WeeklyPlanTable;
  'app.budget_snapshot': BudgetSnapshotTable;
  'app.service_heartbeat': ServiceHeartbeatTable;
}

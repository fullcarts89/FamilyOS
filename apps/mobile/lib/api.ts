import type { WorkItemStatus } from '@familyos/domain';
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

export interface Member {
  id: string;
  displayName: string;
  role: 'owner' | 'adult' | 'caregiver' | 'child';
}

export interface WorkItem {
  id: string;
  type: 'task' | 'project' | 'routine' | 'issue';
  title: string;
  description: string | null;
  status: WorkItemStatus;
  ownerMemberId: string | null;
  parentId: string | null;
  dueOn: string | null;
  dueAt: string | null;
  visibility: 'household' | 'private';
  createdByMemberId: string;
  version: number;
  updatedAt: string;
}

export interface TodayResponse {
  date: string;
  timezone: string;
  inboxCount: number;
  needsYou: WorkItem[];
  inProgress: WorkItem[];
  thisWeek: WorkItem[];
  handled: WorkItem[];
}

export interface ItemDetail {
  item: WorkItem;
  subtasks: WorkItem[];
  progress: { done: number; total: number } | null;
  timeline: {
    id: string;
    action: string;
    actorMemberId: string | null;
    payload: { toStatus?: WorkItemStatus; fields?: string[] };
    createdAt: string;
  }[];
}

export interface Comment {
  id: string;
  authorMemberId: string;
  body: string;
  createdAt: string;
}

/** User-facing message for an API error code. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiRequestError ? error.code : '';
  switch (code) {
    case 'version_conflict':
      return 'Someone else just changed this. Reload to see their update.';
    case 'illegal_transition':
      return 'That status change isn’t possible from here.';
    case 'evidence_required':
      return 'Confirm the work is done, or mark it done without verification.';
    case 'open_subtasks':
      return 'Finish or cancel the subtasks first.';
    case 'invalid_owner':
      return 'That person can’t own tasks.';
    case 'forbidden':
      return 'Your role can’t do that.';
    case 'not_in_inbox':
      return 'This was already sorted.';
    default:
      return 'Something went wrong. Try again.';
  }
}

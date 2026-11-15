import { expect } from '@playwright/test';
import { API_URL, DEMO_PASSWORD, SUPABASE_URL, stackKeys } from './env';

/** The slices of the API's responses the journeys check (apps/mobile/lib/api.ts has the rest). */
export interface WorkItem {
  id: string;
  type: 'task' | 'project' | 'routine' | 'issue';
  title: string;
  status: string;
  ownerMemberId: string | null;
  parentId: string | null;
  dueOn: string | null;
  subjectMemberId?: string | null;
  recurrenceRuleId: string | null;
  occurrenceOn: string | null;
  version: number;
}
export interface Member {
  id: string;
  displayName: string;
  role: 'owner' | 'adult' | 'caregiver' | 'child' | 'pet';
  species: string | null;
  color: string;
}
export interface Occurrence {
  key: string;
  eventId: string;
  date: string;
  startsAt: string;
  title: string;
  memberIds: string[];
  careMemberId: string | null;
  careAction: 'drop_off' | 'pick_up' | null;
  carePlace: string | null;
  recurring: boolean;
  cover: { memberId: string; replacedMemberIds: string[] } | null;
}
export interface Routine {
  id: string;
  title: string;
  ownerMemberId: string | null;
  subjectMemberId?: string | null;
  rule: { freq: string; dayOfMonth?: number; interval?: number };
  startOn: string;
}
export interface RoutineDetail {
  routine: Routine;
  today: string;
  upcoming: {
    index: number;
    date: string;
    skipped: boolean;
    itemId: string | null;
    status: string | null;
  }[];
  history: WorkItem[];
}

/** Statuses that count as done (packages/domain). */
export const DONE = ['done_unverified', 'verified_complete'];

/** Signs in with Supabase Auth's password grant, as the app does, and returns the access token. */
export async function accessToken(email: string, password = DEMO_PASSWORD): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stackKeys().publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return body.access_token;
}

/**
 * The FamilyOS API as one signed-in person: journeys re-read the real state through it after
 * acting in the UI, instead of trusting what the screen says.
 */
export class Api {
  private constructor(
    private readonly token: string,
    readonly householdId: string,
    readonly memberId: string,
  ) {}

  static async as(email: string, password = DEMO_PASSWORD): Promise<Api> {
    const token = await accessToken(email, password);
    const me = await raw<{ households: { id: string; memberId: string }[] }>(token, '/me');
    const first = me.body.households[0];
    if (!first) throw new Error(`${email} is not in a household`);
    return new Api(token, first.id, first.memberId);
  }

  /** GET/POST/PATCH under the API root; returns status and parsed body. */
  request<T>(path: string, init: { method?: string; body?: unknown } = {}) {
    return raw<T>(this.token, path, init);
  }

  /** A household-scoped GET that must succeed. */
  async get<T>(path: string): Promise<T> {
    const res = await this.request<T>(`/households/${this.householdId}${path}`);
    expect(res.status, `GET ${path}`).toBe(200);
    return res.body;
  }

  async today(): Promise<string> {
    return (await this.get<{ date: string }>('/today')).date;
  }

  async members(): Promise<Member[]> {
    return (await this.get<{ members: Member[] }>('')).members;
  }

  async member(name: string): Promise<Member> {
    const m = (await this.members()).find((x) => x.displayName === name);
    if (!m) throw new Error(`no member named ${name}`);
    return m;
  }

  async items(): Promise<WorkItem[]> {
    return (await this.get<{ items: WorkItem[] }>('/work-items')).items;
  }

  /** The one open-or-done work item with this exact title (fails on none or several). */
  async item(title: string): Promise<WorkItem> {
    const matches = (await this.items()).filter((i) => i.title === title);
    expect(matches, `work items titled “${title}”`).toHaveLength(1);
    return matches[0] as WorkItem;
  }

  async routines(): Promise<Routine[]> {
    return (await this.get<{ routines: Routine[] }>('/routines')).routines;
  }

  async routine(title: string): Promise<RoutineDetail> {
    const r = (await this.routines()).find((x) => x.title === title);
    if (!r) throw new Error(`no routine titled ${title}`);
    return this.get<RoutineDetail>(`/routines/${r.id}`);
  }

  async occurrences(from: string, to: string): Promise<Occurrence[]> {
    return (await this.get<{ occurrences: Occurrence[] }>(`/events?from=${from}&to=${to}`))
      .occurrences;
  }
}

async function raw<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

/** Calendar arithmetic on local dates (YYYY-MM-DD), as the app does it. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
/** ISO weekday, Monday = 1 ... Sunday = 7. */
export function weekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
export function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

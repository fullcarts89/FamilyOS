import { workItemMachine, type CareAction, type WorkItemStatus } from '@familyos/domain';

/**
 * The compact snapshot the iPhone widget shows, written to the App Group after each refresh.
 * GET /households/:id/widget (proposed, docs/operations/iphone.md) returns the same shape, so
 * the widget can refresh itself once the API serves it. Decoded by WidgetSnapshot in
 * apps/mobile/targets/widget/Shared.swift.
 */
export interface WidgetSnapshot {
  householdId: string;
  memberId: string;
  /** The household's local date (YYYY-MM-DD) this is for. The widget hides it on other days. */
  date: string;
  timezone: string;
  generatedAt: string;
  /** My open items due today, including any beyond the ones listed. */
  dueTodayCount: number;
  items: WidgetItem[];
  /** Today's handoffs from now on, earliest first. */
  handoffs: WidgetHandoff[];
  members: { id: string; name: string; color: string }[];
}

export interface WidgetItem {
  id: string;
  title: string;
  version: number;
  dueAt: string | null;
  dueOn: string | null;
  ownerMemberId: string | null;
  /** False for things that can't be ticked off yet (waiting on someone, booked, stuck). */
  canComplete: boolean;
}

export interface WidgetHandoff {
  time: string;
  action: CareAction;
  careMemberId: string;
  byMemberIds: string[];
  place: string | null;
}

export const WIDGET_ITEM_LIMIT = 8;
export const WIDGET_HANDOFF_LIMIT = 4;

/** The parts of GET /households/:id/rhythm the snapshot uses. */
export interface RhythmForWidget {
  date: string;
  timezone: string;
  lanes: {
    memberId: string;
    caredFor: boolean;
    tasks: { timed: RhythmWidgetTask[]; dueToday: RhythmWidgetTask[] };
  }[];
  handoffs: {
    time: string;
    careMemberId: string;
    action: CareAction;
    byMemberIds: string[];
    place: string | null;
  }[];
  members: { id: string; displayName: string }[];
}

export interface RhythmWidgetTask {
  id: string;
  title: string;
  status: WorkItemStatus;
  version: number;
  dueAt: string | null;
  dueOn: string | null;
  ownerMemberId: string | null;
}

const DONE: readonly WorkItemStatus[] = ['verified_complete', 'done_unverified'];
const isOpen = (t: RhythmWidgetTask) => !DONE.includes(t.status) && t.status !== 'cancelled';

/**
 * Builds the snapshot for one person from today's rhythm: their own open items due today
 * (timed first, as the rhythm orders them), and the household's handoffs still to come.
 * `colorOf` gives each member's display color (#RRGGBB), as the app shows it.
 */
export function buildWidgetSnapshot(input: {
  rhythm: RhythmForWidget;
  householdId: string;
  memberId: string;
  colorOf: (memberId: string) => string;
  now: Date;
}): WidgetSnapshot {
  const { rhythm, memberId, now } = input;
  const lane = rhythm.lanes.find((l) => l.memberId === memberId && !l.caredFor);
  const open = lane ? [...lane.tasks.timed, ...lane.tasks.dueToday].filter(isOpen) : [];
  const nowIso = now.toISOString();
  const handoffs = rhythm.handoffs
    .filter((h) => new Date(h.time).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .slice(0, WIDGET_HANDOFF_LIMIT)
    .map((h) => ({
      time: h.time,
      action: h.action,
      careMemberId: h.careMemberId,
      byMemberIds: h.byMemberIds,
      place: h.place,
    }));

  return {
    householdId: input.householdId,
    memberId,
    date: rhythm.date,
    timezone: rhythm.timezone,
    generatedAt: nowIso,
    dueTodayCount: open.length,
    items: open.slice(0, WIDGET_ITEM_LIMIT).map((t) => ({
      id: t.id,
      title: t.title,
      version: t.version,
      dueAt: t.dueAt,
      dueOn: t.dueOn,
      ownerMemberId: t.ownerMemberId,
      canComplete:
        t.status !== 'new' && workItemMachine.canTransition(t.status, 'verified_complete'),
    })),
    handoffs,
    members: rhythm.members.map((m) => ({
      id: m.id,
      name: m.displayName.trim() || 'Someone',
      color: input.colorOf(m.id),
    })),
  };
}

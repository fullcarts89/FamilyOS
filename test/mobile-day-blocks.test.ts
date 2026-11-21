import { describe, expect, it } from 'vitest';
import type { NextEntry } from '../apps/mobile/components/rhythm/NextUp';
import { verticalDay, withLatestTasks } from '../apps/mobile/components/rhythm/today-model';
import type { RhythmLaneView, WorkItem } from '../apps/mobile/lib/api';

// Today's day view with time blocks (components/rhythm/today-model.ts).
// A synthetic household on Thursday 2026-11-19 in Los Angeles (UTC-8 in November).
const TZ = 'America/Los_Angeles';
const TODAY = '2026-11-19';
const MAYA = '00000000-0000-4000-8000-000000000001';
const THEO = '00000000-0000-4000-8000-000000000002';
/** A wall time on a date in Los Angeles, as an ISO instant. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-08:00`).toISOString();

const item = (id: string, overrides: Partial<WorkItem> = {}): WorkItem => ({
  id,
  type: 'task',
  title: id,
  description: null,
  status: 'ready',
  ownerMemberId: MAYA,
  parentId: null,
  dueOn: null,
  dueAt: null,
  visibility: 'household',
  createdByMemberId: MAYA,
  recurrenceRuleId: null,
  occurrenceIndex: null,
  occurrenceOn: null,
  completedByMemberId: null,
  version: 1,
  updatedAt: '2026-11-19T12:00:00Z',
  ...overrides,
});

describe('the day view’s time blocks', () => {
  const lane = (timed: RhythmLaneView['tasks']['timed']): RhythmLaneView => ({
    memberId: MAYA,
    role: 'owner',
    caredFor: false,
    occurrences: [],
    segments: [],
    tasks: { timed, dueToday: [] },
  });
  const block = { startsAt: at(TODAY, '17:30'), endsAt: at(TODAY, '18:00'), minutes: 30 };

  it('takes each timed task’s latest standing from the lists, and keeps its block', () => {
    const walk = { ...item('walk', { dueAt: at(TODAY, '17:30'), durationMinutes: 30 }), block };
    const lanes = [lane([{ ...walk, subjectMemberId: null }])];
    const ticked = item('walk', {
      dueAt: walk.dueAt,
      durationMinutes: 30,
      status: 'verified_complete',
      completedByMemberId: MAYA,
      version: 2,
    });
    const [fresh] = withLatestTasks(lanes, [ticked, item('other', { ownerMemberId: THEO })]);
    expect(fresh?.tasks.timed[0]).toMatchObject({
      status: 'verified_complete',
      version: 2,
      completedByMemberId: MAYA,
      block,
    });
    // Nothing to update: the same lanes back.
    expect(withLatestTasks(lanes, null)).toBe(lanes);
    expect(withLatestTasks(lanes, [item('other')])[0]).toBe(lanes[0]);
  });

  it('places a block from its start, under way between its start and end', () => {
    const entry: NextEntry = {
      key: 'walk',
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      title: 'Walk Biscuit',
      sub: '5:30–6pm · You',
      people: [],
      kind: 'task',
    };
    const rows = verticalDay({
      entries: [entry],
      date: TODAY,
      timeZone: TZ,
      now: new Date(at(TODAY, '17:40')),
    });
    const row = rows.find((r) => r.kind === 'item');
    expect(row).toMatchObject({ minutes: 17 * 60 + 30, ongoing: true, past: false });
    const after = verticalDay({
      entries: [entry],
      date: TODAY,
      timeZone: TZ,
      now: new Date(at(TODAY, '18:05')),
    }).find((r) => r.kind === 'item');
    expect(after).toMatchObject({ ongoing: false, past: true });
  });
});

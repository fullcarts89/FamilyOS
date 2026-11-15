/**
 * What each household role may do (PRD WF-05). Deterministic: the API checks these before
 * any write, and row-level security limits what each request can see at all.
 * Caregiver scope is minimal until M5 defines assigned-item access.
 */
export const MEMBER_ROLES = ['owner', 'adult', 'caregiver', 'child', 'pet'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Members without accounts, whom the household looks after. They own nothing and never sign in. */
export const CARED_FOR_ROLES = ['child', 'pet'] as const satisfies readonly MemberRole[];
export const isCaredFor = (role: MemberRole): boolean =>
  (CARED_FOR_ROLES as readonly MemberRole[]).includes(role);

export const ACTIONS = [
  'household.read',
  'member.invite',
  'member.remove',
  'member.add_child',
  'member.add_pet',
  /** Edit a member's name, color, note and (pets) species: children, pets, and yourself. */
  'member.update',
  'work_item.read',
  'work_item.create',
  'work_item.update',
  'work_item.comment',
  'routine.manage',
  'household.export',
  'event.read',
  'event.manage',
  /** Add, change, remove and sync read-only calendar subscriptions. */
  'calendar.manage',
] as const;
export type Action = (typeof ACTIONS)[number];

const GRANTS: Readonly<Record<MemberRole, readonly Action[]>> = {
  owner: ACTIONS,
  adult: [
    'household.read',
    'member.add_child',
    'member.add_pet',
    'member.update',
    'work_item.read',
    'work_item.create',
    'work_item.update',
    'work_item.comment',
    'routine.manage',
    'household.export',
    'event.read',
    'event.manage',
    'calendar.manage',
  ],
  // A sitter sees the household's schedule so they know who is where.
  caregiver: ['household.read', 'work_item.read', 'event.read'],
  // Children and pets have no account, so they never make requests.
  child: [],
  pet: [],
};

export const can = (role: MemberRole, action: Action): boolean => GRANTS[role].includes(action);

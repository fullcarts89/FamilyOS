/**
 * What each household role may do (PRD WF-05). Deterministic: the API checks these before
 * any write, and row-level security limits what each request can see at all.
 * Caregiver scope is minimal until M5 defines assigned-item access.
 */
export const MEMBER_ROLES = ['owner', 'adult', 'caregiver', 'child'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/**
 * The roles that hold an account, so can own tasks and take routine turns. An allow-list on
 * purpose: a role this code doesn't know (a newer release adds pets, for example) is never
 * treated as an adult if the app is rolled back.
 */
export const ASSIGNABLE_ROLES = ['owner', 'adult', 'caregiver'] as const;

/** True only for a role in ASSIGNABLE_ROLES. Takes any string, since the database may know more. */
export const isAssignableRole = (role: string): boolean =>
  (ASSIGNABLE_ROLES as readonly string[]).includes(role);

export const ACTIONS = [
  'household.read',
  'member.invite',
  'member.remove',
  'member.add_child',
  'work_item.read',
  'work_item.create',
  'work_item.update',
  'work_item.comment',
  'routine.manage',
  'household.export',
] as const;
export type Action = (typeof ACTIONS)[number];

const GRANTS: Readonly<Record<MemberRole, readonly Action[]>> = {
  owner: ACTIONS,
  adult: [
    'household.read',
    'member.add_child',
    'work_item.read',
    'work_item.create',
    'work_item.update',
    'work_item.comment',
    'routine.manage',
    'household.export',
  ],
  caregiver: ['household.read', 'work_item.read'],
  // Children have no account, so they never make requests.
  child: [],
};

export const can = (role: MemberRole, action: Action): boolean => GRANTS[role].includes(action);

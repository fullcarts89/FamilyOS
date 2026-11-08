/**
 * What each household role may do (PRD WF-05). Deterministic: the API checks these before
 * any write, and row-level security limits what each request can see at all.
 * Caregiver scope is minimal until M5 defines assigned-item access.
 */
export const MEMBER_ROLES = ['owner', 'adult', 'caregiver', 'child'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ACTIONS = [
  'household.read',
  'member.invite',
  'member.remove',
  'member.add_child',
  'work_item.read',
  'work_item.create',
  'work_item.update',
  'work_item.comment',
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
    'household.export',
  ],
  caregiver: ['household.read', 'work_item.read'],
  // Children have no account, so they never make requests.
  child: [],
};

export const can = (role: MemberRole, action: Action): boolean => GRANTS[role].includes(action);

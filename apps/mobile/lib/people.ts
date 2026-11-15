import { useMemo } from 'react';
import { color as tokens, memberPalette, tint } from '../design/tokens';
import type { Member } from './api';
import { useHousehold } from './household';

/** A household member as the interface shows them: name, initial and their own color. */
export interface Person {
  id: string;
  name: string;
  initial: string;
  color: string;
  tint: string;
  role: Member['role'];
  isMe: boolean;
  /** Can own tasks: adults and caregivers, not children or pets. */
  assignable: boolean;
  /** Children and pets: looked after, no account. */
  caredFor: boolean;
  species: string | null;
  note: string | null;
  version: number;
}

/** "Either of you": items nobody has taken yet. */
export const SHARED = { color: tokens.ink, tint: tokens.lane };

const HEX = /^#[0-9a-f]{6}$/i;

export function toPeople(members: Member[], meId: string | null): Person[] {
  return members.map((m, i) => {
    const c =
      m.color && HEX.test(m.color)
        ? m.color
        : (memberPalette[i % memberPalette.length] ?? tokens.ink);
    const name = m.displayName.trim() || 'Someone';
    return {
      id: m.id,
      name,
      initial: name.slice(0, 1).toUpperCase(),
      color: c,
      tint: tint(c),
      role: m.role,
      isMe: m.id === meId,
      assignable: m.role !== 'child' && m.role !== 'pet',
      caredFor: m.role === 'child' || m.role === 'pet',
      species: m.species ?? null,
      note: m.note ?? null,
      version: m.version ?? 1,
    };
  });
}

export interface People {
  all: Person[];
  me: Person | null;
  /** Members who can own tasks, me first. */
  assignable: Person[];
  /** The other adults (not me) who can own tasks, owners and adults before caregivers. */
  others: Person[];
  /** The first other adult: who "hand to" means by default. */
  partner: Person | null;
  /** Owners and adults (me first), then caregivers. */
  adults: Person[];
  /** Children, then pets. */
  caredFor: Person[];
  byId: (id: string | null | undefined) => Person | null;
  /** "You", their first name, or "Either of you" for unowned. */
  label: (id: string | null | undefined, shared?: string) => string;
  colorOf: (id: string | null | undefined) => string;
  tintOf: (id: string | null | undefined) => string;
}

export function usePeople(): People {
  const { members, household } = useHousehold();
  const meId = household?.memberId ?? null;
  return useMemo(() => {
    const all = toPeople(members, meId);
    const me = all.find((p) => p.isMe) ?? null;
    const rank = (p: Person) => (p.role === 'owner' || p.role === 'adult' ? 0 : 1);
    const others = all.filter((p) => p.assignable && !p.isMe).sort((a, b) => rank(a) - rank(b));
    const assignable = [...(me && me.assignable ? [me] : []), ...others];
    const byId = (id: string | null | undefined) =>
      id ? (all.find((p) => p.id === id) ?? null) : null;
    return {
      all,
      me,
      assignable,
      others,
      partner: others[0] ?? null,
      adults: assignable,
      caredFor: [...all.filter((p) => p.role === 'child'), ...all.filter((p) => p.role === 'pet')],
      byId,
      label: (id, shared = 'Either of you') => {
        if (!id) return shared;
        const p = byId(id);
        return p ? (p.isMe ? 'You' : p.name) : 'Someone';
      },
      colorOf: (id) => byId(id)?.color ?? SHARED.color,
      tintOf: (id) => byId(id)?.tint ?? SHARED.tint,
    };
  }, [members, meId]);
}

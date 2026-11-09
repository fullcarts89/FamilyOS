import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Member, type MyHousehold } from './api';
import { useSession } from './session';

interface HouseholdState {
  household: MyHousehold | null;
  members: Member[];
  /** IANA timezone of the household; dates and times show in it, not the phone's. */
  timeZone: string;
  loading: boolean;
  error: boolean;
  reload: () => void;
  memberName: (id: string | null) => string | null;
}

const HouseholdContext = createContext<HouseholdState | null>(null);

/** The signed-in person's household (the first one; FamilyOS is built for one household). */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [household, setHousehold] = useState<MyHousehold | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [timeZone, setTimeZone] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!session) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const me = await api<{ households: MyHousehold[] }>('/me');
      const first = me.households[0] ?? null;
      setHousehold(first);
      if (first) {
        const detail = await api<{ members: Member[]; household: { timezone: string } }>(
          `/households/${first.id}`,
        );
        setMembers(detail.members);
        setTimeZone(detail.household.timezone);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.displayName ?? null) : null;

  return (
    <HouseholdContext.Provider
      value={{ household, members, timeZone, loading, error, reload: load, memberName }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdState {
  const value = useContext(HouseholdContext);
  if (!value) throw new Error('useHousehold must be used inside HouseholdProvider');
  return value;
}

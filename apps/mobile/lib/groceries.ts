import { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptics } from '../design/motion';
import { useToast } from '../design/Toast';
import { api, errorMessage, type GroceryAisle, type GroceryItem } from './api';
import { guessAisle, splitDetail } from './grocery-words';
import { useHousehold } from './household';

/**
 * The shared grocery list. Checking off is instant (the row strikes through at once and stays
 * until "Clear checked"); a failed write puts it back and says so. Two people in the store at once
 * never trip over each other: checking is idempotent on the server.
 */
export function useGroceries({ poll = 0 }: { poll?: number } = {}) {
  const { household } = useHousehold();
  const toast = useToast();
  const haptics = useHaptics();
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [error, setError] = useState(false);
  const pending = useRef(0);
  const base = household ? `/households/${household.id}/groceries` : '';

  const load = useCallback(async () => {
    if (!base) return;
    try {
      const res = await api<{ items: GroceryItem[] }>(base);
      // A tap in flight wins over a refresh that started before it.
      if (pending.current === 0) setItems(res.items);
      setError(false);
    } catch {
      setError(true);
    }
  }, [base]);

  useEffect(() => {
    void load();
    if (!poll) return;
    const timer = setInterval(() => void load(), poll);
    return () => clearInterval(timer);
  }, [load, poll]);

  const put = (item: GroceryItem) =>
    setItems((all) => (all ? all.map((i) => (i.id === item.id ? item : i)) : all));

  const toggle = useCallback(
    async (item: GroceryItem) => {
      const checking = item.checkedAt === null;
      if (checking) haptics.light();
      put({ ...item, checkedAt: checking ? new Date().toISOString() : null });
      pending.current += 1;
      try {
        const res = await api<{ item: GroceryItem }>(
          `${base}/${item.id}/${checking ? 'check' : 'uncheck'}`,
          { method: 'POST' },
        );
        put(res.item);
      } catch (caught) {
        put(item);
        toast.show(`Couldn’t ${checking ? 'check off' : 'uncheck'} ${item.name}.`, {
          error: true,
          detail: errorMessage(caught),
        });
      } finally {
        pending.current -= 1;
      }
    },
    [base, haptics, toast],
  );

  const add = useCallback(
    async (raw: string, aisle?: GroceryAisle): Promise<boolean> => {
      const { name, detail } = splitDetail(raw);
      if (!name) return false;
      const temp: GroceryItem = {
        id: `temp-${Date.now()}`,
        name,
        detail,
        aisle: aisle ?? guessAisle(name),
        position: 1e6,
        checkedAt: null,
        checkedByMemberId: null,
        addedByMemberId: household?.memberId ?? null,
        version: 1,
      };
      setItems((all) => [...(all ?? []), temp]);
      pending.current += 1;
      try {
        const res = await api<{ item: GroceryItem }>(base, {
          method: 'POST',
          body: { name, ...(detail && { detail }), aisle: temp.aisle },
        });
        setItems((all) => (all ? all.map((i) => (i.id === temp.id ? res.item : i)) : all));
        return true;
      } catch (caught) {
        setItems((all) => (all ? all.filter((i) => i.id !== temp.id) : all));
        toast.show(`Couldn’t add ${name}.`, { error: true, detail: errorMessage(caught) });
        return false;
      } finally {
        pending.current -= 1;
      }
    },
    [base, household, toast],
  );

  const move = useCallback(
    async (item: GroceryItem, aisle: GroceryAisle) => {
      put({ ...item, aisle });
      try {
        const res = await api<{ item: GroceryItem }>(`${base}/${item.id}`, {
          method: 'PATCH',
          body: { expectedVersion: item.version, aisle },
        });
        put(res.item);
      } catch (caught) {
        put(item);
        toast.show(`Couldn’t move ${item.name}.`, { error: true, detail: errorMessage(caught) });
      }
    },
    [base, toast],
  );

  const remove = useCallback(
    async (item: GroceryItem) => {
      setItems((all) => (all ? all.filter((i) => i.id !== item.id) : all));
      try {
        await api(`${base}/${item.id}?expectedVersion=${item.version}`, { method: 'DELETE' });
        toast.show(`Removed ${item.name}`, {
          undo: async () => {
            await add(item.detail ? `${item.name}, ${item.detail}` : item.name, item.aisle);
          },
        });
      } catch (caught) {
        setItems((all) => (all ? [...all, item] : all));
        toast.show(`Couldn’t remove ${item.name}.`, { error: true, detail: errorMessage(caught) });
      }
    },
    [base, toast, add],
  );

  const clearChecked = useCallback(async () => {
    const before = items;
    const checked = (items ?? []).filter((i) => i.checkedAt !== null);
    if (checked.length === 0) return;
    setItems((all) => (all ? all.filter((i) => i.checkedAt === null) : all));
    try {
      const res = await api<{ removed: number; items: GroceryItem[] }>(`${base}/clear-checked`, {
        method: 'POST',
      });
      setItems(res.items);
      toast.show(
        res.removed === 1 ? 'Cleared one thing from the list' : `Cleared ${res.removed} things`,
      );
    } catch (caught) {
      setItems(before);
      toast.show('Couldn’t clear the list.', { error: true, detail: errorMessage(caught) });
    }
  }, [base, items, toast]);

  return { items, error, load, toggle, add, move, remove, clearChecked };
}

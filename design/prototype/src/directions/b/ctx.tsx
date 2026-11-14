// Direction B's own shell context: selection, capture, menus and per-view UI state.
import { createContext, useContext, type ReactNode } from 'react';
import type { Screen } from '../types';

export type Selection = { kind: 'task' | 'event'; id: string } | null;

export type TaskView = 'all' | 'mine' | 'theo' | 'shared' | 'routines' | 'projects' | 'inbox' | 'june';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  divider?: boolean;
}

export interface MenuOpts {
  anchor: HTMLElement;
  items: MenuItem[];
  selected?: string;
  title?: string;
  align?: 'start' | 'end';
  onSelect: (id: string) => void;
}

export interface ActivityEntry {
  at: string;
  text: string;
}

export interface BApi {
  screen: Screen;
  go: (s: Screen) => void;
  sel: Selection;
  select: (s: Selection) => void;
  openCapture: (prefill?: string) => void;
  captureOpen: boolean;
  openMenu: (o: MenuOpts) => void;
  taskView: TaskView;
  setTaskView: (v: TaskView) => void;
  openProject: string | null;
  setOpenProject: (id: string | null) => void;
  repeats: Record<string, string>;
  setRepeat: (id: string, v: string) => void;
  flash: string | null;
  activity: Record<string, ActivityEntry[]>;
  log: (id: string, text: string) => void;
  phone: boolean;
  /** Complete / reopen with activity logging. */
  complete: (id: string) => void;
  /** A key: Maya → Theo → Either → Maya. */
  cycleOwner: (id: string) => void;
  resetStart: number;
  resetPaused: boolean;
  setResetPaused: (p: boolean) => void;
}

export const BCtx = createContext<BApi | null>(null);

export function useB(): BApi {
  const v = useContext(BCtx);
  if (!v) throw new Error('useB outside Direction B');
  return v;
}

// Shared, in-memory state and interactions for every design direction. Nothing is saved or sent:
// reloading the page starts over. Directions only render; all behaviour lives here so the three
// options behave identically and can be compared on design alone.
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  decisions as seedDecisions,
  groceries as seedGroceries,
  mealsThisWeek,
  nextWeekDays,
  NOW,
  people,
  routines as seedRoutines,
  suggestions as seedSuggestions,
  tasks as seedTasks,
  type Area,
  type Decision,
  type GroceryItem,
  type PersonId,
  type Routine,
  type Task,
} from './data';

export type SuggestionStatus = 'pending' | 'approved' | 'dismissed';

export interface ResetState {
  step: number;
  /** Unfinished items reviewed in the reset: what happens to each. */
  carry: Record<string, 'keep' | 'drop' | 'later'>;
  /** Next week's dinners by date. */
  meals: Record<string, { title: string; cook: PersonId | null }>;
  /** Who covers each childcare handoff next week (key: date + slot). */
  coverage: Record<string, PersonId | null>;
  committed: boolean;
  /** One device together, or each on their own phone. */
  mode: 'together' | 'apart';
  /** Partner's simulated readiness when apart. */
  partnerStep: number;
}

export interface Toast {
  id: number;
  message: string;
  undo?: Action;
}

interface State {
  tasks: Task[];
  routines: Routine[];
  decisions: Decision[];
  groceries: GroceryItem[];
  suggestionStatus: Record<string, SuggestionStatus>;
  reset: ResetState;
  toasts: Toast[];
  nextId: number;
}

type Action =
  | { type: 'toggleTask'; id: string; by: PersonId }
  | { type: 'assign'; id: string; owner: PersonId | null }
  | { type: 'addTask'; task: Task }
  | { type: 'removeTask'; id: string }
  | { type: 'restoreTask'; task: Task; index: number }
  | { type: 'setDue'; id: string; due: string | undefined }
  | { type: 'routineDone'; id: string }
  | { type: 'routineSwap'; id: string }
  | { type: 'routineRestore'; routine: Routine }
  | { type: 'vote'; id: string; person: PersonId; option: string | undefined }
  | { type: 'toggleGrocery'; id: string }
  | { type: 'addGrocery'; item: GroceryItem }
  | { type: 'suggestion'; id: string; status: SuggestionStatus }
  | { type: 'resetPatch'; patch: Partial<ResetState> }
  | { type: 'carry'; id: string; choice: 'keep' | 'drop' | 'later' }
  | { type: 'meal'; date: string; title: string; cook: PersonId | null }
  | { type: 'coverage'; key: string; who: PersonId | null }
  | { type: 'toast'; message: string; undo?: Action }
  | { type: 'dismissToast'; id: number }
  | { type: 'batch'; actions: Action[] };

const initialMeals: ResetState['meals'] = {
  '2026-11-23': { title: 'Freezer chili', cook: 'theo' },
  '2026-11-24': { title: 'Takeout night', cook: null },
};

const initial: State = {
  tasks: seedTasks,
  routines: seedRoutines,
  decisions: seedDecisions,
  groceries: seedGroceries,
  suggestionStatus: {},
  reset: {
    step: 0,
    carry: {},
    meals: initialMeals,
    coverage: {},
    committed: false,
    mode: 'together',
    partnerStep: 0,
  },
  toasts: [],
  nextId: 1,
};

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'batch':
      return action.actions.reduce(reduce, state);
    case 'toggleTask':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id
            ? { ...t, done: !t.done, doneBy: !t.done ? action.by : undefined }
            : t,
        ),
      };
    case 'assign':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, owner: action.owner } : t)) };
    case 'setDue':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, due: action.due } : t)) };
    case 'addTask':
      return { ...state, tasks: [action.task, ...state.tasks] };
    case 'removeTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case 'restoreTask': {
      const tasks = [...state.tasks];
      tasks.splice(action.index, 0, action.task);
      return { ...state, tasks };
    }
    case 'routineDone':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.id
            ? {
                ...r,
                history: [{ date: NOW.date, who: r.rotation[r.turn] ?? r.rotation[0]!, done: true }, ...r.history],
                turn: (r.turn + 1) % r.rotation.length,
              }
            : r,
        ),
      };
    case 'routineSwap':
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.id && r.rotation.length > 1 ? { ...r, turn: (r.turn + 1) % r.rotation.length } : r,
        ),
      };
    case 'routineRestore':
      return { ...state, routines: state.routines.map((r) => (r.id === action.routine.id ? action.routine : r)) };
    case 'vote':
      return {
        ...state,
        decisions: state.decisions.map((d) =>
          d.id === action.id ? { ...d, votes: { ...d.votes, [action.person]: action.option } } : d,
        ),
      };
    case 'toggleGrocery':
      return { ...state, groceries: state.groceries.map((g) => (g.id === action.id ? { ...g, checked: !g.checked } : g)) };
    case 'addGrocery':
      return { ...state, groceries: [...state.groceries, action.item] };
    case 'suggestion':
      return { ...state, suggestionStatus: { ...state.suggestionStatus, [action.id]: action.status } };
    case 'resetPatch':
      return { ...state, reset: { ...state.reset, ...action.patch } };
    case 'carry':
      return { ...state, reset: { ...state.reset, carry: { ...state.reset.carry, [action.id]: action.choice } } };
    case 'meal':
      return {
        ...state,
        reset: { ...state.reset, meals: { ...state.reset.meals, [action.date]: { title: action.title, cook: action.cook } } },
      };
    case 'coverage':
      return { ...state, reset: { ...state.reset, coverage: { ...state.reset.coverage, [action.key]: action.who } } };
    case 'toast': {
      const toast = { id: state.nextId, message: action.message, undo: action.undo };
      return { ...state, nextId: state.nextId + 1, toasts: [...state.toasts.slice(-2), toast] };
    }
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

// ---------------------------------------------------------------------------------------------
// Quick capture: "Call plumber tomorrow @theo #reno !" → a task. Understands a person (@name or
// "for Theo"), a day (today, tonight, tomorrow, weekday names), a project (#reno, #garage) and
// a high-priority marker (!).
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ParsedCapture {
  title: string;
  owner: PersonId | null;
  due?: string;
  dueLabel?: string;
  projectId?: string;
  area: Area;
  priority?: 'high';
}

export function parseCapture(raw: string, defaultOwner: PersonId | null = 'maya'): ParsedCapture {
  let text = ` ${raw.trim()} `;
  let owner: PersonId | null = defaultOwner;
  let due: string | undefined;
  let dueLabel: string | undefined;
  let projectId: string | undefined;
  let area: Area = 'Home';
  let priority: 'high' | undefined;

  const who = /\s(?:@|for\s+)(maya|theo|me|us|both|shared)\b/i.exec(text);
  if (who) {
    const w = who[1]!.toLowerCase();
    owner = w === 'me' ? 'maya' : w === 'us' || w === 'both' || w === 'shared' ? null : (w as PersonId);
    text = text.replace(who[0], ' ');
  }
  const day = /\s(today|tonight|tomorrow|this weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(text);
  if (day) {
    const d = day[1]!.toLowerCase();
    if (d === 'today' || d === 'tonight') {
      due = NOW.date;
      dueLabel = d === 'tonight' ? 'Tonight' : 'Today';
    } else if (d === 'tomorrow') {
      due = addDays(NOW.date, 1);
      dueLabel = 'Tomorrow';
    } else if (d === 'this weekend') {
      due = '2026-11-21';
      dueLabel = 'Saturday';
    } else {
      const todayIdx = WEEKDAYS.indexOf(NOW.weekday.toLowerCase());
      const idx = WEEKDAYS.indexOf(d);
      const diff = (idx - todayIdx + 7) % 7 || 7;
      due = addDays(NOW.date, diff);
      dueLabel = d[0]!.toUpperCase() + d.slice(1);
    }
    text = text.replace(day[0], ' ');
  }
  const tag = /\s#(reno|renovation|bath|garage|june|meals|errands|admin)\b/i.exec(text);
  if (tag) {
    const t = tag[1]!.toLowerCase();
    if (t === 'reno' || t === 'renovation' || t === 'bath') {
      projectId = 'p1';
      area = 'Renovation';
    } else if (t === 'garage') {
      projectId = 'p2';
      area = 'Home';
    } else {
      area = ({ june: 'June', meals: 'Meals', errands: 'Errands', admin: 'Admin' } as const)[t as 'june'];
    }
    text = text.replace(tag[0], ' ');
  }
  if (/\s!+\s/.test(text)) {
    priority = 'high';
    text = text.replace(/\s!+\s/, ' ');
  }
  if (!tag) {
    if (/\b(june|daycare|diaper|nap|pediatric|sitter)\b/i.test(text)) area = 'June';
    else if (/\b(buy|pick up|return|drop off|order)\b/i.test(text)) area = 'Errands';
    else if (/\b(pay|bill|insurance|register|tax|form)\b/i.test(text)) area = 'Admin';
    else if (/\b(filter|gutter|alarm|furnace|leak|fix)\b/i.test(text)) area = 'Maintenance';
  }
  const title = text.replace(/\s+/g, ' ').trim();
  return { title: title ? title[0]!.toUpperCase() + title.slice(1) : '', owner, due, dueLabel, projectId, area, priority };
}

// ---------------------------------------------------------------------------------------------

export function dueLabel(due?: string): string | undefined {
  if (!due) return undefined;
  if (due === NOW.date) return 'Today';
  if (due === addDays(NOW.date, 1)) return 'Tomorrow';
  if (due < NOW.date) {
    const days = Math.round((Date.parse(NOW.date) - Date.parse(due)) / 86400000);
    return days === 1 ? 'Yesterday' : `${days} days late`;
  }
  const d = new Date(`${due}T12:00:00`);
  const diff = Math.round((Date.parse(due) - Date.parse(NOW.date)) / 86400000);
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const isOverdue = (t: Task) => !t.done && !!t.due && t.due < NOW.date;
export const isToday = (t: Task) => t.due === NOW.date;

function useFamilyState() {
  const [state, dispatch] = useReducer(reduce, initial);

  const toast = useCallback((message: string, undo?: Action) => {
    dispatch({ type: 'toast', message, undo });
  }, []);

  const api = useMemo(() => {
    const find = (id: string) => state.tasks.find((t) => t.id === id);
    return {
      state,
      dispatch,
      toast,
      dismissToast: (id: number) => dispatch({ type: 'dismissToast', id }),
      undoToast: (t: Toast) => {
        if (t.undo) dispatch(t.undo);
        dispatch({ type: 'dismissToast', id: t.id });
      },

      /** Complete or reopen a task, with an undo toast. */
      toggleTask(id: string, by: PersonId = 'maya') {
        const t = find(id);
        if (!t) return;
        dispatch({ type: 'toggleTask', id, by });
        if (!t.done) toast(`Done: ${t.title}`, { type: 'toggleTask', id, by });
      },

      assign(id: string, owner: PersonId | null) {
        const t = find(id);
        if (!t) return;
        dispatch({ type: 'assign', id, owner });
        const who = owner ? (owner === 'maya' ? 'you' : people[owner].name) : 'either of you';
        toast(`${t.title} → ${who}`, { type: 'assign', id, owner: t.owner });
      },

      setDue(id: string, due: string | undefined) {
        const t = find(id);
        if (!t) return;
        dispatch({ type: 'setDue', id, due });
        toast(due ? `Moved to ${dueLabel(due)}` : 'Removed the date', { type: 'setDue', id, due: t.due });
      },

      /** Add a task from quick capture text. Returns the new task. */
      capture(raw: string, overrides: Partial<Task> = {}): Task | undefined {
        const p = parseCapture(raw);
        if (!p.title) return undefined;
        const id = `new-${Date.now()}`;
        const task: Task = {
          id,
          title: p.title,
          owner: p.owner,
          area: p.area,
          due: p.due,
          projectId: p.projectId,
          priority: p.priority,
          done: false,
          createdBy: 'maya',
          ...overrides,
        };
        dispatch({ type: 'addTask', task });
        const who = task.owner === null ? 'shared' : task.owner === 'maya' ? 'you' : people[task.owner].name;
        toast(
          task.owner === 'theo' ? `Sent to Theo: ${task.title}` : `Added for ${who}: ${task.title}`,
          { type: 'removeTask', id },
        );
        return task;
      },

      routineDone(id: string) {
        const r = state.routines.find((x) => x.id === id);
        if (!r) return;
        dispatch({ type: 'routineDone', id });
        const next = r.rotation[(r.turn + 1) % r.rotation.length]!;
        toast(
          `${r.title} done. Next turn: ${next === 'maya' ? 'you' : people[next].name}`,
          { type: 'routineRestore', routine: r },
        );
      },

      routineSwap(id: string) {
        const r = state.routines.find((x) => x.id === id);
        if (!r || r.rotation.length < 2) return;
        dispatch({ type: 'routineSwap', id });
        const next = r.rotation[(r.turn + 1) % r.rotation.length]!;
        toast(`Swapped: ${people[next].name} takes this turn`, { type: 'routineRestore', routine: r });
      },

      vote(id: string, option: string | undefined, person: PersonId = 'maya') {
        dispatch({ type: 'vote', id, person, option });
      },

      toggleGrocery: (id: string) => dispatch({ type: 'toggleGrocery', id }),
      addGrocery(name: string, aisle: GroceryItem['aisle'] = 'Pantry') {
        if (!name.trim()) return;
        dispatch({ type: 'addGrocery', item: { id: `g-${Date.now()}`, name: name.trim(), aisle, checked: false, addedBy: 'maya' } });
      },

      /** Approve or dismiss a simulated assistant suggestion. */
      suggestion(id: string, status: SuggestionStatus) {
        dispatch({ type: 'suggestion', id, status });
        const s = seedSuggestions.find((x) => x.id === id);
        if (s && status === 'approved') toast(`Approved (simulated): ${s.action}`, { type: 'suggestion', id, status: 'pending' });
        if (s && status === 'dismissed') toast('Suggestion dismissed', { type: 'suggestion', id, status: 'pending' });
      },
      suggestionStatus: (id: string): SuggestionStatus => state.suggestionStatus[id] ?? 'pending',

      // Weekly Reset
      resetPatch: (patch: Partial<ResetState>) => dispatch({ type: 'resetPatch', patch }),
      carry: (id: string, choice: 'keep' | 'drop' | 'later') => dispatch({ type: 'carry', id, choice }),
      setMeal: (date: string, title: string, cook: PersonId | null) => dispatch({ type: 'meal', date, title, cook }),
      setCoverage: (key: string, who: PersonId | null) => dispatch({ type: 'coverage', key, who }),
      commitPlan() {
        dispatch({ type: 'resetPatch', patch: { committed: true } });
        toast('Plan saved. Theo gets a copy (simulated).');
      },
    };
  }, [state, toast]);

  return api;
}

export type Family = ReturnType<typeof useFamilyState>;

const Ctx = createContext<Family | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const value = useFamilyState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): Family {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFamily outside FamilyProvider');
  return v;
}

// ---------------------------------------------------------------------------------------------
// Derived views shared by every direction
// ---------------------------------------------------------------------------------------------

/** Open tasks that need attention today, per adult, plus shared ones. */
export function todayFor(tasks: Task[]) {
  const open = tasks.filter((t) => !t.done && !t.waitingOn && t.due && t.due <= NOW.date);
  return {
    mine: open.filter((t) => t.owner === 'maya'),
    partner: open.filter((t) => t.owner === 'theo'),
    shared: open.filter((t) => t.owner === null),
  };
}

/** Childcare handoffs needed next week, for the Weekly Reset coverage step. */
export const coverageSlots = nextWeekDays
  .filter((d) => ['Mon', 'Tue', 'Wed'].includes(d.day))
  .flatMap((d) => [
    { key: `${d.date}-drop`, date: d.date, day: d.day, label: 'Drop-off 8:15', suggested: 'theo' as PersonId },
    { key: `${d.date}-pick`, date: d.date, day: d.day, label: 'Pickup 5:30', suggested: (d.day === 'Wed' ? 'maya' : 'theo') as PersonId },
  ]);

export const thisWeekMeals = mealsThisWeek;

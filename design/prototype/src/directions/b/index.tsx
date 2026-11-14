// Direction B · Command Center. A fast, keyboard-friendly household app: sidebar, header bar,
// main list surfaces and a right inspector on desktop; compact header, bottom tabs and a capture
// sheet on phone.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck2,
  CalendarDays,
  Archive,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  House,
  Inbox,
  Keyboard,
  ListTodo,
  Menu,
  Plus,
  Repeat2,
  Search,
  Sparkle,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { household, NOW, people, projects, type PersonId } from '../../data';
import { useFamily, type Toast } from '../../store';
import type { DirectionProps, Screen } from '../types';
import { Capture } from './capture';
import { BCtx, useB, type ActivityEntry, type BApi, type MenuOpts, type Selection, type TaskView } from './ctx';
import { Home } from './home';
import { Inspector } from './inspector';
import { Placeholder } from './placeholder';
import { Reset } from './reset';
import { Tasks } from './tasks';
import { Avatar, Kbd, MenuHost, Pie } from './ui';
import { cx, isTyping, nextOwner } from './util';
import './b.css';

export function DirectionB({ screen, go }: DirectionProps) {
  const f = useFamily();
  const root = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [capture, setCapture] = useState<{ prefill: string } | null>(null);
  const [menu, setMenu] = useState<MenuOpts | null>(null);
  const [taskView, setTaskView] = useState<TaskView>('all');
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [repeats, setRepeats] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, ActivityEntry[]>>({});
  const [phone, setPhone] = useState(false);
  const [more, setMore] = useState(false);
  const [resetStart] = useState(() => Date.now());
  const [resetPaused, setResetPaused] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPhone(el.offsetWidth <= 760));
    ro.observe(el);
    setPhone(el.offsetWidth <= 760);
    return () => ro.disconnect();
  }, []);

  // Clear selection when leaving a screen.
  useEffect(() => {
    setSel(null);
    setMore(false);
    root.current?.querySelector('.b-scroll')?.scrollTo({ top: 0 });
  }, [screen, taskView]);

  // New tasks flash briefly where they land.
  const lastCount = useRef(f.state.tasks.length);
  useEffect(() => {
    const first = f.state.tasks[0];
    if (f.state.tasks.length > lastCount.current && first?.id.startsWith('new-')) {
      setFlash(first.id);
      const t = setTimeout(() => setFlash(null), 1800);
      lastCount.current = f.state.tasks.length;
      return () => clearTimeout(t);
    }
    lastCount.current = f.state.tasks.length;
  }, [f.state.tasks]);

  const log = useCallback((id: string, text: string) => {
    setActivity((a) => ({ ...a, [id]: [{ at: NOW.time, text }, ...(a[id] ?? [])] }));
  }, []);

  const openCapture = useCallback((prefill = '') => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setMenu(null);
    setCapture({ prefill });
  }, []);
  const closeCapture = useCallback(() => {
    setCapture(null);
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }, []);

  const api: BApi = useMemo(
    () => ({
      screen,
      go,
      sel,
      select: setSel,
      openCapture,
      captureOpen: !!capture,
      openMenu: setMenu,
      taskView,
      setTaskView,
      openProject,
      setOpenProject,
      repeats,
      setRepeat: (id, v) => setRepeats((r) => ({ ...r, [id]: v })),
      flash,
      activity,
      log,
      phone,
      complete(id) {
        const t = f.state.tasks.find((x) => x.id === id);
        if (!t) return;
        f.toggleTask(id, 'maya');
        log(id, t.done ? 'Maya reopened it' : 'Maya marked it done');
      },
      cycleOwner(id) {
        const t = f.state.tasks.find((x) => x.id === id);
        if (!t) return;
        const o = nextOwner(t.owner);
        f.assign(id, o);
        log(id, `Maya gave this to ${o === 'maya' ? 'herself' : o ? people[o].name : 'either of you'}`);
      },
      resetStart,
      resetPaused,
      setResetPaused,
    }),
    [screen, go, sel, openCapture, capture, taskView, openProject, repeats, flash, activity, log, phone, f, resetStart, resetPaused],
  );

  // Global keys: ⌘K / C capture, J/K move, X complete, A assign, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (capture) closeCapture();
        else openCapture();
        return;
      }
      if (e.defaultPrevented || capture || menu) return;
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (more) setMore(false);
        else if (sel) {
          const id = sel.id;
          setSel(null);
          (root.current?.querySelector(`[data-row-id="${id}"]`) as HTMLElement | null)?.focus();
        }
        return;
      }
      if (k === 'c') {
        e.preventDefault();
        openCapture();
        return;
      }
      if (screen === 'reset') return;
      const rows = Array.from(root.current?.querySelectorAll<HTMLElement>('.b-main [data-row-id]') ?? []).filter(
        (r) => r.offsetParent !== null,
      );
      const focusedId = (document.activeElement as HTMLElement | null)?.dataset?.rowId;
      const currentId = focusedId ?? (sel?.kind === 'task' ? sel.id : undefined);
      if (k === 'j' || k === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!rows.length) return;
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !focusedId) return;
        e.preventDefault();
        const idx = rows.findIndex((r) => r.dataset.rowId === currentId);
        const down = k === 'j' || e.key === 'ArrowDown';
        const next = idx < 0 ? (down ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, idx + (down ? 1 : -1)));
        const row = rows[next]!;
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: 'nearest' });
        setSel({ kind: 'task', id: row.dataset.rowId! });
        return;
      }
      if ((k === 'x' || k === 'a') && currentId && f.state.tasks.some((t) => t.id === currentId)) {
        e.preventDefault();
        if (k === 'x') api.complete(currentId);
        else api.cycleOwner(currentId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture, menu, sel, screen, more, openCapture, closeCapture, f.state.tasks, api]);

  const showInspector = screen === 'home' || (!!sel && screen !== 'reset');

  return (
    <BCtx.Provider value={api}>
      <div className={cx('dir-b', phone && 'is-phone')} ref={root}>
        <Sidebar />
        <main className="b-main" aria-label={screen}>
          <MobileHeader onMore={() => setMore(true)} />
          {screen === 'home' && <Home />}
          {screen === 'tasks' && <Tasks />}
          {screen === 'reset' && <Reset />}
          {(screen === 'calendar' || screen === 'household' || screen === 'meals') && <Placeholder kind={screen} />}
        </main>
        {showInspector && (
          <>
            {sel && <div className="b-insp-scrim" onClick={() => setSel(null)} aria-hidden="true" />}
            <aside className={cx('b-insp', sel && 'has-sel', screen === 'home' && 'is-home')} aria-label="Details">
              <Inspector />
            </aside>
          </>
        )}
        <TabBar onMore={() => setMore(true)} />
        {screen !== 'reset' && (
          <button type="button" className="b-fab" aria-label="Add something" onClick={() => openCapture()}>
            <Plus size={22} strokeWidth={1.75} />
          </button>
        )}
        {more && <MoreSheet onClose={() => setMore(false)} />}
        {capture && <Capture prefill={capture.prefill} onClose={closeCapture} />}
        <Toasts />
        <MenuHost opts={menu} root={root.current} onClose={() => setMenu(null)} />
      </div>
    </BCtx.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
// Sidebar

function useCounts() {
  const f = useFamily();
  const open = f.state.tasks.filter((t) => !t.done);
  return {
    inbox: open.filter((t) => !t.due && !t.projectId && (t.owner === null || t.id.startsWith('new-'))).length,
    tasks: open.length,
    routines: f.state.routines.filter((r) => r.nextDue <= '2026-11-22').length,
    maya: open.filter((t) => t.owner === 'maya').length,
    theo: open.filter((t) => t.owner === 'theo').length,
    june: open.filter((t) => t.area === 'June').length,
  };
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  tag,
  muted,
  indent,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  tag?: string;
  muted?: boolean;
  indent?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cx('b-nav', active && 'is-on', muted && 'is-muted', indent && 'is-indent')}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="b-nav-icon">{icon}</span>
      <span className="b-nav-label">{label}</span>
      {trailing}
      {tag && <span className="b-nav-tag mono">{tag}</span>}
      {count !== undefined && count > 0 && <span className="b-nav-count mono">{count}</span>}
    </button>
  );
}

function Sidebar() {
  const b = useB();
  const f = useFamily();
  const c = useCounts();
  const [projOpen, setProjOpen] = useState(true);
  const toTasks = (v: TaskView, project: string | null = null) => {
    b.setTaskView(v);
    b.setOpenProject(project);
    b.go('tasks');
  };
  const on = (v: TaskView) => b.screen === 'tasks' && b.taskView === v;
  const pct = (id: string) => {
    const ts = f.state.tasks.filter((t) => t.projectId === id);
    return ts.length ? ts.filter((t) => t.done).length / ts.length : 0;
  };
  const ico = (I: typeof House) => <I size={16} strokeWidth={1.5} />;
  return (
    <nav className="b-side" aria-label="Main">
      <div className="b-side-top">
        <button
          type="button"
          className="b-switcher"
          onClick={(e) =>
            b.openMenu({
              anchor: e.currentTarget,
              title: 'Household',
              items: [
                { id: 'rivera', label: household.name.replace('The ', ''), icon: <span className="b-hmark is-sm">R</span> },
                { id: 'div', label: '', divider: true },
                { id: 'settings', label: 'People, home and records' },
              ],
              selected: 'rivera',
              onSelect: (id) => id === 'settings' && b.go('household'),
            })
          }
        >
          <span className="b-hmark">R</span>
          <span className="b-switcher-name">Rivera household</span>
          <ChevronDown size={14} strokeWidth={1.5} className="b-faint" />
        </button>
      </div>
      <button type="button" className="b-search" onClick={() => b.openCapture()}>
        <Search size={14} strokeWidth={1.5} />
        <span>Search or add…</span>
        <span className="b-search-keys">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="b-side-scroll">
        <div className="b-navgroup">
          <NavItem icon={ico(House)} label="Home" active={b.screen === 'home'} onClick={() => b.go('home')} />
          <NavItem icon={ico(Inbox)} label="Inbox" count={c.inbox} active={on('inbox')} onClick={() => toTasks('inbox')} />
          <NavItem icon={ico(CalendarDays)} label="Calendar" active={b.screen === 'calendar'} onClick={() => b.go('calendar')} />
        </div>
        <div className="b-navgroup">
          <div className="b-navhead">Work</div>
          <NavItem
            icon={ico(ListTodo)}
            label="Tasks"
            count={c.tasks}
            active={on('all') || on('mine') || on('theo') || on('shared')}
            onClick={() => toTasks('all')}
          />
          <NavItem icon={ico(Repeat2)} label="Routines" count={c.routines} active={on('routines')} onClick={() => toTasks('routines')} />
          <NavItem
            icon={ico(FolderKanban)}
            label="Projects"
            active={on('projects') && !b.openProject}
            onClick={() => toTasks('projects')}
            trailing={
              <span
                role="button"
                tabIndex={0}
                className="b-nav-caret"
                aria-label={projOpen ? 'Collapse projects' : 'Expand projects'}
                aria-expanded={projOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setProjOpen(!projOpen);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setProjOpen(!projOpen);
                  }
                }}
              >
                <ChevronRight size={12} strokeWidth={1.75} className={cx('b-caret', projOpen && 'is-open')} />
              </span>
            }
          />
          {projOpen &&
            projects.map((p) => (
              <NavItem
                key={p.id}
                indent
                icon={<Pie value={pct(p.id)} />}
                label={p.id === 'p1' ? 'Hall bathroom' : 'Garage'}
                active={on('projects') && b.openProject === p.id}
                onClick={() => toTasks('projects', p.id)}
              />
            ))}
          <NavItem
            icon={ico(CalendarCheck2)}
            label="Weekly Reset"
            tag="Sun"
            active={b.screen === 'reset'}
            onClick={() => b.go('reset')}
          />
        </div>
        <div className="b-navgroup">
          <div className="b-navhead">People</div>
          {(['maya', 'theo', 'june'] as PersonId[]).map((p) => (
            <NavItem
              key={p}
              icon={<Avatar id={p} size={16} />}
              label={p === 'maya' ? 'Maya (you)' : people[p].name}
              count={c[p as 'maya']}
              active={on(p === 'maya' ? 'mine' : p === 'theo' ? 'theo' : 'june')}
              onClick={() => toTasks(p === 'maya' ? 'mine' : p === 'theo' ? 'theo' : 'june')}
            />
          ))}
        </div>
        <div className="b-navgroup">
          <div className="b-navhead">Later</div>
          <NavItem icon={ico(UtensilsCrossed)} label="Meals" muted tag="Later" active={b.screen === 'meals'} onClick={() => b.go('meals')} />
          <NavItem icon={ico(Archive)} label="Records" muted tag="Later" active={b.screen === 'household'} onClick={() => b.go('household')} />
          <NavItem
            icon={ico(Sparkle)}
            label="Assistant"
            muted
            tag="Later"
            onClick={() => f.toast('The assistant comes later. Proposals you see now are simulated.')}
          />
        </div>
      </div>

      <div className="b-side-foot">
        <span className="b-side-me">
          <Avatar id="maya" size={20} />
          Maya
        </span>
        <span className="mono b-faint b-side-clock">
          Tue 17 · {NOW.time.replace(/^0/, '')}
        </span>
        <button
          type="button"
          className="b-icon-btn"
          aria-label="Keyboard shortcuts"
          onClick={(e) =>
            b.openMenu({
              anchor: e.currentTarget,
              title: 'Keyboard',
              align: 'end',
              items: [
                { id: 'k1', label: 'Add something', hint: '⌘K  C' },
                { id: 'k2', label: 'Move down / up', hint: 'J  K' },
                { id: 'k3', label: 'Complete', hint: 'X' },
                { id: 'k4', label: 'Assign to next person', hint: 'A' },
                { id: 'k5', label: 'Close / deselect', hint: 'esc' },
                { id: 'k6', label: 'Reset triage: keep, later, drop', hint: 'K L D' },
                { id: 'k7', label: 'Reset triage: Maya, Theo', hint: '1  2' },
              ],
              onSelect: () => undefined,
            })
          }
        >
          <Keyboard size={16} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------
// Phone chrome

const TITLES: Record<Screen, string> = {
  home: 'Today',
  reset: 'Weekly Reset',
  tasks: 'Tasks',
  calendar: 'Calendar',
  household: 'Household',
  meals: 'Meals',
};

function MobileHeader({ onMore }: { onMore: () => void }) {
  const b = useB();
  return (
    <header className="b-mhead">
      <button type="button" className="b-icon-btn is-touch" aria-label="Menu" onClick={onMore}>
        <Menu size={18} strokeWidth={1.5} />
      </button>
      <div className="b-mhead-title">
        <span>{TITLES[b.screen]}</span>
        <span className="mono b-faint">{b.screen === 'reset' ? 'Week of Nov 23' : 'Tue Nov 17 · 7:42'}</span>
      </div>
      <button type="button" className="b-icon-btn is-touch" aria-label="Search or add" onClick={() => b.openCapture()}>
        <Search size={18} strokeWidth={1.5} />
      </button>
    </header>
  );
}

function TabBar({ onMore }: { onMore: () => void }) {
  const b = useB();
  const tabs: { id: Screen | 'more'; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <House size={20} strokeWidth={1.5} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalendarDays size={20} strokeWidth={1.5} /> },
    { id: 'tasks', label: 'Tasks', icon: <ListTodo size={20} strokeWidth={1.5} /> },
    { id: 'reset', label: 'Reset', icon: <CalendarCheck2 size={20} strokeWidth={1.5} /> },
    { id: 'more', label: 'More', icon: <Menu size={20} strokeWidth={1.5} /> },
  ];
  return (
    <nav className="b-tabbar" aria-label="Main">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx('b-tabbar-btn', t.id === b.screen && 'is-on')}
          aria-current={t.id === b.screen ? 'page' : undefined}
          onClick={() => (t.id === 'more' ? onMore() : (t.id === 'tasks' && b.setTaskView('all'), b.go(t.id)))}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

function MoreSheet({ onClose }: { onClose: () => void }) {
  const b = useB();
  const c = useCounts();
  const toTasks = (v: TaskView) => {
    b.setTaskView(v);
    b.setOpenProject(null);
    b.go('tasks');
    onClose();
  };
  const row = (icon: React.ReactNode, label: string, onClick: () => void, count?: number, tag?: string) => (
    <button type="button" className="b-sheet-row" onClick={onClick}>
      <span className="b-nav-icon">{icon}</span>
      <span className="b-nav-label">{label}</span>
      {tag && <span className="b-nav-tag mono">{tag}</span>}
      {count !== undefined && <span className="mono b-faint">{count}</span>}
    </button>
  );
  return (
    <div className="b-scrim is-sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="b-sheet" role="dialog" aria-label="More">
        <div className="b-capture-grab" aria-hidden="true" />
        <div className="b-sheet-head">
          <span className="b-hmark">R</span>
          <span className="b-switcher-name">Rivera household</span>
          <button type="button" className="b-icon-btn is-touch" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {row(<Inbox size={18} strokeWidth={1.5} />, 'Inbox', () => toTasks('inbox'), c.inbox)}
        {row(<Repeat2 size={18} strokeWidth={1.5} />, 'Routines', () => toTasks('routines'), c.routines)}
        {row(<FolderKanban size={18} strokeWidth={1.5} />, 'Projects', () => toTasks('projects'), 2)}
        <div className="b-navhead">People</div>
        {row(<Avatar id="maya" size={18} />, 'Maya (you)', () => toTasks('mine'), c.maya)}
        {row(<Avatar id="theo" size={18} />, 'Theo', () => toTasks('theo'), c.theo)}
        {row(<Avatar id="june" size={18} />, 'June', () => toTasks('june'), c.june)}
        <div className="b-navhead">Later</div>
        {row(<UtensilsCrossed size={18} strokeWidth={1.5} />, 'Meals', () => (b.go('meals'), onClose()), undefined, 'Later')}
        {row(<Archive size={18} strokeWidth={1.5} />, 'Household and records', () => (b.go('household'), onClose()), undefined, 'Later')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Toasts

function Toasts() {
  const f = useFamily();
  return (
    <div className="b-toasts" aria-live="polite">
      {f.state.toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const f = useFamily();
  const { dismissToast } = f;
  useEffect(() => {
    const id = setTimeout(() => dismissToast(t.id), 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);
  return (
    <div className="b-toast" role="status">
      <span className="b-toast-msg">{t.message}</span>
      {t.undo && (
        <button type="button" className="b-toast-undo" onClick={() => f.undoToast(t)}>
          Undo
        </button>
      )}
      <button type="button" className="b-toast-x" aria-label="Dismiss" onClick={() => f.dismissToast(t.id)}>
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// Direction A · Family Workspace. A calm family notebook with the polish of Things 3.
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CircleCheck,
  CloudRain,
  FolderClosed,
  House,
  NotebookPen,
  Plus,
  Sparkles,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import type { DirectionProps, Screen } from '../types';
import { cx } from './helpers';
import { AvatarStack, Kbd, Toasts, ic } from './ui';
import { CaptureSheet } from './Capture';
import { HomeScreen } from './Home';
import { TasksScreen, type TaskView } from './Tasks';
import { ResetScreen } from './Reset';
import { Placeholder } from './Placeholder';
import './a.css';

const NAV: { id: Screen; label: string; Icon: typeof House; badge?: string }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', Icon: CircleCheck },
  { id: 'reset', label: 'Weekly Reset', Icon: NotebookPen, badge: 'Sun' },
  { id: 'household', label: 'Household', Icon: Users },
];

const LATER: { id?: Screen; label: string; Icon: typeof House }[] = [
  { id: 'meals', label: 'Meals & groceries', Icon: UtensilsCrossed },
  { label: 'Home records', Icon: FolderClosed },
  { label: 'Assistant', Icon: Sparkles },
];

export function DirectionA({ screen, go }: DirectionProps) {
  const [capture, setCapture] = useState(false);
  const [taskView, setTaskView] = useState<TaskView>({ kind: 'today' });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape' && capture) {
        setCapture(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setCapture(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [screen, taskView]);

  return (
    <div className="dir-a">
      <aside className="a-side" aria-label="Household navigation">
        <div className="a-ident">
          <AvatarStack ids={['maya', 'theo', 'june']} size={28} />
          <h1 className="a-ident-name">The Riveras</h1>
          <p className="a-ident-line">
            <CloudRain size={14} strokeWidth={1.75} aria-hidden="true" />
            Portland · 48° · rain after 2
          </p>
        </div>
        <nav className="a-nav">
          {NAV.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              className={cx('a-nav-item', screen === id && 'is-on')}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon {...ic} aria-hidden="true" />
              <span>{label}</span>
              {badge && <span className="a-nav-badge">{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="a-nav a-nav--later">
          <p className="a-nav-group">Coming later</p>
          {LATER.map(({ id, label, Icon }) =>
            id ? (
              <button
                key={label}
                type="button"
                className={cx('a-nav-item is-later', screen === id && 'is-on')}
                aria-current={screen === id ? 'page' : undefined}
                onClick={() => go(id)}
              >
                <Icon {...ic} aria-hidden="true" />
                <span>{label}</span>
                <span className="a-later-tag">Later</span>
              </button>
            ) : (
              <div key={label} className="a-nav-item is-later is-static" aria-disabled="true">
                <Icon {...ic} aria-hidden="true" />
                <span>{label}</span>
                <span className="a-later-tag">Later</span>
              </div>
            ),
          )}
        </div>
        <button type="button" className="a-side-capture" onClick={() => setCapture(true)}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          Capture
          <Kbd>N</Kbd>
        </button>
      </aside>

      <div className="a-main">
        <header className="a-mtop">
          <span className="a-mtop-name">The Riveras</span>
          <button type="button" className="a-mtop-house" aria-label="Household" onClick={() => go('household')}>
            <AvatarStack ids={['maya', 'theo', 'june']} size={28} />
          </button>
        </header>
        <div className="a-scroll" ref={scroller}>
          {screen === 'home' && <HomeScreen go={go} />}
          {screen === 'tasks' && <TasksScreen view={taskView} setView={setTaskView} />}
          {screen === 'reset' && <ResetScreen />}
          {(screen === 'calendar' || screen === 'household' || screen === 'meals') && <Placeholder screen={screen} />}
        </div>
        <nav className="a-tabs" aria-label="Sections">
          {(
            [
              ['home', 'Home', House],
              ['calendar', 'Calendar', CalendarDays],
              null,
              ['tasks', 'Tasks', CircleCheck],
              ['reset', 'Reset', NotebookPen],
            ] as const
          ).map((t) =>
            t === null ? (
              <button key="cap" type="button" className="a-tab-capture" aria-label="Capture" onClick={() => setCapture(true)}>
                <Plus size={24} strokeWidth={2} aria-hidden="true" />
              </button>
            ) : (
              <button
                key={t[0]}
                type="button"
                className={cx('a-tab', screen === t[0] && 'is-on')}
                aria-current={screen === t[0] ? 'page' : undefined}
                onClick={() => go(t[0])}
              >
                {(() => {
                  const I = t[2];
                  return <I size={22} strokeWidth={1.75} aria-hidden="true" />;
                })()}
                <span>{t[1]}</span>
              </button>
            ),
          )}
        </nav>
        <Toasts />
      </div>

      {capture && <CaptureSheet onClose={() => setCapture(false)} />}
    </div>
  );
}

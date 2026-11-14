import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Home as HomeIcon, Plus, X } from 'lucide-react';
import { people, type PersonId } from '../../data';
import { useFamily } from '../../store';
import type { DirectionProps, Screen } from '../types';
import { Capture } from './Capture';
import { Home } from './Home';
import { Placeholder } from './Placeholder';
import { Reset } from './Reset';
import { Tasks } from './Tasks';
import { Avatar, Rhythm, useCompletion, useSize, type Lane } from './ui';
import './c.css';

const NAV: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Today' },
  { id: 'calendar', label: 'Week' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'reset', label: 'Reset' },
  { id: 'household', label: 'Household' },
];
const LANES: Lane[] = ['maya', 'theo', 'june'];

export function DirectionC({ screen, go }: DirectionProps) {
  const [rootRef, size] = useSize<HTMLDivElement>();
  const phone = size.w > 0 && size.w <= 760;
  const [focus, setFocus] = useState<Lane | null>(null);
  const [cap, setCap] = useState<{ owner: PersonId | null } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const { leaving, popped, complete } = useCompletion();
  const mainRef = useRef<HTMLElement>(null);

  const openCapture = (owner: PersonId | null = 'maya') => setCap({ owner });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setCap({ owner: 'maya' });
      }
      if (e.key === 'Escape') setFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setLater(false);
  }, [screen]);

  useEffect(() => {
    if (!landed) return;
    const t = window.setTimeout(() => setLanded(null), 2600);
    return () => window.clearTimeout(t);
  }, [landed]);

  return (
    <Rhythm.Provider
      value={{ focus, setFocus, phone, openCapture, landed, leaving, popped, complete, go }}
    >
      <div className={`dir-c ${phone ? 'is-phone' : ''}`} ref={rootRef} data-focus={focus ?? undefined}>
        <header className="c-top">
          <div className="c-top-left">
            <button type="button" className="c-brand" onClick={() => go('home')} aria-label="Riveras, today">
              <Mark />
              <span>Riveras</span>
            </button>
            <div className="c-lanes" role="group" aria-label="Focus one person's lane">
              {LANES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`c-lanebtn ${focus === id ? 'on' : ''} ${focus && focus !== id ? 'dim' : ''}`}
                  aria-pressed={focus === id}
                  title={focus === id ? 'Show everyone' : `Focus ${people[id].name}`}
                  style={{ '--pc': people[id].color } as CSSProperties}
                  onClick={() => setFocus(focus === id ? null : id)}
                >
                  <Avatar id={id} size={phone ? 30 : 32} />
                  <span className="c-lanebtn-name">{id === 'maya' ? 'Maya' : people[id].name}</span>
                  {focus === id && !phone && <X size={14} strokeWidth={2.6} className="c-lanebtn-x" />}
                </button>
              ))}
            </div>
          </div>

          <nav className="c-nav" aria-label="Main">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={screen === n.id ? 'on' : ''}
                aria-current={screen === n.id ? 'page' : undefined}
                onClick={() => go(n.id)}
              >
                {n.label}
              </button>
            ))}
            <div className="c-later">
              <button
                type="button"
                className={`c-later-btn ${screen === 'meals' ? 'on' : ''}`}
                aria-expanded={later}
                onClick={() => setLater((v) => !v)}
              >
                Later <ChevronDown size={14} strokeWidth={2.4} />
              </button>
              {later && (
                <div className="c-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => go('meals')}>
                    Meals & groceries <span className="c-menu-tag">Preview</span>
                  </button>
                  <button type="button" role="menuitem" disabled>
                    Home records <span className="c-menu-tag">Later</span>
                  </button>
                  <button type="button" role="menuitem" disabled>
                    Assistant <span className="c-menu-tag">Later</span>
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className="c-top-right">
            <button type="button" className="c-household-btn" aria-label="Household" onClick={() => go('household')}>
              <HomeIcon size={18} strokeWidth={2} />
            </button>
            <button type="button" className="c-capture" onClick={() => openCapture('maya')}>
              <Plus size={18} strokeWidth={2.4} />
              <span>Capture</span>
              <kbd>N</kbd>
            </button>
          </div>
        </header>

        <main className="c-main" ref={mainRef}>
          {screen === 'home' && <Home />}
          {screen === 'reset' && <Reset />}
          {screen === 'tasks' && <Tasks />}
          {(screen === 'calendar' || screen === 'household' || screen === 'meals') && <Placeholder screen={screen} />}
        </main>

        <nav className="c-tabbar" aria-label="Main">
          {NAV.slice(0, 4).map((n) => (
            <button
              key={n.id}
              type="button"
              className={screen === n.id ? 'on' : ''}
              aria-current={screen === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <button type="button" className="c-fab" aria-label="Capture something" onClick={() => openCapture('maya')}>
          <Plus size={24} strokeWidth={2.4} />
        </button>

        {cap && <Capture initialOwner={cap.owner} onClose={() => setCap(null)} onLanded={setLanded} />}
        <Toasts />
      </div>
    </Rhythm.Provider>
  );
}

/** Household mark: three lanes, one per person. */
function Mark() {
  return (
    <svg className="c-mark" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="2" y="4" width="15" height="4.5" rx="2.25" fill={people.maya.color} />
      <rect x="6" y="10.75" width="18" height="4.5" rx="2.25" fill={people.june.color} />
      <rect x="2" y="17.5" width="12" height="4.5" rx="2.25" fill={people.theo.color} />
    </svg>
  );
}

function Toasts() {
  const { state, dismissToast, undoToast } = useFamily();
  const timers = useRef(new Map<number, number>());
  useEffect(() => {
    for (const t of state.toasts) {
      if (!timers.current.has(t.id)) {
        timers.current.set(t.id, window.setTimeout(() => dismissToast(t.id), 4200));
      }
    }
  }, [state.toasts, dismissToast]);
  useEffect(() => () => timers.current.forEach((h) => window.clearTimeout(h)), []);
  return (
    <div className="c-toasts" aria-live="polite">
      {state.toasts.map((t) => (
        <div key={t.id} className="c-toast" role="status">
          <span className="c-toast-msg">{t.message}</span>
          {t.undo && (
            <button type="button" onClick={() => undoToast(t)}>
              Undo
            </button>
          )}
          <button type="button" className="c-toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
      ))}
    </div>
  );
}

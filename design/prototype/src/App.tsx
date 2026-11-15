import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { DirectionA } from './directions/a';
import { DirectionB } from './directions/b';
import { DirectionC } from './directions/c';
import type { DirectionProps, Screen } from './directions/types';

interface DirectionDef {
  id: 'a' | 'b' | 'c';
  name: string;
  short: string;
  Component: ComponentType<DirectionProps>;
}

const DIRECTIONS: DirectionDef[] = [
  { id: 'a', name: 'Family Workspace', short: 'Workspace', Component: DirectionA },
  { id: 'b', name: 'Command Center', short: 'Command', Component: DirectionB },
  { id: 'c', name: 'Family Rhythm', short: 'Rhythm', Component: DirectionC },
];

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'reset', label: 'Weekly Reset' },
  { id: 'tasks', label: 'Tasks' },
];

const ALL: Screen[] = ['home', 'reset', 'tasks', 'calendar', 'household', 'meals'];

/** Routes live in the hash as `#a-home`: plain names only, so links can be shared. */
function readHash(): { dir: DirectionDef; screen: Screen } {
  const m = /^#([abc])-([a-z]+)$/.exec(window.location.hash);
  const dir = DIRECTIONS.find((d) => d.id === m?.[1]) ?? DIRECTIONS[0]!;
  const screen = (ALL.includes(m?.[2] as Screen) ? m?.[2] : 'home') as Screen;
  return { dir, screen };
}

export function App() {
  const [{ dir, screen }, setRoute] = useState(readHash);
  const [phone, setPhone] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    const onResize = () => setNarrow(window.innerWidth < 760);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const go = (d: DirectionDef['id'], s: Screen) => {
    window.location.hash = `${d}-${s}`;
  };

  const Direction = dir.Component;
  const showPhone = phone && !narrow;

  return (
    <div className="proto">
      <header className="proto-bar" aria-label="Prototype controls">
        <div className="proto-brand">
          <span className="proto-logo" aria-hidden="true" />
          <span>
            FamilyOS <span className="proto-dim">design directions</span>
          </span>
        </div>
        <nav className="proto-seg" aria-label="Design direction">
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={d.id === dir.id ? 'on' : ''}
              aria-pressed={d.id === dir.id}
              onClick={() => go(d.id, screen)}
            >
              <b>{d.id.toUpperCase()}</b>
              <span className="proto-long">{d.name}</span>
              <span className="proto-short">{d.short}</span>
            </button>
          ))}
        </nav>
        <nav className="proto-seg proto-screens" aria-label="Screen">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === screen ? 'on' : ''}
              aria-pressed={s.id === screen}
              onClick={() => go(dir.id, s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {!narrow && (
          <nav className="proto-seg" aria-label="Preview size">
            <button type="button" className={!phone ? 'on' : ''} aria-pressed={!phone} onClick={() => setPhone(false)}>
              Desktop
            </button>
            <button type="button" className={phone ? 'on' : ''} aria-pressed={phone} onClick={() => setPhone(true)}>
              Phone
            </button>
          </nav>
        )}
        <span className="proto-note">Synthetic data · nothing is saved</span>
      </header>

      <main className={`proto-stage ${showPhone ? 'is-phone' : ''}`}>
        {showPhone ? (
          <PhoneFrame>
            <Direction key={dir.id} screen={screen} go={(s) => go(dir.id, s)} />
          </PhoneFrame>
        ) : (
          <div className="proto-viewport">
            <Direction key={dir.id} screen={screen} go={(s) => go(dir.id, s)} />
          </div>
        )}
      </main>
    </div>
  );
}

/** A 390 × 844 phone viewport, scaled down to fit the window when needed. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const h = holder.current?.clientHeight ?? 900;
      setScale(Math.min(1, (h - 32) / 868));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="proto-phone-holder" ref={holder}>
      <div className="proto-phone" style={{ transform: `scale(${scale})` }}>
        <div className="proto-viewport proto-phone-screen">{children}</div>
      </div>
    </div>
  );
}

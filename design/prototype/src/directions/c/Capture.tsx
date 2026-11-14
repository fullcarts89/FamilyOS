import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, CornerDownLeft, Flag, Hammer, Tag, X } from 'lucide-react';
import { people, projects, type PersonId } from '../../data';
import { parseCapture, useFamily } from '../../store';
import { Avatar, Either } from './ui';

const TARGETS: { id: PersonId | null; label: string; sub: string }[] = [
  { id: 'maya', label: 'You', sub: 'On you' },
  { id: 'theo', label: 'Theo', sub: "Theo's handling" },
  { id: null, label: 'Either', sub: 'Up for grabs' },
];

export function Capture({
  initialOwner,
  onClose,
  onLanded,
}: {
  initialOwner: PersonId | null;
  onClose: () => void;
  onLanded: (id: string) => void;
}) {
  const { capture } = useFamily();
  const [raw, setRaw] = useState('');
  const [picked, setPicked] = useState<PersonId | null>(initialOwner);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const parsed = useMemo(() => parseCapture(raw, picked), [raw, picked]);
  // A name typed in the text ("@theo", "for us") wins over the toggle.
  const explicit = useMemo(() => parseCapture(raw, 'maya').owner === parseCapture(raw, 'theo').owner && /(@|for\s)/i.test(raw), [raw]);
  const owner = explicit ? parsed.owner : picked;
  const project = projects.find((p) => p.id === parsed.projectId);

  const submit = () => {
    const t = capture(raw, { owner });
    if (t) {
      onLanded(t.id);
      onClose();
    }
  };

  return (
    <div className="c-cap-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="c-cap"
        role="dialog"
        aria-modal="true"
        aria-label="Capture something for the household"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="c-cap-head">
          <label htmlFor="c-cap-input" className="c-cap-q">
            What needs doing?
          </label>
          <button type="button" className="c-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <input
          id="c-cap-input"
          ref={input}
          className="c-cap-input"
          value={raw}
          placeholder="Call the plumber tomorrow @theo #reno"
          autoComplete="off"
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <div className="c-cap-chips" aria-live="polite">
          <span className={`c-chip ${parsed.dueLabel ? 'on' : ''}`}>
            <CalendarDays size={14} strokeWidth={2} />
            {parsed.dueLabel ?? 'No day yet'}
          </span>
          <span className={`c-chip ${project ? 'on' : ''}`}>
            <Hammer size={14} strokeWidth={2} />
            {project ? project.title.replace(' renovation', '') : 'No project'}
          </span>
          <span className={`c-chip ${raw.trim() ? 'on' : ''}`}>
            <Tag size={14} strokeWidth={2} />
            {parsed.area}
          </span>
          {parsed.priority && (
            <span className="c-chip on">
              <Flag size={14} strokeWidth={2} />
              Important
            </span>
          )}
        </div>

        <div className="c-cap-who" role="radiogroup" aria-label="Who is it for">
          {TARGETS.map((t) => {
            const on = owner === t.id;
            const style = (t.id ? { '--pc': people[t.id].color, '--pt': people[t.id].tint } : { '--pc': '#15201B', '--pt': '#EFEFEA' }) as CSSProperties;
            return (
              <button
                key={t.label}
                type="button"
                role="radio"
                aria-checked={on}
                className={`c-cap-target ${on ? 'on' : ''}`}
                style={style}
                onClick={() => setPicked(t.id)}
              >
                <span className="c-cap-target-top">
                  {t.id ? <Avatar id={t.id} size={22} /> : <Either size={22} />}
                  <b>{t.label}</b>
                  <span className="c-cap-sub">{t.sub}</span>
                </span>
                <span className="c-cap-ghost" aria-hidden={!on}>
                  {on && raw.trim() ? (
                    <>
                      <i className="c-ghost-bead" />
                      <span>{parsed.title}</span>
                    </>
                  ) : (
                    <span className="c-ghost-empty">{on ? 'Lands here' : ''}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="c-cap-foot">
          <span className="c-cap-hint">
            Try <code>@theo</code> <code>tomorrow</code> <code>#reno</code> <code>!</code>
          </span>
          <button type="button" className="c-btn ink" disabled={!parsed.title} onClick={submit}>
            Add to {owner === null ? 'up for grabs' : owner === 'maya' ? 'your lane' : "Theo's lane"}
            <CornerDownLeft size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

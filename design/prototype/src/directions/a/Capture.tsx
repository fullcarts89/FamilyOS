// Quick capture: one field, a live reading of what was typed, and a Me / Theo / Either choice.
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CornerDownLeft, Flag, Folder, Plus, X } from 'lucide-react';
import { people, type PersonId } from '../../data';
import { parseCapture, useFamily } from '../../store';
import { cx, projectTitle } from './helpers';
import { Kbd, OwnerMark, OwnerSwitch, icSm } from './ui';

const AUTO = 'auto' as const;

export function CaptureBox({
  variant,
  onDone,
  onCancel,
}: {
  variant: 'inline' | 'sheet';
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const f = useFamily();
  const [text, setText] = useState('');
  const [owner, setOwner] = useState<PersonId | null | typeof AUTO>(AUTO);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (variant === 'sheet') input.current?.focus();
  }, [variant]);

  const parsed = parseCapture(text);
  const effOwner = owner === AUTO ? parsed.owner : owner;
  const active = text.trim().length > 0;
  const proj = projectTitle(parsed.projectId);

  const submit = () => {
    if (!parsed.title) return;
    f.capture(text, { owner: effOwner });
    setText('');
    setOwner(AUTO);
    onDone?.();
  };

  const ownerText = effOwner === null ? 'Either of you' : effOwner === 'maya' ? 'You' : people[effOwner].name;

  return (
    <form
      className={cx('a-capture', `a-capture--${variant}`, (active || variant === 'sheet') && 'is-active')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="a-capture-field">
        <Plus className="a-capture-plus" size={18} strokeWidth={2} aria-hidden="true" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              if (variant === 'sheet') onCancel?.();
              else if (text) setText('');
              else e.currentTarget.blur();
            }
          }}
          placeholder="Add something for the household…"
          aria-label="Add something for the household"
          autoComplete="off"
          spellCheck={false}
        />
        {variant === 'inline' && !active && (
          <span className="a-capture-hint">
            <Kbd>N</Kbd>
          </span>
        )}
        {variant === 'sheet' && (
          <button type="button" className="a-icon-btn" aria-label="Close" onClick={onCancel}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      {(active || variant === 'sheet') && (
        <div className="a-capture-panel">
          <div className="a-capture-read" aria-live="polite">
            {active ? (
              <>
                <span className="a-capture-title">{parsed.title || '…'}</span>
                <span className="a-chip">
                  <OwnerMark owner={effOwner} size={16} />
                  {ownerText}
                </span>
                <span className={cx('a-chip', !parsed.dueLabel && 'is-faint')}>
                  <CalendarDays {...icSm} aria-hidden="true" />
                  {parsed.dueLabel ?? 'No date'}
                </span>
                <span className="a-chip">
                  <Folder {...icSm} aria-hidden="true" />
                  {proj ?? parsed.area}
                </span>
                {parsed.priority && (
                  <span className="a-chip is-flag">
                    <Flag {...icSm} aria-hidden="true" />
                    Important
                  </span>
                )}
              </>
            ) : (
              <span className="a-capture-tip">
                Try “Call the plumber tomorrow @theo #reno”. Say who, when and where it belongs, and it sorts itself.
              </span>
            )}
          </div>
          <div className="a-capture-actions">
            <OwnerSwitch value={effOwner} onChange={(o) => setOwner(o)} size="sm" label="Who is this for" />
            <button type="submit" className="a-btn a-btn--primary" disabled={!parsed.title}>
              Add
              <CornerDownLeft size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function CaptureSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="a-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="a-sheet" role="dialog" aria-modal="true" aria-label="Capture">
        <p className="a-sheet-eyebrow">Capture</p>
        <CaptureBox variant="sheet" onDone={onClose} onCancel={onClose} />
      </div>
    </div>
  );
}

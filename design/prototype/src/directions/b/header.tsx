// The 44px header bar every screen renders at the top of the main pane.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from './util';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export function PageHeader({
  crumbs,
  tabs,
  tab,
  onTab,
  right,
}: {
  crumbs: ReactNode[];
  tabs?: TabDef[];
  tab?: string;
  onTab?: (id: string) => void;
  right?: ReactNode;
}) {
  return (
    <header className="b-pagehead">
      <nav className="b-crumbs" aria-label="Location">
        {crumbs.map((c, i) => (
          <span key={i} className={cx('b-crumb', i === crumbs.length - 1 && 'is-last')}>
            {i > 0 && <ChevronRight size={14} strokeWidth={1.5} className="b-crumb-sep" />}
            {c}
          </span>
        ))}
      </nav>
      {tabs && (
        <div className="b-tabs" role="tablist" aria-label="Views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              className={cx('b-tab', t.id === tab && 'is-on')}
              onClick={() => onTab?.(t.id)}
            >
              {t.label}
              {t.count !== undefined && <span className="b-tab-count mono">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="b-pagehead-right">{right}</div>
    </header>
  );
}

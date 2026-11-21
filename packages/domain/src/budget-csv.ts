/**
 * Monarch budget export (CSV upload; Monarch's terms forbid automated access by other apps).
 * Column names vary between exports and versions, so the parser is tolerant: headers are matched
 * case-insensitively against known aliases, in either a long layout (one row per month and
 * category) or a wide one (a category per row, "Nov 2026 Budget" / "Nov 2026 Actual" columns).
 * It keeps category-level budgeted and actual amounts only and refuses transaction exports
 * outright, so merchants, accounts and statements never enter the database.
 *
 * Pure: no I/O, no clock. Errors carry a fixed code and never the file's content.
 */

export const BUDGET_CSV_ERRORS = [
  'empty_csv',
  'invalid_csv',
  'unrecognized_csv',
  'transactions_csv',
  'month_missing',
  'invalid_month',
  'invalid_amount',
  'too_many_rows',
  'too_many_months',
] as const;
export type BudgetCsvErrorCode = (typeof BUDGET_CSV_ERRORS)[number];

export class BudgetCsvError extends Error {
  constructor(readonly code: BudgetCsvErrorCode) {
    super(code);
    this.name = 'BudgetCsvError';
  }
}

/** Header aliases, already normalized (lowercase, words separated by single spaces). */
export const BUDGET_CSV_HEADERS = {
  month: ['month', 'date', 'period', 'budget month', 'month start', 'start date'],
  category: ['category', 'category name', 'budget category', 'name'],
  group: ['group', 'category group', 'group name', 'parent category'],
  budgeted: [
    'budget',
    'budgeted',
    'budgeted amount',
    'budget amount',
    'planned',
    'planned amount',
    'amount budgeted',
    'target',
  ],
  actual: [
    'actual',
    'actuals',
    'actual amount',
    'actual spending',
    'actual spent',
    'spent',
    'spending',
    'amount spent',
  ],
} as const;

/** Headers that only a transaction or account export has. */
const TRANSACTION_HEADERS = [
  'merchant',
  'account',
  'account name',
  'original statement',
  'transaction',
  'transaction date',
];

export const MAX_BUDGET_ROWS = 5000;
export const MAX_BUDGET_MONTHS = 36;
const MAX_TEXT = 80;
const MAX_AMOUNT = 1e10;

export interface BudgetRow {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  category: string;
  group: string | null;
  budgeted: number | null;
  actual: number | null;
}

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** RFC 4180 rows: quoted fields, doubled quotes, CR/LF/CRLF. The delimiter is detected. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  // The delimiter that appears most in the first lines (a preamble line may have none).
  const head = text.split(/\r\n|\r|\n/, 6).join('\n');
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    head.split(d).length > head.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      field += ch;
    }
    i += 1;
  }
  if (quoted) throw new BudgetCsvError('invalid_csv');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

export const normalizeHeader = (header: string): string =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/** 1–12 for a month name or its abbreviation ("Nov", "Sept", "November"); 0 otherwise. */
const monthNamed = (name: string): number => {
  const n = name.toLowerCase();
  if (n.length < 3) return 0;
  const index = MONTH_NAMES.findIndex(
    (full) => full.startsWith(n) || (n === 'sept' && full === 'september'),
  );
  return index + 1;
};

const monthStart = (year: number, month: number): string | null =>
  year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    ? `${year}-${String(month).padStart(2, '0')}-01`
    : null;

/**
 * A month in any of the usual spellings, as YYYY-MM-01: 2026-11, 2026-11-01(T…), 2026/11,
 * 11/2026, 11/1/2026 (US order), Nov 2026, November 2026, 2026 Nov. Null when it isn't one.
 */
export function parseMonth(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?(?:[T ].*)?$/.exec(v);
  if (m) return monthStart(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/.exec(v);
  if (m) return monthStart(Number(m[2]), Number(m[1]));
  m = /^([A-Za-z]+)\.?[\s,-]+(\d{4})$/.exec(v);
  if (m?.[1]) return monthStart(Number(m[2]), monthNamed(m[1]));
  m = /^(\d{4})[\s,-]+([A-Za-z]+)$/.exec(v);
  if (m?.[2]) return monthStart(Number(m[1]), monthNamed(m[2]));
  return null;
}

/** "$1,234.50", "-12", "(45.00)" (negative), "" or "-" (no figure). */
export function parseAmount(value: string): number | null {
  let v = value
    .trim()
    .replace(/[$€£\s]/g, '')
    .replace(/,/g, '');
  if (v === '' || v === '-' || v === '—') return null;
  let negative = false;
  const paren = /^\((.*)\)$/.exec(v);
  if (paren) {
    negative = true;
    v = paren[1] ?? '';
  }
  if (v.startsWith('-')) {
    negative = !negative;
    v = v.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(v)) throw new BudgetCsvError('invalid_amount');
  const n = Math.round(Number(v) * 100) / 100;
  if (n >= MAX_AMOUNT) throw new BudgetCsvError('invalid_amount');
  return negative ? -n : n;
}

const isTotalRow = (category: string) => {
  const c = normalizeHeader(category);
  return c === 'total' || c === 'totals' || c.startsWith('total ') || c === 'grand total';
};

const clip = (value: string) => value.trim().slice(0, MAX_TEXT).trim();

// ---------------------------------------------------------------------------------------------
// Layout detection
// ---------------------------------------------------------------------------------------------

type Field = keyof typeof BUDGET_CSV_HEADERS;

interface WideColumn {
  index: number;
  month: string;
  kind: 'budgeted' | 'actual';
}

/** "Nov 2026 Budget", "2026-11 Actual", "November 2026 - Spent": a month and a figure. */
function wideColumn(header: string, index: number): WideColumn | null {
  const words = header
    .trim()
    .split(/[\s\-–:|]+/)
    .filter(Boolean);
  for (let cut = 1; cut < words.length; cut += 1) {
    for (const [monthWords, kindWords] of [
      [words.slice(0, cut), words.slice(cut)],
      [words.slice(cut), words.slice(0, cut)],
    ] as const) {
      const month = parseMonth(monthWords.join(' '));
      const kind = normalizeHeader(kindWords.join(' '));
      if (!month) continue;
      if ((BUDGET_CSV_HEADERS.budgeted as readonly string[]).includes(kind)) {
        return { index, month, kind: 'budgeted' };
      }
      if ((BUDGET_CSV_HEADERS.actual as readonly string[]).includes(kind)) {
        return { index, month, kind: 'actual' };
      }
    }
  }
  return null;
}

interface Layout {
  headerRow: number;
  columns: Partial<Record<Field, number>>;
  wide: WideColumn[];
}

function detectLayout(rows: string[][]): Layout {
  // A preamble (a title, an export date) may come before the header row.
  for (let r = 0; r < Math.min(rows.length, 5); r += 1) {
    const headers = (rows[r] ?? []).map(normalizeHeader);
    if (headers.some((h) => TRANSACTION_HEADERS.includes(h))) {
      throw new BudgetCsvError('transactions_csv');
    }
    const columns: Partial<Record<Field, number>> = {};
    for (const field of Object.keys(BUDGET_CSV_HEADERS) as Field[]) {
      const aliases = BUDGET_CSV_HEADERS[field] as readonly string[];
      const index = headers.findIndex((h) => aliases.includes(h));
      if (index >= 0) columns[field] = index;
    }
    if (columns.category === undefined) continue;
    const wide = (rows[r] ?? []).flatMap((h, i) => {
      const column = wideColumn(h, i);
      return column ? [column] : [];
    });
    if (columns.budgeted !== undefined || columns.actual !== undefined || wide.length > 0) {
      return { headerRow: r, columns, wide };
    }
  }
  throw new BudgetCsvError('unrecognized_csv');
}

/**
 * Budget rows from a Monarch budget export. `defaultMonth` (YYYY-MM-01) applies to a long-layout
 * file without a month column. Rows without a category (group headings) and total rows are
 * skipped; a category listed twice in a month keeps its last figures.
 */
export function parseBudgetCsv(text: string, options: { defaultMonth?: string } = {}): BudgetRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new BudgetCsvError('empty_csv');
  if (rows.length > MAX_BUDGET_ROWS + 5) throw new BudgetCsvError('too_many_rows');
  const { headerRow, columns, wide } = detectLayout(rows);
  const long = columns.budgeted !== undefined || columns.actual !== undefined;
  if (long && columns.month === undefined && !options.defaultMonth) {
    throw new BudgetCsvError('month_missing');
  }

  const cell = (row: string[], index: number | undefined) =>
    index === undefined ? '' : (row[index] ?? '').trim();
  const out = new Map<string, BudgetRow>();
  const put = (row: BudgetRow) => {
    if (row.budgeted === null && row.actual === null) return;
    out.set(`${row.month}|${row.category}`, row);
  };

  for (const row of rows.slice(headerRow + 1)) {
    const category = clip(cell(row, columns.category));
    if (category === '' || isTotalRow(category)) continue;
    const groupText = clip(cell(row, columns.group));
    const group = groupText === '' ? null : groupText;
    if (long) {
      const monthText = cell(row, columns.month);
      const month = monthText === '' ? (options.defaultMonth ?? null) : parseMonth(monthText);
      if (!month) throw new BudgetCsvError('invalid_month');
      put({
        month,
        category,
        group,
        budgeted: parseAmount(cell(row, columns.budgeted)),
        actual: parseAmount(cell(row, columns.actual)),
      });
    } else {
      const months = [...new Set(wide.map((w) => w.month))];
      for (const month of months) {
        const figure = (kind: WideColumn['kind']) => {
          const column = wide.find((w) => w.month === month && w.kind === kind);
          return column ? parseAmount(cell(row, column.index)) : null;
        };
        put({ month, category, group, budgeted: figure('budgeted'), actual: figure('actual') });
      }
    }
  }

  const result = [...out.values()];
  if (result.length > MAX_BUDGET_ROWS) throw new BudgetCsvError('too_many_rows');
  if (new Set(result.map((r) => r.month)).size > MAX_BUDGET_MONTHS) {
    throw new BudgetCsvError('too_many_months');
  }
  if (result.length === 0) throw new BudgetCsvError('empty_csv');
  return result.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      (a.group ?? '').localeCompare(b.group ?? '') ||
      a.category.localeCompare(b.category),
  );
}

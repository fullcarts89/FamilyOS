import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BudgetCsvError,
  parseAmount,
  parseBudgetCsv,
  parseCsv,
  parseMonth,
  type BudgetCsvErrorCode,
} from './budget-csv';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/budgets/${name}`, import.meta.url), 'utf8');

const codeOf = (fn: () => unknown): BudgetCsvErrorCode | null => {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof BudgetCsvError) return error.code;
    throw error;
  }
};

describe('CSV rows', () => {
  it('handles quotes, doubled quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('detects semicolons and tabs, and rejects an unterminated quote', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2')[1]).toEqual(['1', '2']);
    expect(codeOf(() => parseCsv('a,"b\n1,2'))).toBe('invalid_csv');
  });
});

describe('months and amounts', () => {
  it('reads the usual month spellings', () => {
    for (const value of [
      '2026-11',
      '2026-11-01',
      '2026-11-01T00:00:00Z',
      '2026/11',
      '11/2026',
      '11/1/2026',
      'Nov 2026',
      'November 2026',
      'Nov. 2026',
      '2026 Nov',
    ]) {
      expect({ value, month: parseMonth(value) }).toEqual({ value, month: '2026-11-01' });
    }
    expect(parseMonth('Sept 2026')).toBe('2026-09-01');
    for (const value of ['Budget 2026', '13/2026', '2026-00', 'soon', '']) {
      expect(parseMonth(value)).toBeNull();
    }
  });

  it('reads currency, thousands separators and negatives', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5);
    expect(parseAmount('(45.00)')).toBe(-45);
    expect(parseAmount('-$12')).toBe(-12);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(codeOf(() => parseAmount('12 apples'))).toBe('invalid_amount');
  });
});

describe('Monarch budget exports', () => {
  it('reads the long layout, skipping group headings and totals', () => {
    expect(parseBudgetCsv(fixture('monarch-long.csv'))).toEqual([
      {
        month: '2026-10-01',
        category: 'Groceries',
        group: 'Food & Dining',
        budgeted: 1100,
        actual: 1154.02,
      },
      {
        month: '2026-11-01',
        category: 'Daycare',
        group: 'Childcare',
        budgeted: 1850,
        actual: 1850,
      },
      {
        month: '2026-11-01',
        category: 'Groceries',
        group: 'Food & Dining',
        budgeted: 1100,
        actual: 842.17,
      },
      {
        month: '2026-11-01',
        category: 'Restaurants',
        group: 'Food & Dining',
        budgeted: 250,
        actual: 312.4,
      },
      { month: '2026-11-01', category: 'Pet Care', group: 'Pets', budgeted: 120, actual: 64.99 },
    ]);
  });

  it('reads the wide layout, one column pair per month, with a BOM', () => {
    const rows = parseBudgetCsv(fixture('monarch-wide.csv'));
    expect(rows.filter((r) => r.month === '2026-11-01')).toEqual([
      {
        month: '2026-11-01',
        category: 'Home Improvement, Repairs',
        group: 'Home',
        budgeted: 500,
        actual: -35,
      },
      { month: '2026-11-01', category: 'Mortgage', group: 'Home', budgeted: 2400, actual: 2400 },
      {
        month: '2026-11-01',
        category: 'Gas',
        group: 'Transportation',
        budgeted: 180,
        actual: 96.5,
      },
    ]);
    expect(rows.find((r) => r.month === '2026-10-01' && r.category === 'Gas')).toEqual({
      month: '2026-10-01',
      category: 'Gas',
      group: 'Transportation',
      budgeted: 180,
      actual: null,
    });
    expect(rows.some((r) => r.category.startsWith('Total'))).toBe(false);
  });

  it('takes the month from the upload when the file has none', () => {
    const text = fixture('semicolon-no-month.csv');
    expect(codeOf(() => parseBudgetCsv(text))).toBe('month_missing');
    expect(parseBudgetCsv(text, { defaultMonth: '2026-11-01' })).toEqual([
      { month: '2026-11-01', category: 'Groceries', group: null, budgeted: 900, actual: 712.5 },
      { month: '2026-11-01', category: 'Kids "fun" money', group: null, budgeted: 40, actual: 12 },
    ]);
  });

  it('finds the header row after a preamble and rejects a bad amount', () => {
    expect(
      codeOf(() =>
        parseBudgetCsv(fixture('semicolon-bad-amount.csv'), { defaultMonth: '2026-11-01' }),
      ),
    ).toBe('invalid_amount');
  });

  it('refuses transaction exports and files it does not recognize', () => {
    expect(codeOf(() => parseBudgetCsv(fixture('transactions.csv')))).toBe('transactions_csv');
    expect(codeOf(() => parseBudgetCsv(fixture('unrecognized.csv')))).toBe('unrecognized_csv');
    expect(codeOf(() => parseBudgetCsv(''))).toBe('empty_csv');
    expect(
      codeOf(() => parseBudgetCsv('Category,Budget\nTotal,10\n', { defaultMonth: '2026-11-01' })),
    ).toBe('empty_csv');
    expect(codeOf(() => parseBudgetCsv('Month,Category,Budget\nsoon,Gas,10\n'))).toBe(
      'invalid_month',
    );
  });
});

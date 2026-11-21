import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** axe-core (MPL-2.0, a dev dependency of the E2E suite only; never shipped in the app). */
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodes: { target: string; html: string; summary: string }[];
}

/** The WCAG 2.2 A/AA rules plus axe's best practices. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Runs axe over the page as it is now (the whole document, open dialogs included). */
export async function axe(page: Page): Promise<AxeViolation[]> {
  const loaded = await page.evaluate(() => 'axe' in window);
  if (!loaded) await page.evaluate(AXE_SOURCE);
  return page.evaluate(async (tags) => {
    const w = window as unknown as {
      axe: {
        run: (
          context: Document,
          options: object,
        ) => Promise<{
          violations: {
            id: string;
            impact: AxeViolation['impact'];
            help: string;
            nodes: { target: unknown[]; html: string; failureSummary?: string }[];
          }[];
        }>;
      };
    };
    const result = await w.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations'],
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target.map(String).join(' '),
        html: n.html.slice(0, 200),
        summary: (n.failureSummary ?? '').slice(0, 300),
      })),
    }));
  }, TAGS);
}

/** Only what the gate fails on. */
export const blocking = (violations: AxeViolation[]) =>
  violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');

/**
 * axe's label-in-name check reads a control's text by joining its text nodes with nothing between
 * them, and counts text the app marks decorative (aria-hidden: an avatar's initial, a key hint).
 * react-native-web renders every line as its own <div>, so "Laundry" + "Monday" reads as
 * "LaundryMonday" and never matches the name "Laundry, Monday". This re-checks each such node the
 * way WCAG 2.5.3 means it: the words shown (decorative parts left out, lines kept apart) must
 * appear, in order and together, in the accessible name. Nodes that pass are dropped; the rest
 * stay blocking.
 */
export async function recheckLabelInName(
  page: Page,
  violations: AxeViolation[],
): Promise<AxeViolation[]> {
  const out: AxeViolation[] = [];
  for (const v of violations) {
    if (v.id !== 'label-content-name-mismatch') {
      out.push(v);
      continue;
    }
    const nodes: AxeViolation['nodes'] = [];
    for (const n of v.nodes) {
      const shownText = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return 'not found';
        const words: string[] = [];
        // Inline text runs on ("7" + "pm"); a new block starts a new word, as on screen.
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            words.push(node.nodeValue ?? '');
            return;
          }
          if (!(node instanceof Element)) return;
          if (node.getAttribute('aria-hidden') === 'true') return;
          const block = getComputedStyle(node).display !== 'inline';
          if (block) words.push(' ');
          node.childNodes.forEach(walk);
          if (block) words.push(' ');
        };
        walk(el);
        const tokens = (text: string) =>
          text
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean);
        const shown = tokens(words.join(''));
        const name = tokens(el.getAttribute('aria-label') ?? el.textContent ?? '');
        if (shown.length === 0) return null;
        for (let i = 0; i + shown.length <= name.length; i++) {
          if (shown.every((w, j) => name[i + j] === w)) return null;
        }
        return shown.join(' ');
      }, n.target);
      if (shownText !== null)
        nodes.push({ ...n, summary: `Shows “${shownText}”, named otherwise` });
    }
    if (nodes.length) out.push({ ...v, nodes });
  }
  return out;
}

export interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Every visible control's tappable area inside `scope` (a CSS selector, default the whole page):
 * its own frame joined with its children's (the web's stand-in for hitSlop is an invisible child
 * that reaches past the control's edges).
 */
export async function tapTargets(page: Page, scope = 'body'): Promise<Box[]> {
  return page.evaluate((selector) => {
    const roles =
      'button, a, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';
    const out: { name: string; x: number; y: number; width: number; height: number }[] = [];
    for (const container of Array.from(document.querySelectorAll(selector))) {
      for (const node of Array.from(container.querySelectorAll(roles))) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if ((node as HTMLElement).offsetParent === null) continue;
        if (node.closest('[aria-hidden="true"]')) continue;
        let left = r.left;
        let top = r.top;
        let right = r.right;
        let bottom = r.bottom;
        for (const child of Array.from(node.querySelectorAll('*'))) {
          const c = child.getBoundingClientRect();
          if (c.width === 0 || c.height === 0) continue;
          left = Math.min(left, c.left);
          top = Math.min(top, c.top);
          right = Math.max(right, c.right);
          bottom = Math.max(bottom, c.bottom);
        }
        const name =
          node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 60);
        out.push({ name, x: left, y: top, width: right - left, height: bottom - top });
      }
    }
    return out;
  }, scope);
}

/** Starts recording, every animation frame, the transform and opacity of toasts, sheets and cards. */
export async function recordFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __frames: { what: string; transform: string; opacity: string }[];
      __recording: boolean;
    };
    w.__frames = [];
    w.__recording = true;
    const watch = () => {
      if (!w.__recording) return;
      const roots = Array.from(document.querySelectorAll('[role="status"], [role="dialog"]'));
      for (const root of roots) {
        const what = `${root.getAttribute('role')}: ${(root.textContent ?? '').trim().slice(0, 40)}`;
        for (const el of [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[]) {
          // Spinners turn by design; the check is about entrances and exits.
          if (el.closest('[role="progressbar"]')) continue;
          const transform = el.style.transform;
          const opacity = el.style.opacity;
          if (transform || opacity) w.__frames.push({ what, transform, opacity });
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

/** Stops recording; returns the frames where something moved, scaled or was part-transparent. */
export async function movingFrames(
  page: Page,
): Promise<{ what: string; transform: string; opacity: string }[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __frames: { what: string; transform: string; opacity: string }[];
      __recording: boolean;
    };
    w.__recording = false;
    // translate(0), scale(1) and the identity matrix are "not moving".
    const still =
      /^(translate[XYZ]?\((0(px)?(,\s*)?)+\)|scale[XY]?\(1(,\s*1)?\)|matrix\(1, 0, 0, 1, 0, 0\))$/;
    const identity = (t: string) =>
      !t || t === 'none' || (t.match(/[a-zA-Z0-9]+\([^)]*\)/g) ?? [t]).every((p) => still.test(p));
    return w.__frames.filter(
      (f) => !identity(f.transform) || (f.opacity !== '' && Number(f.opacity) < 1),
    );
  });
}

/** Whether two boxes overlap by more than a pixel. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    a.x + 1 < b.x + b.width &&
    b.x + 1 < a.x + a.width &&
    a.y + 1 < b.y + b.height &&
    b.y + 1 < a.y + a.height
  );
}

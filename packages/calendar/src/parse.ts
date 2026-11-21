import { Worker } from 'node:worker_threads';
import { CalendarFetchError } from './fetch';
import type { ImportedOccurrence, ParseFailureCode, ParseJob, ParseWindow } from './parse-core';

export type { ImportedOccurrence, ParseWindow } from './parse-core';
export { MAX_OCCURRENCES, MAX_TOTAL_STEPS } from './parse-core';

/**
 * Parsing a calendar off the event loop. ical.js is synchronous and a small hostile file can
 * keep it busy for ever, so each parse runs in its own worker thread with a memory ceiling and
 * a hard deadline; past either, the thread is stopped and the calendar is refused with the
 * fixed code 'too_complex'. The parse itself fails faster on its own step budget
 * (parse-core.ts). At most PARALLEL_PARSES run at once, so a burst can't exhaust memory.
 */

export const PARSE_DEADLINE_MS = 5_000;
export const PARSE_MEMORY_MB = 128;
const PARALLEL_PARSES = 2;

const workerUrl = new URL('./parse-worker.ts', import.meta.url);

let running = 0;
const waiting: (() => void)[] = [];
async function slot(): Promise<() => void> {
  if (running >= PARALLEL_PARSES) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  return () => {
    running--;
    waiting.shift()?.();
  };
}

type Reply =
  { ok: true; occurrences: ImportedOccurrence[] } | { ok: false; code: ParseFailureCode };

function inWorker(job: ParseJob, deadlineMs: number): Promise<ImportedOccurrence[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: job,
      resourceLimits: { maxOldGenerationSizeMb: PARSE_MEMORY_MB },
      stdout: false,
      stderr: false,
    });
    let settled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      outcome();
    };
    const timer = setTimeout(
      () => finish(() => reject(new CalendarFetchError('too_complex'))),
      deadlineMs,
    );
    worker.on('message', (reply: Reply) =>
      finish(() =>
        reply.ok ? resolve(reply.occurrences) : reject(new CalendarFetchError(reply.code)),
      ),
    );
    worker.on('error', (error: Error & { code?: string }) =>
      finish(() =>
        reject(
          error.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new CalendarFetchError('too_complex')
            : // The worker itself couldn't run (a deployment problem): not the calendar's fault.
              new Error('calendar parse worker failed', { cause: error }),
        ),
      ),
    );
    worker.on('exit', () =>
      finish(() => reject(new Error('calendar parse worker exited without an answer'))),
    );
  });
}

/** Parses ICS text into occurrences overlapping the window. Throws CalendarFetchError. */
export async function parseCalendar(
  text: string,
  window: ParseWindow,
  options: { deadlineMs?: number } = {},
): Promise<ImportedOccurrence[]> {
  const release = await slot();
  try {
    return await inWorker(
      {
        text,
        from: window.from.toString(),
        to: window.to.toString(),
        timeZone: window.timeZone,
      },
      options.deadlineMs ?? PARSE_DEADLINE_MS,
    );
  } finally {
    release();
  }
}

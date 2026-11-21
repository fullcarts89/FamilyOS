import { parentPort, workerData } from 'node:worker_threads';
import { Temporal } from 'temporal-polyfill';
import { ParseFailure, parseIcs, type ParseJob } from './parse-core.ts';

/**
 * The parse worker (started by parse.ts): parses one calendar and posts the occurrences, or the
 * fixed reason it was refused. Node loads it by stripping types (or through tsx when the
 * process runs under tsx), so it imports parse-core.ts by its file name.
 */

const job = workerData as ParseJob;
try {
  const occurrences = parseIcs(job.text, {
    from: Temporal.Instant.from(job.from),
    to: Temporal.Instant.from(job.to),
    timeZone: job.timeZone,
  });
  parentPort?.postMessage({ ok: true, occurrences });
} catch (error) {
  // Anything else ical.js or the conversions throw means the file couldn't be read.
  parentPort?.postMessage({
    ok: false,
    code: error instanceof ParseFailure ? error.code : 'not_calendar',
  });
}

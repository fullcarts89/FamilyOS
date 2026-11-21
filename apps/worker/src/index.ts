import { parseCalendarKey } from '@familyos/calendar';
import { createDb, databaseUrl } from '@familyos/db';
import { run } from 'graphile-worker';
import { z } from 'zod';
import { pushSenderFor } from './push';
import { CRONTAB, createTaskList } from './tasks';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    /** The password for DATABASE_URL, when the host keeps it separately (Railway). */
    DATABASE_PASSWORD: z.string().min(1).optional(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
    /** 32 bytes, base64; the same key as the API's. Calendar sync is off without it. */
    CALENDAR_ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine((v) => {
        if (!v) return true;
        try {
          parseCalendarKey(v);
          return true;
        } catch {
          return false;
        }
      }),
    /**
     * Expo's push security token. Required in production: without it the worker sends no
     * notifications (it logs an error each run and keeps running).
     */
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  })
  .safeParse(process.env);

if (!env.success) {
  throw new Error(
    `Invalid worker configuration: ${env.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
}

const connectionString = databaseUrl(env.data.DATABASE_URL, env.data.DATABASE_PASSWORD);
const db = createDb({ connectionString });
const runner = await run({
  connectionString,
  concurrency: env.data.WORKER_CONCURRENCY,
  taskList: createTaskList(db, {
    ...(env.data.CALENDAR_ENCRYPTION_KEY && {
      calendarKey: parseCalendarKey(env.data.CALENDAR_ENCRYPTION_KEY),
    }),
    pushSender: pushSenderFor({
      NODE_ENV: process.env.NODE_ENV,
      EXPO_ACCESS_TOKEN: env.data.EXPO_ACCESS_TOKEN,
    }),
  }),
  crontab: CRONTAB,
});
// Report in straight away, so readiness shows a fresh deploy as running without a 10-minute wait.
await runner.addJob('heartbeat', {}, { jobKey: 'heartbeat_on_start' });

await runner.promise;
await db.destroy();

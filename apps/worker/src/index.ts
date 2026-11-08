import { createDb } from '@familyos/db';
import { run } from 'graphile-worker';
import { z } from 'zod';
import { CRONTAB, createTaskList } from './tasks';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  })
  .safeParse(process.env);

if (!env.success) {
  throw new Error(
    `Invalid worker configuration: ${env.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
}

const db = createDb({ connectionString: env.data.DATABASE_URL });
const runner = await run({
  connectionString: env.data.DATABASE_URL,
  concurrency: env.data.WORKER_CONCURRENCY,
  taskList: createTaskList(db),
  crontab: CRONTAB,
});
// Report in straight away, so readiness shows a fresh deploy as running without a 10-minute wait.
await runner.addJob('heartbeat', {}, { jobKey: 'heartbeat_on_start' });

await runner.promise;
await db.destroy();

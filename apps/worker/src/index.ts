import { run } from 'graphile-worker';
import { z } from 'zod';
import { taskList } from './tasks';

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

const runner = await run({
  connectionString: env.data.DATABASE_URL,
  concurrency: env.data.WORKER_CONCURRENCY,
  taskList,
});

await runner.promise;

// Starts the API and, when WORKER_DATABASE_URL is set, the background worker in the same container
// (decision 6, 2026-11-14: one Railway service for a two-person household). Each process gets only
// the variables it uses (deploy/env.mjs): the worker its own database login, as DATABASE_URL and
// DATABASE_PASSWORD, and EXPO_ACCESS_TOKEN; the API its login and the Supabase secrets. If either
// process stops, the other is stopped too and the container exits, so Railway's restart policy
// brings both back.
import { spawn } from 'node:child_process';
import { apiEnv, workerEnv } from './env.mjs';

const tsx = 'node_modules/.bin/tsx';

const children = [];

function start(name, script, env) {
  const child = spawn(tsx, [script], { env, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    console.error(JSON.stringify({ level: 'error', msg: 'process_exited', name, code, signal }));
    for (const other of children)
      if (other !== child && other.exitCode === null) other.kill('SIGTERM');
    // The first process to stop decides the exit code; the ones stopped after it don't.
    process.exitCode ??= code ?? 1;
  });
  children.push(child);
}

start('api', 'apps/api/src/server.ts', apiEnv(process.env));

if (process.env.WORKER_DATABASE_URL) {
  start('worker', 'apps/worker/src/index.ts', workerEnv(process.env));
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  });
}

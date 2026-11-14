// Starts the API and, when WORKER_DATABASE_URL is set, the background worker in the same container
// (decision 6, 2026-11-14: one Railway service for a two-person household). Each process keeps its
// own database login: the worker gets WORKER_DATABASE_URL and WORKER_DATABASE_PASSWORD as its
// DATABASE_URL and DATABASE_PASSWORD, and none of the API's credentials. If either process stops,
// the other is stopped too and the container exits, so Railway's restart policy brings both back.
import { spawn } from 'node:child_process';

const tsx = 'node_modules/.bin/tsx';
const API_ONLY = ['DATABASE_URL', 'DATABASE_PASSWORD', 'SUPABASE_SECRET_KEY'];
const WORKER_ONLY = ['WORKER_DATABASE_URL', 'WORKER_DATABASE_PASSWORD'];

function without(env, names) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)));
}

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

start('api', 'apps/api/src/server.ts', without(process.env, WORKER_ONLY));

if (process.env.WORKER_DATABASE_URL) {
  start('worker', 'apps/worker/src/index.ts', {
    ...without(process.env, [...API_ONLY, ...WORKER_ONLY]),
    DATABASE_URL: process.env.WORKER_DATABASE_URL,
    ...(process.env.WORKER_DATABASE_PASSWORD && {
      DATABASE_PASSWORD: process.env.WORKER_DATABASE_PASSWORD,
    }),
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  });
}

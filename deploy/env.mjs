// What each process in the app service may see (deploy/start.mjs). An allow-list, so a variable
// added to the service later reaches neither process until it is named here: the API's auth
// secrets stay out of the worker, the worker's push and database credentials out of the API.

/** The runtime's own variables, for both. */
const RUNTIME = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TZ',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
];

/** apps/api/src/config.ts, plus what Railway and the image set for it. */
export const API_VARIABLES = [
  ...RUNTIME,
  'PORT',
  'API_PORT',
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWKS_URL',
  'SUPABASE_JWT_SECRET',
  'INVITE_LINK_BASE',
  'RAILWAY_PUBLIC_DOMAIN',
  'RAILWAY_GIT_COMMIT_SHA',
  'WEB_DIST_DIR',
  'WEB_SUPABASE_URL',
  'CALENDAR_ENCRYPTION_KEY',
  'CORS_ORIGINS',
];

/** apps/worker/src/index.ts; its database login arrives as WORKER_DATABASE_URL/PASSWORD. */
export const WORKER_VARIABLES = [
  ...RUNTIME,
  'WORKER_CONCURRENCY',
  'CALENDAR_ENCRYPTION_KEY',
  'EXPO_ACCESS_TOKEN',
];

const pick = (env, names) =>
  Object.fromEntries(names.filter((name) => env[name] !== undefined).map((n) => [n, env[n]]));

/** The API's environment. */
export function apiEnv(env) {
  return pick(env, API_VARIABLES);
}

/** The worker's environment: its own login as DATABASE_URL and DATABASE_PASSWORD. */
export function workerEnv(env) {
  return {
    ...pick(env, WORKER_VARIABLES),
    DATABASE_URL: env.WORKER_DATABASE_URL,
    ...(env.WORKER_DATABASE_PASSWORD && { DATABASE_PASSWORD: env.WORKER_DATABASE_PASSWORD }),
  };
}

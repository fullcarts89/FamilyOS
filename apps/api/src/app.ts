import { workerLastSeen } from '@familyos/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Deps } from './http/env';
import { ApiError } from './http/errors';
import { householdScope, requireUser } from './http/middleware';
import { accountRoutes, inviteClaimRoutes } from './routes/account';
import { householdRoutes } from './routes/household';
import { workItemRoutes } from './routes/work-items';
import { exportRoutes } from './routes/export';
import { todayRoutes } from './routes/today';
import { routineRoutes } from './routes/routines';
import { eventRoutes } from './routes/events';
import { rhythmRoutes } from './routes/rhythm';
import { calendarRoutes, calendarSyncRoutes } from './routes/calendars';
import { meRoutes } from './routes/me';
import { activityRoutes } from './routes/activity';
import { contactRoutes } from './routes/contacts';
import { decisionRoutes } from './routes/decisions';
import { groceryRoutes, mealRoutes } from './routes/meals';
import { BUDGET_IMPORT_BODY_LIMIT, BUDGET_IMPORT_PATH, budgetRoutes } from './routes/budgets';
import { resetRoutes } from './routes/reset';
import { widgetRoutes } from './routes/widget';

/** Three missed heartbeats (every 10 minutes) mean the worker has stopped. */
const WORKER_STALE_AFTER_MS = 30 * 60 * 1000;

export function workerStatus(lastSeen: Date | null, now: Date): 'ok' | 'stale' | 'never_seen' {
  if (lastSeen === null) return 'never_seen';
  return now.getTime() - lastSeen.getTime() > WORKER_STALE_AFTER_MS ? 'stale' : 'ok';
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.use('*', requestId());
  app.use('*', secureHeaders());
  const corsOrigins = deps.corsOrigins ?? [];
  if (corsOrigins.length > 0) {
    app.use(
      '*',
      cors({
        origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: 600,
      }),
    );
  }
  const tooLarge = () => {
    throw new ApiError(413, 'body_too_large');
  };
  const smallBody = bodyLimit({ maxSize: 64 * 1024, onError: tooLarge });
  // Budget exports are larger than any other request; only that route accepts up to 1 MB.
  const uploadBody = bodyLimit({ maxSize: BUDGET_IMPORT_BODY_LIMIT, onError: tooLarge });
  app.use('*', (c, next) =>
    (c.req.method === 'POST' && BUDGET_IMPORT_PATH.test(c.req.path) ? uploadBody : smallBody)(
      c,
      next,
    ),
  );
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    deps.logger.info('request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });

  const version = deps.version ?? 'dev';
  app.get('/health', (c) => c.json({ status: 'ok', version }));

  // Readiness (plan M4): 503 only when the database can't be used, so a stopped worker never
  // blocks an API deploy; it shows as `degraded` for the uptime check instead.
  app.get('/health/ready', async (c) => {
    try {
      const worker = workerStatus(
        await workerLastSeen(deps.db),
        (deps.now ?? (() => new Date()))(),
      );
      return c.json({
        status: worker === 'ok' ? 'ok' : 'degraded',
        database: 'ok',
        worker,
        version,
      });
    } catch (error) {
      deps.logger.error('readiness_failed', {
        requestId: c.get('requestId'),
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      return c.json({ status: 'unavailable', database: 'unavailable', version }, 503);
    }
  });

  // Before the signed-in routes, so their auth check never runs for it.
  app.route('/', inviteClaimRoutes(deps));

  const authed = new Hono<AppEnv>();
  authed.use('*', requireUser(deps));
  authed.route('/', accountRoutes(deps));
  // Before the household scope: sync must not hold the request transaction during the fetch.
  authed.route('/', calendarSyncRoutes(deps));

  const household = new Hono<AppEnv>();
  household.use('*', householdScope(deps));
  household.route('/', householdRoutes(deps));
  household.route('/', todayRoutes(deps));
  household.route('/work-items', workItemRoutes(deps));
  household.route('/routines', routineRoutes(deps));
  household.route('/events', eventRoutes(deps));
  household.route('/calendars', calendarRoutes(deps));
  household.route('/me', meRoutes(deps));
  household.route('/', activityRoutes(deps));
  household.route('/', rhythmRoutes(deps));
  household.route('/contacts', contactRoutes(deps));
  household.route('/decisions', decisionRoutes(deps));
  household.route('/meals', mealRoutes(deps));
  household.route('/groceries', groceryRoutes(deps));
  household.route('/budgets', budgetRoutes(deps));
  household.route('/reset', resetRoutes(deps));
  household.route('/', widgetRoutes(deps));
  household.route('/export', exportRoutes());
  authed.route('/households/:householdId', household);

  app.route('/', authed);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  // Errors return a fixed code; details (which may include household data) stay server-side.
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.code }, error.status);
    deps.logger.error('request_failed', { requestId: c.get('requestId'), errorName: error.name });
    return c.json({ error: 'internal_error', requestId: c.get('requestId') }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

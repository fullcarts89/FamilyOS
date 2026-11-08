import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Deps } from './http/env';
import { ApiError } from './http/errors';
import { householdScope, requireUser } from './http/middleware';
import { accountRoutes } from './routes/account';
import { householdRoutes } from './routes/household';
import { workItemRoutes } from './routes/work-items';
import { exportRoutes } from './routes/export';
import { todayRoutes } from './routes/today';
import { routineRoutes } from './routes/routines';

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
  app.use(
    '*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'body_too_large');
      },
    }),
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

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const authed = new Hono<AppEnv>();
  authed.use('*', requireUser(deps));
  authed.route('/', accountRoutes(deps));

  const household = new Hono<AppEnv>();
  household.use('*', householdScope(deps));
  household.route('/', householdRoutes(deps));
  household.route('/', todayRoutes(deps));
  household.route('/work-items', workItemRoutes(deps));
  household.route('/routines', routineRoutes(deps));
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

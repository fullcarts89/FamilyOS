import { mkdirSync } from 'node:fs';
import { Api } from './api';
import { ARTIFACTS_DIR, BASE_URL, MAYA, RECORD } from './env';
import {
  assertLocalStack,
  assertStackRunning,
  buildWeb,
  removeE2eAccounts,
  seedDemo,
  startServer,
} from './stack';

/**
 * The API runs under tsx, which compiles each route module on first use: touch the screens'
 * endpoints once so the first journey doesn't pay for it inside its timeouts.
 */
async function warmUp(): Promise<void> {
  await fetch(`${BASE_URL}/`);
  const maya = await Api.as(MAYA.email);
  const today = await maya.today();
  await Promise.all(
    [
      '',
      '/work-items',
      '/routines',
      `/events?from=${today}&to=${today}`,
      `/rhythm?date=${today}`,
      '/activity',
      '/me/state',
      '/contacts',
      '/decisions',
    ].map((path) => maya.request(`/households/${maya.householdId}${path}`)),
  );
}

/**
 * Before the run: check the local Supabase stack is up, clear accounts a previous run left,
 * reset the demo household, build the web app like production and start the API serving it.
 * Returns the teardown, which stops only the server started here and puts the demo back.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  assertLocalStack();
  await assertStackRunning();
  await removeE2eAccounts();
  await seedDemo();
  await buildWeb();
  if (RECORD) mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const stop = await startServer();
  await warmUp();

  return async () => {
    await stop();
    await removeE2eAccounts();
    // Leave a fresh demo household behind for local development.
    await seedDemo();
  };
}

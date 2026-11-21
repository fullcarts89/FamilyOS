// CI job "Previous release on this schema": the release running in production (main) must still
// behave on this branch's schema. Here: its API must refuse a pet as a task's owner (422), since
// this schema has pets and main never knew them. Run with main's own tsx and dependencies:
//   MAIN_DIR=<checkout of main> DATABASE_URL=... HOUSEHOLD_ID=... OWNER_USER_ID=... PET_ID=... \
//     <main>/node_modules/.bin/tsx scripts/ci/previous-release-pet-owner.mjs
const { MAIN_DIR, DATABASE_URL, HOUSEHOLD_ID, OWNER_USER_ID, PET_ID } = process.env;
if (!MAIN_DIR || !DATABASE_URL || !HOUSEHOLD_ID || !OWNER_USER_ID || !PET_ID) {
  throw new Error('set MAIN_DIR, DATABASE_URL, HOUSEHOLD_ID, OWNER_USER_ID and PET_ID');
}

const { createDb } = await import(`${MAIN_DIR}/packages/db/src/index.ts`);
const { createTestApp } = await import(`${MAIN_DIR}/apps/api/src/testing/harness.ts`);
const db = createDb({ connectionString: DATABASE_URL, maxConnections: 2 });
try {
  const { request, tokenFor } = createTestApp({ db });
  const token = await tokenFor({ userId: OWNER_USER_ID, email: 'owner@example.test' });
  const attempts = [
    [
      'create',
      'POST',
      '/work-items',
      { title: 'Feed the fish', ownerMemberId: PET_ID, inbox: false },
    ],
  ];
  let failed = 0;
  for (const [name, method, path, body] of attempts) {
    const res = await request(`/households/${HOUSEHOLD_ID}${path}`, { method, token, body });
    const ok = res.status === 422;
    if (!ok) failed++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${name} a task owned by a pet: ${res.status} ${await res.text()}`,
    );
  }
  if (failed > 0) {
    console.error(
      `main accepted a pet as owner (${failed} of ${attempts.length}); merge the main hotfix`,
    );
    process.exitCode = 1;
  }
} finally {
  await db.destroy();
}

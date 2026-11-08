import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { withRequestContext, withSchedulerContext } from './context';
import { workerLastSeen } from './health';
import type { Database } from './schema';
import {
  enableLogin,
  purgeHouseholds,
  seedHousehold,
  seedRoutine,
  type SeededHousehold,
} from './testing';

// The production logins (plan M4, gate G4): each service can reach exactly what it needs.
const url = process.env.DATABASE_URL;

const denied = (promise: Promise<unknown>) =>
  expect(promise).rejects.toThrow(/permission denied|must be able to SET ROLE/);

describe.skipIf(!url)('service logins', () => {
  const admin = createDb({ connectionString: url ?? '', maxConnections: 2 });
  let a: SeededHousehold;
  let b: SeededHousehold;
  let privateRoutine: string;

  beforeAll(async () => {
    a = await seedHousehold(admin, 'Logins A');
    b = await seedHousehold(admin, 'Logins B');
    privateRoutine = (
      await seedRoutine(admin, a, {
        title: 'Private routine',
        rule: { freq: 'daily', interval: 1 },
        startOn: '2026-11-08',
        visibility: 'private',
      })
    ).routineId;
    await seedRoutine(admin, b, { rule: { freq: 'daily', interval: 1 }, startOn: '2026-11-08' });
  });

  afterAll(async () => {
    await purgeHouseholds(admin, [a.id, b.id]);
    await admin.destroy();
  });

  const connect = async (
    role: 'familyos_api_login' | 'familyos_worker_login',
    fn: (db: Kysely<Database>) => Promise<void>,
  ) => {
    const login = await enableLogin(url ?? '', role);
    const db = createDb({ connectionString: login.url, maxConnections: 1 });
    try {
      await fn(db);
    } finally {
      await db.destroy();
      await login.disable();
    }
  };

  it('starts disabled: neither login can connect until the operator sets a password', async () => {
    const { rows } = await sql<{ rolname: string; rolcanlogin: boolean; rolbypassrls: boolean }>`
      select rolname, rolcanlogin, rolbypassrls from pg_roles
      where rolname in ('familyos_api_login', 'familyos_worker_login', 'familyos_scheduler')
      order by rolname
    `.execute(admin);
    expect(rows).toEqual([
      { rolname: 'familyos_api_login', rolcanlogin: false, rolbypassrls: false },
      { rolname: 'familyos_scheduler', rolcanlogin: false, rolbypassrls: false },
      { rolname: 'familyos_worker_login', rolcanlogin: false, rolbypassrls: false },
    ]);
  });

  it('API login: no access of its own, only through familyos_api and the request context', () =>
    connect('familyos_api_login', async (db) => {
      await denied(db.selectFrom('app.household').select('id').execute());
      await denied(db.selectFrom('app.work_item').select('id').execute());
      await denied(sql`set role familyos_scheduler`.execute(db));
      await denied(sql`set role postgres`.execute(db));
      await denied(sql`select count(*) from auth.users`.execute(db));

      const owner = a.owner;
      const titles = await withRequestContext(
        db,
        { userId: owner.userId ?? '', householdId: a.id, memberId: owner.id },
        (trx) => trx.selectFrom('app.work_item').select('household_id').execute(),
      );
      expect(titles.length).toBeGreaterThan(0);
      expect(titles.every((row) => row.household_id === a.id)).toBe(true);

      // The readiness check runs on this login too; it throws if the grant is missing.
      await workerLastSeen(db);
    }));

  it('worker login: no app access of its own and cannot act as the API', () =>
    connect('familyos_worker_login', async (db) => {
      await denied(db.selectFrom('app.household').select('id').execute());
      await denied(sql`set role familyos_api`.execute(db));
      await denied(sql`set role postgres`.execute(db));
      await denied(sql`select count(*) from auth.users`.execute(db));
    }));

  it('scheduler: one household per transaction, private items included, no edits', () =>
    connect('familyos_worker_login', async (db) => {
      const households = await withSchedulerContext(db, null, (trx) =>
        trx.selectFrom('app.household').select('id').execute(),
      );
      expect(households.map((h) => h.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      await denied(
        withSchedulerContext(db, null, (trx) =>
          trx.selectFrom('app.household').select('name').execute(),
        ),
      );

      const inA = await withSchedulerContext(db, a.id, (trx) =>
        trx.selectFrom('app.work_item').select(['id', 'household_id']).execute(),
      );
      expect(inA.map((r) => r.id)).toContain(privateRoutine);
      expect(inA.every((r) => r.household_id === a.id)).toBe(true);

      // Writing into another household than the transaction's is refused.
      await expect(
        withSchedulerContext(db, a.id, (trx) =>
          trx
            .insertInto('app.work_item')
            .values({
              household_id: b.id,
              type: 'task',
              title: 'x',
              status: 'ready',
              created_by_member_id: b.owner.id,
            })
            .execute(),
        ),
      ).rejects.toThrow(/row-level security/);

      await denied(
        withSchedulerContext(db, a.id, (trx) =>
          trx.updateTable('app.work_item').set({ title: 'changed' }).execute(),
        ),
      );
      await denied(
        withSchedulerContext(db, a.id, (trx) => trx.deleteFrom('app.work_item').execute()),
      );
      await denied(
        withSchedulerContext(db, a.id, (trx) =>
          trx.selectFrom('app.invite').select('id').execute(),
        ),
      );
      await denied(
        withSchedulerContext(db, a.id, (trx) =>
          trx.selectFrom('app.member').select('display_name').execute(),
        ),
      );
    }));
});

import { randomBytes } from 'node:crypto';
import pg from 'pg';

export type ServiceLogin = 'familyos_api_login' | 'familyos_worker_login';

/**
 * Enables a service login with a throwaway password for one test and returns its connection
 * string; `disable` turns it back into a NOLOGIN role with no password, as migrations leave it.
 * Test files run in parallel, so each holds an advisory lock on the role until it disables it.
 */
export async function enableLogin(
  adminUrl: string,
  role: ServiceLogin,
): Promise<{ url: string; disable: () => Promise<void> }> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query('select pg_advisory_lock(hashtext($1))', [role]);
  const password = randomBytes(18).toString('base64url');
  await admin.query(
    `alter role ${admin.escapeIdentifier(role)} with login password ${admin.escapeLiteral(password)}`,
  );
  const url = new URL(adminUrl);
  url.username = role;
  url.password = password;
  return {
    url: url.toString(),
    disable: async () => {
      try {
        await admin.query(`alter role ${admin.escapeIdentifier(role)} with nologin password null`);
      } finally {
        await admin.end();
      }
    },
  };
}

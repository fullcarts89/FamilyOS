// Turns on a service login with a new random password and prints its connection string once
// (plan M4). Run it after the migrations, and again to rotate a password; then paste the string
// into that service's DATABASE_URL on Railway. Nothing is written to disk or logged.
//
//   ADMIN_DATABASE_URL='postgresql://postgres.<ref>:...@<pooler-host>:5432/postgres' \
//     node scripts/ops/enable-login.mjs familyos_api_login
//
// ADMIN_DATABASE_URL is the Supabase session-pooler string for `postgres`. The printed string
// uses the same pooler with the role's own name (`<role>.<ref>` on Supabase's shared pooler).
//
// With LOGIN_PASSWORD set (the *Production setup* workflow, from a GitHub secret), that password
// is used instead of a generated one and nothing secret is printed: the same password goes into
// DATABASE_PASSWORD on the Railway service.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const ROLES = ['familyos_api_login', 'familyos_worker_login'];

const role = process.argv[2];
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!ROLES.includes(role) || !adminUrl) {
  console.error(
    `usage: ADMIN_DATABASE_URL=... node scripts/ops/enable-login.mjs ${ROLES.join('|')}`,
  );
  process.exit(2);
}

const given = process.env.LOGIN_PASSWORD;
if (given !== undefined && given.length < 16) {
  console.error('LOGIN_PASSWORD must be at least 16 characters');
  process.exit(2);
}
const password = given ?? randomBytes(24).toString('base64url');
const client = new pg.Client({ connectionString: adminUrl });
try {
  await client.connect();
  const quoted = client.escapeLiteral(password);
  await client.query(`alter role ${client.escapeIdentifier(role)} with login password ${quoted}`);
} catch (error) {
  console.error(`could not enable ${role}: ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

if (given !== undefined) {
  console.log(`${role} enabled with the given password.`);
  process.exit(0);
}

const url = new URL(adminUrl);
// Supabase's shared pooler identifies the project by a `.<ref>` suffix on the user name.
const [, projectRef] = decodeURIComponent(url.username).split('.');
url.username = projectRef ? `${role}.${projectRef}` : role;
url.password = password;
console.log(`${role} enabled. Its DATABASE_URL (shown once; store it only in Railway):`);
console.log(url.toString());

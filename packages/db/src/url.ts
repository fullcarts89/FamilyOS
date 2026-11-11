/**
 * The database address with its password filled in. Hosts keep the password in its own variable
 * (DATABASE_PASSWORD on Railway), so DATABASE_URL itself holds nothing secret and can be copied
 * from the runbook as is. The password is percent-encoded into the URL.
 */
export function databaseUrl(url: string, password?: string): string {
  if (!password) return url;
  const parsed = new URL(url);
  // Encoded by hand: the URL setter leaves '%' as is, which would corrupt such a password.
  parsed.password = encodeURIComponent(password);
  return parsed.toString();
}

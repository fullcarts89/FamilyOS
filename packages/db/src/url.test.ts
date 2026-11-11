import { describe, expect, it } from 'vitest';
import { databaseUrl } from './url';

describe('databaseUrl', () => {
  const base = 'postgresql://familyos_api_login.ref@pooler.example:5432/postgres';

  it('leaves the URL alone without a separate password', () => {
    expect(databaseUrl(base)).toBe(base);
    expect(databaseUrl(base, '')).toBe(base);
  });

  it('fills in the password, encoded, so the driver reads it back exactly', () => {
    const password = 'abc-DEF/ghi@jkl:mno#pqr%';
    const url = new URL(databaseUrl(base, password));
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(url.username).toBe('familyos_api_login.ref');
    expect(url.host).toBe('pooler.example:5432');
    expect(url.pathname).toBe('/postgres');
  });
});

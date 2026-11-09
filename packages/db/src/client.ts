import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

export interface DbConfig {
  connectionString: string;
  /** Pool size per process. The API and the worker each hold their own pool. */
  maxConnections?: number;
}

export function createDb({ connectionString, maxConnections = 10 }: DbConfig): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: maxConnections }),
    }),
  });
}

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

export interface DbConfig {
  connectionString: string;
  /** Pool size per process. The API and the worker each hold their own pool. */
  maxConnections?: number;
}

const DATE_OID = 1082;

/**
 * Calendar dates (`date` columns, such as due_on) stay YYYY-MM-DD strings. node-postgres would
 * otherwise turn them into a Date at the server process's local midnight, which shifts the day
 * whenever that timezone differs from the household's.
 */
const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === DATE_OID
      ? (value: string) => value
      : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

export function createDb({ connectionString, maxConnections = 10 }: DbConfig): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: maxConnections, types }),
    }),
  });
}

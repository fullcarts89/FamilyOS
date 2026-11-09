/**
 * Kysely table types for schema `app`. M1 adds the household tables; until then the
 * database holds only the baseline marker table.
 */
export interface SchemaInfoTable {
  key: string;
  value: string;
}

export interface Database {
  'app.schema_info': SchemaInfoTable;
}

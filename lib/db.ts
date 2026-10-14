import pg from "pg";

// COUNT(*) and BIGINT ids arrive as strings by default; every id here fits in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

// Rows are untyped at this layer (as mysql2's RowDataPacket was); callers narrow them with `DbRow & {...}`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = { [column: string]: any };
export type DbResult = { affectedRows: number; insertId: number; rows: DbRow[] };
type QueryResult = DbRow[] | DbResult;
type Params = readonly unknown[];

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? "",
  database: process.env.POSTGRES_DATABASE ?? "clickme",
  max: 10,
});
// Without a listener, an idle client dropped by the server would crash the process.
pool.on("error", (error) => {
  console.error("[db] Idle PostgreSQL client failed.", { code: (error as { code?: string }).code });
});

// Queries keep `?` placeholders; quoted strings and identifiers are left untouched.
function numberPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|\?/g, (match) => (match === "?" ? `$${++index}` : match));
}

// Flag columns are SMALLINT 0/1; Postgres also accepts '1'/'0' for BOOLEAN parameters.
function normalizeParam(value: unknown) {
  return typeof value === "boolean" ? Number(value) : value;
}

async function run<T extends QueryResult>(client: pg.Pool | pg.PoolClient, sql: string, params: Params = []): Promise<[T, pg.FieldDef[]]> {
  const result = await client.query(numberPlaceholders(sql), params.map(normalizeParam));
  if (result.command === "SELECT" || result.command === "SHOW") return [result.rows as T, result.fields];
  // INSERT ... RETURNING id fills insertId, mirroring the previous driver's result header.
  const header: DbResult = { affectedRows: result.rowCount ?? 0, insertId: Number(result.rows[0]?.id ?? 0), rows: result.rows };
  return [header as T, result.fields];
}

export type DbConnection = {
  query<T extends QueryResult = QueryResult>(sql: string, params?: Params): Promise<[T, pg.FieldDef[]]>;
  execute<T extends QueryResult = QueryResult>(sql: string, params?: Params): Promise<[T, pg.FieldDef[]]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

async function getConnection(): Promise<DbConnection> {
  const client = await pool.connect();
  let inTransaction = false;
  return {
    query: (sql, params) => run(client, sql, params),
    execute: (sql, params) => run(client, sql, params),
    async beginTransaction() { await client.query("BEGIN"); inTransaction = true; },
    async commit() { await client.query("COMMIT"); inTransaction = false; },
    async rollback() { inTransaction = false; await client.query("ROLLBACK"); },
    // A client released mid-transaction is discarded so its open transaction cannot leak into the pool.
    release() { client.release(inTransaction || undefined); },
  };
}

const db = {
  query<T extends QueryResult = QueryResult>(sql: string, params?: Params) { return run<T>(pool, sql, params); },
  execute<T extends QueryResult = QueryResult>(sql: string, params?: Params) { return run<T>(pool, sql, params); },
  getConnection,
  end: () => pool.end(),
};

export default db;

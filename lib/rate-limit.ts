import type { DbRow } from "@/lib/db";
import db from "@/lib/db";

let schemaPromise: Promise<void> | null = null;

async function createSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      bucket varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket
     ON rate_limit_events (bucket, created_at)`,
  );
}

async function ensureRateLimitSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

export async function isRateLimited(
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  await ensureRateLimitSchema();
  const [rows] = await db.query<(DbRow & { hits: number })[]>(
    `SELECT COUNT(*)::int AS hits
     FROM rate_limit_events
     WHERE bucket = ? AND created_at > NOW() - make_interval(secs => ?::int)`,
    [bucket, windowSeconds],
  );

  return Number(rows[0]?.hits ?? 0) >= limit;
}

export async function recordRateLimitEvent(...buckets: string[]) {
  await ensureRateLimitSchema();

  for (const bucket of buckets) {
    await db.execute(`INSERT INTO rate_limit_events (bucket) VALUES (?)`, [bucket]);
  }

  await db.execute(
    `DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '1 day'`,
  );
}

export async function clearRateLimit(bucket: string) {
  await ensureRateLimitSchema();
  await db.execute(`DELETE FROM rate_limit_events WHERE bucket = ?`, [bucket]);
}

// Only meaningful behind a proxy that overwrites X-Forwarded-For; per-account
// buckets remain the primary brute-force protection.
export function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

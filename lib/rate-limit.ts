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
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at
     ON rate_limit_events (created_at)`,
  );
}

async function ensureRateLimitSchema() {
  schemaPromise ??= createSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

/**
 * Records one hit and reports whether the bucket is now over its limit.
 * Recording before counting means parallel requests can't all slip through.
 */
export async function hitRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  await ensureRateLimitSchema();
  await db.execute(`INSERT INTO rate_limit_events (bucket) VALUES (?)`, [bucket]);
  const [rows] = await db.query<(DbRow & { hits: number })[]>(
    `SELECT COUNT(*)::int AS hits
     FROM rate_limit_events
     WHERE bucket = ? AND created_at > NOW() - make_interval(secs => ?::int)`,
    [bucket, windowSeconds],
  );

  if (Math.random() < 0.02) {
    await db.execute(
      `DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '1 day'`,
    );
  }

  return Number(rows[0]?.hits ?? 0) > limit;
}

export async function clearRateLimit(...buckets: string[]) {
  await ensureRateLimitSchema();
  for (const bucket of buckets) {
    await db.execute(`DELETE FROM rate_limit_events WHERE bucket = ?`, [bucket]);
  }
}

// Clients can send their own X-Forwarded-For and Next.js keeps it, so only the
// last hop (appended by the reverse proxy in front of the app) is trusted.
// Without such a proxy the value is client-controlled, which is why every
// limit that matters also has a per-account or per-resource bucket.
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  return (
    forwarded.at(-1)?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

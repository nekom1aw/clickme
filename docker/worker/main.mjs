import { writeFileSync } from 'node:fs';
import db from '../../lib/db.ts';
import { startSheetSyncWorker } from '../../lib/sheet-sync-worker.ts';

const stop = startSheetSyncWorker({
  keepAlive: true,
  onHealthyCycle: () => writeFileSync('/tmp/clickme-worker-heartbeat', String(Date.now())),
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.info('[Sheet sync] Stopping worker.');
  await stop();
  await db.end();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureImportSchema, importDataRequests } from "@/lib/data-request-sync";

import { flushSheetNotifications } from "@/lib/sheet-notification-queue";

const state = globalThis as typeof globalThis & { clickmeSheetTimer?: ReturnType<typeof setTimeout> };

export function startSheetSyncWorker(options: { keepAlive?: boolean; onHealthyCycle?: () => void } = {}) {
  if (state.clickmeSheetTimer) return async () => {};
  let stopped = false;
  let activeCycle: Promise<void> | undefined;
  function schedule(delay: number) {
    if (stopped) return;
    state.clickmeSheetTimer = setTimeout(() => { activeCycle = tick(); }, delay);
    if (!options.keepAlive) state.clickmeSheetTimer.unref();
  }
  async function tick() {
    try {
      await ensureImportSchema();
      const [sources] = await db.query<DbRow[]>(`SELECT workspaces.id, workspaces.name, workspaces.owner_id
        FROM data_request_import_sources INNER JOIN workspaces ON workspaces.id = data_request_import_sources.workspace_id
        LEFT JOIN sheet_source_settings ON sheet_source_settings.workspace_id=workspaces.id
        WHERE COALESCE(sheet_source_settings.paused, 0)=0`);
      let healthy = true;
      await flushSheetNotifications();
      for (const source of sources) {
        const response = await importDataRequests(Number(source.owner_id), { workspaceId: Number(source.id), workspaceName: source.name });
        const result = await response.json();
        if (!response.ok) {
          if (response.status !== 409 && response.status !== 422) healthy = false;
          console.error(`[Sheet sync] workspace=${source.id} HTTP=${response.status}`);
        } else {
          console.info(`[Sheet sync] workspace=${source.id} created=${result.summary.created} whatsappSent=${result.whatsapp.sent} whatsappFailed=${result.whatsapp.failed}`);
        }
      }
      if (healthy) options.onHealthyCycle?.();
    } catch (error) {
      console.error("[Sheet sync] Cycle failed; retry in 5 seconds.", { code: (error as { code?: string }).code || "WORKER_ERROR" });
    } finally {
      schedule(5_000);
    }
  }
  schedule(1000);
  console.info("[Sheet sync] Server worker enabled (5 seconds, no browser required).");
  return async () => {
    stopped = true;
    clearTimeout(state.clickmeSheetTimer);
    await activeCycle;
    delete state.clickmeSheetTimer;
  };
}

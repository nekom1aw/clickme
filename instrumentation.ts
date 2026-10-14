export async function register() {
  if (process.env.SHEET_SYNC_MODE === "external") return;
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startSheetSyncWorker } = await import("./lib/sheet-sync-worker");
    startSheetSyncWorker();
  }
}

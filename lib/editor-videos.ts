import path from "node:path";
import db from "@/lib/db";

const DIRECTORY = path.join(process.cwd(), "storage", "editor-videos");

export function sniffEditorVideo(bytes: Buffer) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { mime: "video/webm" as const, extension: ".webm" as const };
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return { mime: "video/mp4" as const, extension: ".mp4" as const };
  }
  return null;
}

export function editorVideoPath(storedName: string) {
  if (!/^[a-f0-9-]{36}\.(mp4|webm)$/.test(storedName)) {
    throw new Error("Nama file video tidak valid.");
  }
  return path.join(DIRECTORY, storedName);
}

export async function ensureEditorVideos() {
  await db.execute(`CREATE TABLE IF NOT EXISTS editor_videos (
    id varchar(36) PRIMARY KEY,
    user_id integer NOT NULL,
    mime varchar(32) NOT NULL,
    byte_size integer NOT NULL,
    stored_name varchar(80) NOT NULL
  )`);
}

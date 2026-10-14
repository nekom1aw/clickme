import { readFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import {
  getMinioBucket,
  getMinioClient,
  isMinioConfigured,
} from "@/lib/minio-storage";
import { canViewTask } from "@/lib/project-access";
import { getSessionUserId } from "@/lib/session";
import {
  isInlineTaskAttachment,
  LEGACY_TASK_ATTACHMENT_DIR,
  TASK_ATTACHMENT_DIR,
  taskAttachmentContentType,
} from "@/lib/task-attachment-files";

export const dynamic = "force-dynamic";

type AttachmentRow = DbRow & {
  task_id: number;
  project_id: number;
  original_name: string;
};

function attachmentHeaders(attachment: AttachmentRow, storedName: string) {
  // The type comes from the extension allowlist, never from what the uploader sent.
  const contentType =
    taskAttachmentContentType(storedName) ?? "application/octet-stream";
  const disposition = isInlineTaskAttachment(contentType) ? "inline" : "attachment";

  return {
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    "Cache-Control": "private, max-age=3600",
  };
}

async function readLocalAttachment(storedName: string) {
  for (const directory of [TASK_ATTACHMENT_DIR, LEGACY_TASK_ATTACHMENT_DIR]) {
    try {
      return await readFile(path.join(directory, storedName));
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ storedName: string }> },
) {
  const { storedName } = await context.params;

  if (!/^[\w-]+(\.[\w]+)?$/.test(storedName)) {
    return NextResponse.json({ error: "Nama file tidak valid." }, { status: 400 });
  }

  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const [attachments] = await db.query<AttachmentRow[]>(
    `SELECT task_attachments.task_id, tasks.project_id, task_attachments.original_name
     FROM task_attachments
     INNER JOIN tasks ON tasks.id = task_attachments.task_id
     WHERE task_attachments.stored_name = ?
     LIMIT 1`,
    [storedName],
  );
  const attachment = attachments[0];

  if (
    !attachment ||
    !(await canViewTask(attachment.project_id, attachment.task_id, userId))
  ) {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
  }

  const headers = attachmentHeaders(attachment, storedName);

  if (!isMinioConfigured()) {
    const contents = await readLocalAttachment(storedName);

    return contents
      ? new Response(new Uint8Array(contents), { headers })
      : NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
  }

  const objectName = `task-attachments/${storedName}`;

  try {
    const minio = getMinioClient();
    const bucket = getMinioBucket();
    const [object, stat] = await Promise.all([
      minio.getObject(bucket, objectName),
      minio.statObject(bucket, objectName),
    ]);

    return new Response(Readable.toWeb(object) as ReadableStream, {
      headers: { ...headers, "Content-Length": String(stat.size) },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === "NoSuchKey" || code === "NotFound") {
      return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
    }

    console.error("Gagal membaca attachment dari MinIO:", error);
    return NextResponse.json(
      { error: "File gagal dibaca dari MinIO." },
      { status: 502 },
    );
  }
}

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { editorVideoPath, ensureEditorVideos } from "@/lib/editor-videos";
import { currentFormUser, formError } from "@/lib/native-forms";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    await currentFormUser();
    const { videoId } = await params;
    if (!/^[a-f0-9-]{36}$/.test(videoId)) return new Response(null, { status: 404 });
    await ensureEditorVideos();
    const [rows] = await db.query<DbRow[]>(
      "SELECT mime, stored_name FROM editor_videos WHERE id = ?",
      [videoId],
    );
    const storedName = String(rows[0]?.stored_name ?? "");
    if (!/^[a-f0-9-]{36}\.(mp4|webm)$/.test(storedName)) {
      return new Response(null, { status: 404 });
    }
    const filePath = editorVideoPath(storedName);
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return new Response(null, { status: 404 });
    const size = info.size;
    const mime = rows[0].mime === "video/webm" ? "video/webm" : "video/mp4";
    const headers = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    };
    const range = request.headers.get("range");
    if (range && !range.includes(",")) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (match[1] === "" && match[2] === "")) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      let start = match[1] === "" ? NaN : Number(match[1]);
      let end = match[2] === "" ? size - 1 : Number(match[2]);
      if (match[1] === "") {
        const suffix = Number(match[2]);
        start = Number.isFinite(suffix) ? Math.max(0, size - suffix) : NaN;
        end = size - 1;
      }
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        start >= size ||
        end < start
      ) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
    return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  } catch (error) {
    return formError(error);
  }
}

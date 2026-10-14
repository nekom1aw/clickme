import path from "path";

// Attachments are served from the app's own origin, so only well-known document
// and media types are accepted (no HTML/SVG/JS that a browser would execute).
const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export const MAX_TASK_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS_PER_UPLOAD = 10;

// Outside public/ so files are never served without an access check.
export const TASK_ATTACHMENT_DIR = path.join(process.cwd(), "storage", "task-attachments");
export const LEGACY_TASK_ATTACHMENT_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "task-attachments",
);
export const TASK_ATTACHMENT_ROUTE = "/api/storage/task-attachments/";

export function taskAttachmentContentType(filename: string) {
  return ATTACHMENT_CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? null;
}

export function isInlineTaskAttachment(contentType: string) {
  return (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType === "application/pdf"
  );
}

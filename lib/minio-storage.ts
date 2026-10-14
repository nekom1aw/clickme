import { Client } from "minio";

type MinioConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

let client: Client | null = null;
let bucketReady: Promise<void> | null = null;
const TASK_ATTACHMENT_PREFIX = "task-attachments/";

function getConfig(): MinioConfig | null {
  const endPoint = process.env.MINIO_ENDPOINT?.trim();
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
  const secretKey = process.env.MINIO_SECRET_KEY?.trim();

  if (!endPoint || !accessKey || !secretKey) {
    return null;
  }

  return {
    endPoint: endPoint.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey,
    secretKey,
    bucket: process.env.MINIO_BUCKET?.trim() || "clickme",
  };
}

export function isMinioConfigured() {
  return getConfig() !== null;
}

export function getMinioBucket() {
  const config = getConfig();

  if (!config) {
    throw new Error("Konfigurasi MinIO belum lengkap.");
  }

  return config.bucket;
}

export function getMinioClient() {
  const config = getConfig();

  if (!config) {
    throw new Error("Konfigurasi MinIO belum lengkap.");
  }

  if (!client) {
    client = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  return client;
}

export async function ensureMinioBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const minio = getMinioClient();
      const bucket = getMinioBucket();

      if (!(await minio.bucketExists(bucket))) {
        await minio.makeBucket(bucket);
      }
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }

  await bucketReady;
}

export async function uploadTaskAttachment(
  objectName: string,
  contents: Buffer,
  contentType: string,
) {
  await ensureMinioBucket();
  await getMinioClient().putObject(
    getMinioBucket(),
    `${TASK_ATTACHMENT_PREFIX}${objectName}`,
    contents,
    contents.length,
    { "Content-Type": contentType },
  );
}

export async function getTaskAttachmentUrl(objectName: string) {
  await ensureMinioBucket();
  const configuredExpiry = Number(
    process.env.MINIO_PRESIGNED_EXPIRY_SECONDS ?? 3600,
  );
  const expiry = Number.isFinite(configuredExpiry)
    ? Math.min(7 * 24 * 60 * 60, Math.max(1, Math.floor(configuredExpiry)))
    : 3600;

  return getMinioClient().presignedGetObject(
    getMinioBucket(),
    `${TASK_ATTACHMENT_PREFIX}${objectName}`,
    expiry,
  );
}

export async function resolveTaskAttachmentUrl(
  fileUrl: string,
  storedName?: string | null,
) {
  const proxyPrefix = "/api/storage/task-attachments/";

  if (!isMinioConfigured()) {
    // Older local uploads were saved under public/; serve them through the checked route.
    return fileUrl.replace(/^\/uploads\/task-attachments\//, proxyPrefix);
  }

  const legacyStoredName = fileUrl.startsWith(proxyPrefix)
    ? decodeURIComponent(fileUrl.slice(proxyPrefix.length))
    : "";
  const objectName = storedName?.trim() || legacyStoredName;

  return objectName ? getTaskAttachmentUrl(objectName) : fileUrl;
}

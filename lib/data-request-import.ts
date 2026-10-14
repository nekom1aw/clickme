import { createHash } from "crypto";

import { dataRequestHeaders } from "@/lib/data-request-fields";
export { dataRequestHeaders } from "@/lib/data-request-fields";

export const dataRequestProjectNames = [
  "Lembaga Pemerintahan",
  "Swasta",
  "Media",
  "Mahasiswa atau Akademisi",
  "Non-Goverment Organization",
  "Internal Auriga",
  "Yang lain",
] as const;

export type DataRequestRow = Record<string, string>;

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function detectDelimiter(source: string) {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/\t/g) ?? []).length >
    (firstLine.match(/,/g) ?? []).length
    ? "\t"
    : ",";
}

export function readSpreadsheet(source: string) {
  const delimiter = detectDelimiter(source);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      record.push(field);
      field = "";
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      record.push(field);
      if (record.some((value) => value.trim())) {
        records.push(record);
      }
      record = [];
      field = "";
      continue;
    }

    field += character;
  }

  record.push(field);
  if (record.some((value) => value.trim())) {
    records.push(record);
  }

  const rawHeaders = records.shift() ?? [];
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, "").trim());
  if (!headers.length || headers.some(header => !header)) throw new Error("Nama kolom tidak boleh kosong.");
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error("Nama kolom duplikat. Beri nama berbeda pada setiap kolom.");
  return { headers, rows: records.map(values => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]))) };
}

export function parseSpreadsheetText(source: string) {
  const { headers, rows } = readSpreadsheet(source);
  const normalizedHeaders = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const required = [dataRequestHeaders.timestamp, dataRequestHeaders.detail];
  const missingHeaders: string[] = required.filter(
    (header) => !normalizedHeaders.has(normalizeHeader(header)),
  );

  const hasProjectCategoryHeader = [
    dataRequestHeaders.category,
    dataRequestHeaders.origin,
    dataRequestHeaders.organization,
  ].some((header) => normalizedHeaders.has(normalizeHeader(header)));

  if (!hasProjectCategoryHeader) {
    missingHeaders.push(
      `${dataRequestHeaders.origin} / ${dataRequestHeaders.organization}`,
    );
  }

  if (missingHeaders.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${missingHeaders.join(", ")}.`);
  }

  return rows;
}

export function getRowValue(row: DataRequestRow, header: string) {
  const target = normalizeHeader(header);
  const entry = Object.entries(row).find(
    ([rowHeader]) => normalizeHeader(rowHeader) === target,
  );
  return entry?.[1]?.trim() ?? "";
}

export function normalizeDataRequestProjectName(value: string) {
  const normalized = value.trim().toLocaleLowerCase("id-ID");
  const aliases = new Map<string, (typeof dataRequestProjectNames)[number]>([
    ["lembaga pemerintahan", "Lembaga Pemerintahan"],
    ["pemerintahan", "Lembaga Pemerintahan"],
    ["swasta", "Swasta"],
    ["media", "Media"],
    ["mahasiswa atau akademisi", "Mahasiswa atau Akademisi"],
    ["mahasiswa / akademisi", "Mahasiswa atau Akademisi"],
    ["mahasiswa/akademisi", "Mahasiswa atau Akademisi"],
    ["non-goverment organization", "Non-Goverment Organization"],
    ["non-government organization", "Non-Goverment Organization"],
    ["ngo", "Non-Goverment Organization"],
    ["internal auriga", "Internal Auriga"],
    ["yang lain", "Yang lain"],
    ["lainnya", "Yang lain"],
  ]);

  return aliases.get(normalized) ?? "Yang lain";
}

export function resolveDataRequestProjectName(row: DataRequestRow) {
  const category = getRowValue(row, dataRequestHeaders.category);
  if (category) return normalizeDataRequestProjectName(category);
  const origin = getRowValue(row, dataRequestHeaders.origin);
  const organization = getRowValue(row, dataRequestHeaders.organization);

  if (origin) {
    const originProject = normalizeDataRequestProjectName(origin);
    if (originProject !== "Yang lain") {
      return originProject;
    }
  }

  return normalizeDataRequestProjectName(organization || origin);
}

export function parseRequestTimestamp(value: string) {
  const normalized = value.trim();
  const dayFirst = normalized.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (dayFirst) {
    const year =
      Number(dayFirst[3]) < 100 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]);
    return new Date(
      year,
      Number(dayFirst[2]) - 1,
      Number(dayFirst[1]),
      Number(dayFirst[4] ?? 0),
      Number(dayFirst[5] ?? 0),
      Number(dayFirst[6] ?? 0),
    );
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDatabaseDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function requestDueDate(timestamp: string) {
  const parsed = parseRequestTimestamp(timestamp);
  if (!parsed) {
    return null;
  }
  parsed.setDate(parsed.getDate() + 7);
  return formatDatabaseDate(parsed);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildRequestTaskName(row: DataRequestRow) {
  const fullName = getRowValue(row, dataRequestHeaders.fullName);
  const organization = getRowValue(row, dataRequestHeaders.organization);
  const reason = getRowValue(row, dataRequestHeaders.reason);

  const title = [fullName, organization, reason].filter(Boolean).join(" - ");
  const characters = Array.from(title);
  return characters.length > 180
    ? `${characters.slice(0, 179).join("")}…`
    : title;
}

export function buildRequestDescription(row: DataRequestRow) {
  const value = (header: string) => getRowValue(row, header) || "-";
  const line = (label: string, content: string) =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(content).replaceAll(
      "\n",
      "<br>",
    )}</p>`;
  return [
    line("Timestamp", value(dataRequestHeaders.timestamp)),
    line("Nama Lengkap", value(dataRequestHeaders.fullName)),
    line("Nomor Whatsapp/Telegram", value(dataRequestHeaders.contact)),
    line("Lembaga/Organisasi", getRowValue(row, dataRequestHeaders.category) || getRowValue(row, dataRequestHeaders.origin) || "-"),
    line("Posisi / Jabatan Dalam Organisasi", value(dataRequestHeaders.position)),
    line("Lembaga / Organisasi", value(dataRequestHeaders.organization)),
    line("Alasan Penggunaan Data", value(dataRequestHeaders.reason)),
    line("Output data", value(dataRequestHeaders.output)),
    line("Alamat Email", value(dataRequestHeaders.email)),
    line("Sila input kode berikut: FTWEY", value(dataRequestHeaders.verification)),
    line("Detail Kebutuhan Data", value(dataRequestHeaders.detail)),
  ].join("");
}

export function dataRequestSourceKey(row: DataRequestRow) {
  const identity = [
    getRowValue(row, dataRequestHeaders.timestamp),
    getRowValue(row, dataRequestHeaders.email).toLowerCase(),
    getRowValue(row, dataRequestHeaders.contact),
    getRowValue(row, dataRequestHeaders.fullName).toLowerCase(),
    getRowValue(row, dataRequestHeaders.detail).toLowerCase(),
  ].join("|");

  return createHash("sha256").update(identity).digest("hex");
}

export function googleSheetCsvUrl(value: string) {
  const url = new URL(value);

  // The server fetches this URL (and the sync worker re-fetches it), so anything
  // other than Google Sheets would let users probe internal services.
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("URL Google Sheet tidak valid.");
  }

  const spreadsheetId = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (!spreadsheetId) {
    throw new Error("URL Google Sheet tidak valid.");
  }

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") ?? hashParams.get("gid") ?? "0";
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(
    gid,
  )}`;
}

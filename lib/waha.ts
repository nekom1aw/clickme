import "server-only";

type SendTextInput = {
  recipient: string;
  text: string;
  session?: string;
};

export class WahaError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status = 500, details: unknown = null) {
    super(message);
    this.name = "WahaError";
    this.status = status;
    this.details = details;
  }
}

function getWahaConfig() {
  const apiUrl = process.env.WAHA_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.WAHA_API_KEY?.trim();
  const session = process.env.WAHA_SESSION?.trim() || "default";

  if (!apiUrl || !apiKey) {
    throw new WahaError(
      "WAHA belum dikonfigurasi. Isi WAHA_API_URL dan WAHA_API_KEY di .env.local.",
    );
  }

  return { apiUrl, apiKey, session };
}

export function toWahaChatId(recipient: string) {
  const value = recipient.trim();

  if (value.endsWith("@c.us") || value.endsWith("@g.us")) {
    return value;
  }

  let digits = value.replace(/\D/g, "");
  const countryCode =
    process.env.WAHA_DEFAULT_COUNTRY_CODE?.replace(/\D/g, "") || "62";

  if (digits.startsWith("0")) {
    digits = `${countryCode}${digits.slice(1)}`;
  }

  if (!digits) {
    throw new WahaError("Nomor WhatsApp tidak valid.", 400);
  }

  return `${digits}@c.us`;
}

async function readResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function sendWahaText({
  recipient,
  text,
  session,
}: SendTextInput) {
  const config = getWahaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${config.apiUrl}/api/sendText`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({
        session: session?.trim() || config.session,
        chatId: toWahaChatId(recipient),
        text,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await readResponse(response);

    if (!response.ok) {
      throw new WahaError(
        "WAHA gagal mengirim pesan.",
        response.status,
        data,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof WahaError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new WahaError("WAHA tidak merespons dalam 15 detik.", 504);
    }

    throw new WahaError(
      "Tidak dapat terhubung ke server WAHA.",
      502,
      error instanceof Error ? error.message : error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

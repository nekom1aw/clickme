"use client";

import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

type ConnectionScope = "workspace" | "project";

type ConnectionStatus = {
  connected: boolean;
  pending: boolean;
  groupChatId: string | null;
  groupName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
};

type WhatsappGroupConnectionProps = {
  scopeType: ConnectionScope;
  scopeId: number;
  scopeName: string;
};

const emptyStatus: ConnectionStatus = {
  connected: false,
  pending: false,
  groupChatId: null,
  groupName: null,
  connectedAt: null,
  expiresAt: null,
};

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function WhatsAppGroupConnection({
  scopeType,
  scopeId,
  scopeName,
}: WhatsappGroupConnectionProps) {
  const [status, setStatus] = useState<ConnectionStatus>(emptyStatus);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      const query = new URLSearchParams({
        scopeType,
        scopeId: String(scopeId),
      });
      const response = await fetch(
        `/api/whatsapp/group-connections?${query.toString()}`,
        {
          cache: "no-store",
          signal,
        },
      );
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Gagal memuat koneksi WhatsApp.",
        );
      }

      const nextStatus = data.connection as ConnectionStatus | undefined;
      setStatus(nextStatus ?? emptyStatus);

      if (nextStatus?.connected) {
        setCommand("");
      }
    },
    [scopeId, scopeType],
  );

  useEffect(() => {
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      loadStatus(controller.signal)
        .catch((loadError: unknown) => {
          if (
            loadError instanceof DOMException &&
            loadError.name === "AbortError"
          ) {
            return;
          }
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Gagal memuat koneksi WhatsApp.",
          );
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadStatus]);

  useEffect(() => {
    if ((!status.pending && !command) || status.connected) {
      return;
    }

    const interval = window.setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [command, loadStatus, status.connected, status.pending]);

  async function generateCode() {
    setSubmitting(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/whatsapp/group-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeId }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Gagal membuat kode koneksi.",
        );
      }

      setCommand(typeof data.command === "string" ? data.command : "");
      setStatus((current) => ({
        ...current,
        connected: false,
        pending: true,
        expiresAt:
          typeof data.expiresAt === "string" ? data.expiresAt : null,
      }));
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Gagal membuat kode koneksi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/group-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeId }),
      });
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Gagal memutus koneksi grup.",
        );
      }

      setStatus(emptyStatus);
      setCommand("");
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Gagal memutus koneksi grup.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCommand() {
    if (!command) {
      return;
    }

    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#151515] px-3 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LinkIcon className="size-4 shrink-0 text-white/55" />
            <h3 className="text-sm font-semibold text-white/85">
              Grup WhatsApp
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-white/40">
            Hubungkan grup untuk menerima aktivitas {scopeType} {scopeName}.
          </p>
        </div>

        {loading ? (
          <ArrowPathIcon className="mt-0.5 size-4 animate-spin text-white/40" />
        ) : status.connected ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">
            <CheckIcon className="size-3.5" />
            Terhubung
          </span>
        ) : null}
      </div>

      {!loading && status.connected ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white/80">
              {status.groupName || "Grup WhatsApp"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/35">
              {status.groupChatId}
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={submitting}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
            title="Putuskan grup"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {!loading && !status.connected && command ? (
        <div className="mt-3 space-y-2.5">
          <button
            type="button"
            onClick={copyCommand}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-left transition hover:bg-white/[0.04]"
          >
            <code className="truncate text-xs font-semibold text-white/80">
              {command}
            </code>
            {copied ? (
              <CheckIcon className="size-4 shrink-0 text-emerald-300" />
            ) : (
              <ClipboardDocumentIcon className="size-4 shrink-0 text-white/45" />
            )}
          </button>
          <ol className="space-y-1 text-[11px] leading-4 text-white/45">
            <li>1. Tambahkan nomor bot WAHA ke grup.</li>
            <li>2. Kirim perintah di atas ke dalam grup.</li>
            <li>3. Status akan berubah otomatis setelah terhubung.</li>
          </ol>
          <button
            type="button"
            onClick={generateCode}
            disabled={submitting}
            className="text-[11px] font-semibold text-white/55 transition hover:text-white/80 disabled:opacity-50"
          >
            Buat ulang kode
          </button>
        </div>
      ) : null}

      {!loading && !status.connected && !command ? (
        <button
          type="button"
          onClick={generateCode}
          disabled={submitting}
          className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06] disabled:opacity-50"
        >
          {submitting ? (
            <ArrowPathIcon className="size-3.5 animate-spin" />
          ) : (
            <LinkIcon className="size-3.5" />
          )}
          Hubungkan grup
        </button>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}

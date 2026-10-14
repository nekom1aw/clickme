"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import type {
  PublicMonitoringActivity,
  PublicMonitoringTask,
} from "@/lib/data-request-monitoring";

type MonitoringClientProps = {
  token: string;
  initialTask: PublicMonitoringTask;
};

const GUEST_NAME_KEY = "clickme-guest-name";
const GUEST_NAME_EVENT = "clickme-guest-name-change";

function subscribeGuestName(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(GUEST_NAME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(GUEST_NAME_EVENT, onChange);
  };
}

function readGuestName() {
  return window.localStorage.getItem(GUEST_NAME_KEY) ?? "";
}

function saveGuestName(name: string) {
  window.localStorage.setItem(GUEST_NAME_KEY, name);
  window.dispatchEvent(new Event(GUEST_NAME_EVENT));
}

const categoryLabels = {
  not_started: "Antrean",
  active: "Dikerjakan",
  closed: "Selesai",
} as const;

function formatDate(value: string | null) {
  if (!value) {
    return "Belum ditentukan";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ActivityItem({
  activity,
  viewerName,
}: {
  activity: PublicMonitoringActivity;
  viewerName: string;
}) {
  const isComment = activity.type === "comment";
  const isRequester = activity.isGuest && activity.actor === viewerName;

  if (isComment) {
    return (
      <div className={`flex ${isRequester ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[88%]">
          <div
            className={`rounded-lg px-3 py-2 text-sm leading-5 ${
              isRequester
                ? "bg-violet-600 text-white"
                : "bg-[#242424] text-zinc-100"
            }`}
          >
            {activity.message}
          </div>
          <p
            className={`mt-1 text-[11px] text-zinc-600 ${
              isRequester ? "text-right" : "text-left"
            }`}
          >
            {activity.actor}
            {!activity.isGuest ? (
              <span className="ml-1.5 rounded bg-violet-500/15 px-1 py-px text-[10px] font-semibold text-violet-300">
                Tim
              </span>
            ) : null}{" "}
            · {formatDateTime(activity.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 text-xs leading-5 text-zinc-500">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
      <div>
        <p>
          <span className="font-semibold text-zinc-400">{activity.actor}</span>{" "}
          {activity.message}
        </p>
        <p className="text-[11px] text-zinc-700">
          {formatDateTime(activity.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function MonitoringClient({
  token,
  initialTask,
}: MonitoringClientProps) {
  const [task, setTask] = useState(initialTask);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const guestName = useSyncExternalStore(subscribeGuestName, readGuestName, () => "");
  const isSharedTask = task.kind === "shared";
  const viewerName = isSharedTask ? guestName : task.requesterName;
  const needsName = isSharedTask && (!guestName || editingName);
  const activityEndRef = useRef<HTMLDivElement>(null);
  const description = task.description;

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/monitoring/${token}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          task?: PublicMonitoringTask;
        };
        if (data.task) {
          setTask(data.task);
        }
      } catch {
        // Keep the current snapshot when polling is temporarily unavailable.
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ block: "end" });
  }, [task.activities.length]);

  async function sendMessage() {
    const nextMessage = message.trim();
    if (!nextMessage || sending) {
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/monitoring/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: nextMessage, name: guestName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        activity?: PublicMonitoringActivity;
        error?: string;
      };
      if (!response.ok || !data.activity) {
        throw new Error(data.error || "Pesan tidak dapat dikirim.");
      }
      setTask((current) => ({
        ...current,
        activities: [...current.activities, data.activity!],
      }));
      setMessage("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Pesan tidak dapat dikirim.",
      );
    } finally {
      setSending(false);
    }
  }

  function submitGuestName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = nameDraft.trim().replace(/\s+/g, " ");

    if (!nextName) {
      return;
    }

    saveGuestName(nextName);
    setEditingName(false);
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#0b0b0c] text-zinc-100">
      <header className="flex h-14 items-center justify-between border-b border-[#292929] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-violet-600 text-xs font-bold uppercase">
            {isSharedTask ? task.projectName.slice(0, 1) || "T" : "P"}
          </span>
          <span className="truncate text-sm font-semibold text-zinc-300">
            {isSharedTask ? task.projectName : "Monitoring Permintaan Data"}
          </span>
          <span className="text-zinc-700">/</span>
          <span className="truncate text-sm font-semibold">{task.name}</span>
        </div>
        <p className="hidden shrink-0 text-xs text-zinc-600 sm:block">
          Dibuat {formatDate(task.createdAt)}
        </p>
      </header>

      <div className="grid h-[calc(100dvh-3.5rem)] min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,36%)]">
        <section className="min-h-0 overflow-y-auto px-5 py-8 sm:px-10 lg:px-14">
          <div className="mx-auto max-w-5xl pb-14">
            <span className="inline-flex rounded border border-[#343434] px-2.5 py-1 text-xs font-semibold text-zinc-500">
              {isSharedTask ? "Task" : "Permintaan data"}
            </span>
            <h1 className="mt-8 break-words text-2xl font-semibold tracking-normal sm:text-3xl">
              {task.name}
            </h1>

            <dl className="mt-12 grid max-w-3xl gap-7 sm:grid-cols-2">
              <div className="grid grid-cols-[110px_1fr] items-center gap-4">
                <dt className="text-sm text-zinc-600">Status</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: task.status.color }}
                  />
                  <span className="truncate text-sm font-semibold">
                    {task.status.name}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {categoryLabels[task.status.category]}
                  </span>
                </dd>
              </div>

              <div className="grid grid-cols-[110px_1fr] items-center gap-4">
                <dt className="text-sm text-zinc-600">Tanggal</dt>
                <dd className="flex items-center gap-2 text-sm text-zinc-300">
                  <CalendarDaysIcon className="h-4 w-4 text-zinc-600" />
                  {task.startDate
                    ? `${formatDate(task.startDate)} - ${formatDate(task.dueDate)}`
                    : formatDate(task.dueDate)}
                </dd>
              </div>
            </dl>

            <div className="mt-12 border-t border-[#292929] pt-8">
              <p className="mb-4 text-xs font-semibold uppercase text-zinc-600">
                {isSharedTask ? "Detail task" : "Detail permintaan"}
              </p>
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">
                {description ||
                  (isSharedTask ? "Belum ada detail." : "Belum ada detail permintaan.")}
              </div>
            </div>

            <aside className="mt-12 rounded-md border border-[#292929] bg-[#111112] px-4 py-3 text-xs leading-5 text-zinc-500">
              {isSharedTask
                ? "Task ini dibagikan oleh tim lewat link publik. Status, tanggal, dan detail dikelola oleh tim. Gunakan percakapan di samping untuk berdiskusi dengan tim."
                : "Halaman ini hanya untuk memantau permintaan data. Status, tanggal, dan detail dikelola oleh tim. Gunakan percakapan di samping untuk berkomunikasi dengan tim."}
            </aside>
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[3.5rem_minmax(0,1fr)_auto] border-t border-[#292929] bg-[#0d0d0e] lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-[#292929] px-5">
            <ChatBubbleLeftRightIcon className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold">Activity</h2>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
            {task.activities.length ? (
              task.activities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  viewerName={viewerName}
                />
              ))
            ) : (
              <p className="text-sm text-zinc-600">Belum ada aktivitas.</p>
            )}
            <div ref={activityEndRef} />
          </div>
          <div className="border-t border-[#292929] p-4">
            {needsName ? (
              <form onSubmit={submitGuestName}>
                <label
                  htmlFor="guest-name"
                  className="text-xs font-semibold text-zinc-400"
                >
                  Nama kamu
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-md border border-[#343434] bg-[#121213] p-2 focus-within:border-zinc-500">
                  <input
                    id="guest-name"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    maxLength={60}
                    autoComplete="name"
                    placeholder="Contoh: Budi (Dinas Kehutanan)"
                    className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm text-zinc-200 outline-none placeholder:text-zinc-700"
                  />
                  <button
                    type="submit"
                    disabled={!nameDraft.trim()}
                    className="h-8 shrink-0 rounded bg-white px-3 text-xs font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                  >
                    Lanjut
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-600">
                  Nama ini tampil di setiap pesan yang kamu kirim ke tim.
                </p>
              </form>
            ) : (
              <>
                {isSharedTask ? (
                  <p className="mb-2 text-[11px] text-zinc-600">
                    Mengirim sebagai{" "}
                    <span className="font-semibold text-zinc-400">{guestName}</span>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(guestName);
                        setEditingName(true);
                      }}
                      className="font-semibold text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      Ganti nama
                    </button>
                  </p>
                ) : null}
                {error ? (
                  <p className="mb-2 text-xs text-red-400">{error}</p>
                ) : null}
                <div className="flex items-end gap-2 rounded-md border border-[#343434] bg-[#121213] p-2 focus-within:border-zinc-500">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    maxLength={500}
                    placeholder="Tulis pesan..."
                    className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!message.trim() || sending}
                    title="Kirim pesan"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded bg-white text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

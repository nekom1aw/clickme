"use client";
import { createClientId } from "@/lib/client-id";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, CheckCircle2, ChevronDown, FileText, Monitor, Moon, Sun } from "lucide-react";
import type { FormDefinition } from "@/lib/native-form-fields";
import FormFlow from "@/components/form-flow";
import styles from "./public-form.module.css";
const themeKey = "clickme-public-form-theme";

const THEME_OPTIONS = [
  { value: "system", label: "Sistem", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

function getTheme() {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}
function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("public-form-theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("public-form-theme", callback);
  };
}
export default function PublicForm({ token }: { token: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "system");
  const submissionKey = useRef("");
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeMenuOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [themeMenuOpen]);

  function handleSelectTheme(nextTheme: "system" | "light" | "dark") {
    try {
      localStorage.setItem(themeKey, nextTheme);
    } catch {
      /* Storage may be unavailable. */
    }
    window.dispatchEvent(new Event("public-form-theme"));
    setThemeMenuOpen(false);
  }

  const currentThemeOption = THEME_OPTIONS.find((opt) => opt.value === theme) ?? THEME_OPTIONS[0];
  const CurrentThemeIcon = currentThemeOption.icon;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/forms/${token}`, { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setForm(data.form);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  return (
    <main data-theme={theme} className={`${styles.page} min-h-dvh px-4 py-12`}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText size={20} />
            <span>Clickme Forms</span>
          </div>
          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((open) => !open)}
              aria-label="Pilih tema tampilan"
              aria-haspopup="listbox"
              aria-expanded={themeMenuOpen}
              className="flex items-center gap-2 rounded-lg border border-[var(--form-border)] bg-[var(--form-card)] px-3 py-1.5 text-xs font-medium text-[var(--form-text)] shadow-xs transition hover:border-current/30 hover:bg-current/[0.04] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-current/20"
            >
              <CurrentThemeIcon size={14} className="shrink-0 opacity-75" />
              <span>{currentThemeOption.label}</span>
              <ChevronDown
                size={13}
                className={`shrink-0 opacity-60 transition-transform duration-200 ${
                  themeMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {themeMenuOpen && (
              <div
                role="listbox"
                aria-label="Pilihan tema"
                className="absolute right-0 top-full mt-1.5 min-w-[130px] origin-top-right rounded-xl border border-[var(--form-border)] bg-[var(--form-card)] p-1 text-xs text-[var(--form-text)] shadow-xl backdrop-blur-md z-50"
              >
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectTheme(opt.value)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${
                        isSelected
                          ? "bg-current/10 font-semibold"
                          : "opacity-75 hover:bg-current/[0.06] hover:opacity-100"
                      }`}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span className="flex-1">{opt.label}</span>
                      {isSelected && <Check size={13} className="shrink-0 opacity-80" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className={styles.form}>
          <div>
            {done ? (
              <div role="status" className="py-10 text-center">
                <CheckCircle2
                  className="mx-auto mb-4 text-current"
                  size={44}
                />
                <h1 className="text-2xl font-semibold">Jawaban terkirim</h1>
                <p className="mt-3 text-zinc-500">
                  Terima kasih. Jawaban kamu sudah tersimpan.
                </p>
              </div>
            ) : (
              <>
                {form ? (
                  <>
                    <div>
                      <FormFlow
                        form={form}
                        onComplete={async (answers, website, otherAnswers) => {
                          if (!submissionKey.current)
                            submissionKey.current = createClientId();
                          const response = await fetch(
                            `/api/public/forms/${token}`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                answers,
                                otherAnswers,
                                website,
                                submissionKey: submissionKey.current,
                              }),
                            },
                          );
                          const data = await response.json();
                          if (!response.ok) throw new Error(data.error);
                          setDone(true);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p role="status">{error || "Memuat form…"}</p>
                )}
              </>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400">
          Dibuat dengan Clickme Forms
        </p>
      </div>
    </main>
  );
}

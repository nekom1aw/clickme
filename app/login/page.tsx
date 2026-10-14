"use client";

import { useState } from "react";

type Mode = "login" | "register" | "verify";
type ApiResponse = {
  error?: string;
  email?: string;
  verificationRequired?: boolean;
};

async function readResponse(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return { error: "The server could not process this request." };
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  function showVerification(targetEmail: string) {
    setVerificationEmail(targetEmail);
    setCode("");
    setError("");
    setNotice(`We sent a 6-digit verification code to ${targetEmail}.`);
    setMode("verify");
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setNotice("");
    if (nextMode === "register") {
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    }
  }

  async function handleAccountSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch(mode === "login" ? "/api/login" : "/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email, password }
            : { name, email, password, confirmPassword },
        ),
      });
      const data = await readResponse(response);
      if (data.verificationRequired && data.email) {
        showVerification(data.email);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? (mode === "login" ? "Login failed." : "Registration failed."));
        return;
      }
      window.location.assign("/team");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the complete 6-digit code.");
      return;
    }
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const response = await fetch("/api/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail, code, password }),
      });
      const data = await readResponse(response);
      if (!response.ok) {
        setError(data.error ?? "Email verification failed.");
        return;
      }
      window.location.assign("/team");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    setResending(true);
    try {
      const response = await fetch("/api/register/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await readResponse(response);
      if (!response.ok) {
        setError(data.error ?? "Could not resend the verification code.");
        return;
      }
      setNotice("A new verification code has been sent. Please check your inbox.");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f10] px-5 text-white">
      <section className="w-full max-w-sm rounded-xl border border-white/10 bg-[#171717] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            {mode === "login" ? "Login" : mode === "register" ? "Daftar" : "Verify your email"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-white/45">
            {mode === "login"
              ? "Masuk ke workspace Clickme."
              : mode === "register"
                ? "Buat akun baru untuk mulai menggunakan Clickme."
                : `Enter the code sent to ${verificationEmail}.`}
          </p>
        </div>

        {mode !== "verify" ? (
          <div className="mb-5 grid grid-cols-2 rounded-lg border border-white/10 bg-white/5 p-1 text-sm font-semibold text-white/55">
            <button type="button" onClick={() => switchMode("login")} className={`h-9 rounded-md transition ${mode === "login" ? "bg-white text-black" : "hover:bg-white/10"}`}>Login</button>
            <button type="button" onClick={() => switchMode("register")} className={`h-9 rounded-md transition ${mode === "register" ? "bg-white text-black" : "hover:bg-white/10"}`}>Daftar</button>
          </div>
        ) : null}

        {mode === "verify" ? (
          <form className="space-y-4" onSubmit={handleVerify}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white/70">Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-14 w-full rounded-lg border border-white/15 bg-transparent px-3 text-center text-2xl font-semibold tracking-[0.38em] outline-none transition placeholder:text-white/20 focus:border-white/55 focus:ring-2 focus:ring-white/10"
                placeholder="000000"
              />
            </label>
            {notice ? <p className="text-sm leading-5 text-emerald-300">{notice}</p> : null}
            {error ? <p className="text-sm leading-5 text-red-300">{error}</p> : null}
            <button type="submit" disabled={loading || code.length !== 6} className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Verifying..." : "Verify and continue"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={resendCode} disabled={resending} className="text-white/65 transition hover:text-white disabled:opacity-45">{resending ? "Sending..." : "Resend code"}</button>
              <button type="button" onClick={() => switchMode("login")} className="text-white/65 transition hover:text-white">Back to login</button>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleAccountSubmit}>
            {mode === "register" ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white/70">Nama</span>
                <input type="text" required value={name} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10" placeholder="Nama lengkap" />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white/70">Email</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10" placeholder="you@example.com" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-white/70">Password</span>
              <input type="password" required minLength={mode === "register" ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10" placeholder="Password" />
            </label>

            {mode === "register" ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white/70">Konfirmasi Password</span>
                <input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10" placeholder="Ulangi password" />
              </label>
            ) : null}

            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button type="submit" disabled={loading} className="h-11 w-full rounded-lg bg-white text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? (mode === "login" ? "Logging in..." : "Mendaftarkan...") : mode === "login" ? "Login" : "Daftar"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

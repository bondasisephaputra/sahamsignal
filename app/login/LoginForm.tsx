"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Gagal masuk.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        placeholder="nama@email.com"
        required
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        placeholder="Minimal 8 karakter"
        required
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-turun-200 bg-turun-50 px-3 py-2 text-xs text-turun-700"
        >
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary mt-1 w-full" disabled={pending}>
        {pending ? "Memproses..." : "Masuk"}
      </button>

      <p className="text-center text-[0.6875rem] text-paper-400">
        <Link href="/register" className="hover:text-paper-600 hover:underline">
          Buat akun baru
        </Link>
      </p>
    </form>
  );
}

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="input"
      />
      {hint ? <p className="mt-1 text-[0.6875rem] text-paper-400">{hint}</p> : null}
    </div>
  );
}

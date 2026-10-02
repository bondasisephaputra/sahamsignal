"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field } from "@/app/login/LoginForm";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Pendaftaran gagal.");
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
        id="name"
        label="Nama"
        autoComplete="name"
        value={name}
        onChange={setName}
        placeholder="Nama lengkap"
        required
      />

      <Field
        id="reg-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        placeholder="nama@email.com"
        required
      />

      <Field
        id="reg-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        placeholder="Minimal 8 karakter"
        required
        minLength={8}
      />

      <Field
        id="reg-confirm"
        label="Konfirmasi password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        placeholder="Ulangi password"
        required
        minLength={8}
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
        {pending ? "Membuat akun..." : "Daftar"}
      </button>

      <p className="text-center text-[0.6875rem] leading-relaxed text-paper-400">
        Dengan mendaftar Anda menyetujui bahwa aplikasi ini hanya alat bantu analisis, bukan
        nasihat keuangan.{" "}
        <Link href="/login" className="hover:text-paper-600 hover:underline">
          Sudah punya akun?
        </Link>
      </p>
    </form>
  );
}

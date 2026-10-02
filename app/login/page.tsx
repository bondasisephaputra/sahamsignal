import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthShell
        title="Masuk ke akun Anda"
        subtitle="Pantau sinyal beli dan jual saham IDX dengan analisis teknikal dan fundamental."
      >
        <LoginForm />
      </AuthShell>

      <p className="mt-6 text-center text-xs text-paper-500">
        Belum punya akun?{" "}
        <Link href="/register" className="font-medium text-accent-600 hover:underline">
          Daftar gratis
        </Link>
      </p>
    </main>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <BrandMark />
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-paper-900">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-paper-500">{subtitle}</p>
      </div>

      <div className="card p-6">{children}</div>

      <p className="mt-8 text-center text-[0.6875rem] leading-relaxed text-paper-400">
        Data pasar bersumber dari penyedia data publik dan dapat terlambat. Bukan nasihat
        keuangan.
      </p>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-paper-900">
        <svg
          viewBox="0 0 24 24"
          className="size-5 text-paper-50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 17.5 9 11l4 4 7.5-8" />
          <path d="M15 7h5.5v5.5" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-paper-900">
        SahamSignal
      </span>
    </div>
  );
}

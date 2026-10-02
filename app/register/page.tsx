import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Daftar" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
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

          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-paper-900">
            Buat akun gratis
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-paper-500">
            Simpan watchlist pribadi dan pantau sinyal saham pilihan Anda.
          </p>
        </div>

        <div className="card p-6">
          <RegisterForm />
        </div>

        <p className="mt-6 text-center text-xs text-paper-500">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-accent-600 hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}

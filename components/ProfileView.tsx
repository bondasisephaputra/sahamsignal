"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FUNDAMENTAL_RATIOS,
  REFRESH_POLICY,
  SCORING_WEIGHTS,
  TECHNICAL_INDICATORS,
  type EngineInfo,
} from "@/lib/analysis-meta";
import { Card, CardHeader } from "./ui";

interface ProfileViewProps {
  user: { name: string; email: string; createdAt: number | null; role: string };
  dbMode: "local" | "remote";
  universeSize: number;
  sectors: string[];
  totalUsers: number;
}

export function ProfileView({
  user,
  dbMode,
  universeSize,
  sectors,
  totalUsers,
}: ProfileViewProps) {
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [nameState, setNameState] = useState<StatusState>({ kind: "idle" });
  const [passwordState, setPasswordState] = useState<StatusState>({ kind: "idle" });
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Reset the in-progress password form if the server component re-renders.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameState({ kind: "error", message: "Nama minimal 2 karakter." });
      return;
    }

    setSavingName(true);
    setNameState({ kind: "pending" });
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan.");
      setNameState({ kind: "success", message: "Nama berhasil diperbarui." });
    } catch (err) {
      if (mounted.current) {
        setNameState({ kind: "error", message: (err as Error).message });
      }
    } finally {
      if (mounted.current) setSavingName(false);
    }
  }, [name]);

  const savePassword = useCallback(async () => {
    if (newPassword.length < 8) {
      setPasswordState({ kind: "error", message: "Password baru minimal 8 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordState({ kind: "error", message: "Konfirmasi password tidak cocok." });
      return;
    }

    setSavingPassword(true);
    setPasswordState({ kind: "pending" });
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengganti password.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordState({
        kind: "success",
        message: "Password diganti. Sesi lain telah dikeluarkan.",
      });
    } catch (err) {
      if (mounted.current) {
        setPasswordState({ kind: "error", message: (err as Error).message });
      }
    } finally {
      if (mounted.current) setSavingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-paper-900">
          Pengaturan
        </h1>
        <p className="text-sm text-paper-500">
          Kelola akun Anda dan lihat bagaimana mesin sinyal dihitung.
        </p>
      </header>

      {/* ------------------------------- Akun ------------------------------ */}
      <Card>
        <CardHeader title="Akun" subtitle={user.email} />
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <label htmlFor="name" className="label mb-1.5 block">
              Nama tampilan
            </label>
            <div className="flex gap-2">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                maxLength={80}
              />
              <button
                type="button"
                onClick={saveName}
                disabled={savingName || name.trim() === user.name}
                className="btn-primary shrink-0"
              >
                {savingName ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
            <StatusMessage state={nameState} />
          </div>

          <div>
            <p className="label mb-2">Ganti password</p>
            <div className="flex flex-col gap-2.5">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Password saat ini"
                autoComplete="current-password"
                className="input"
                aria-label="Password saat ini"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password baru (minimal 8 karakter)"
                autoComplete="new-password"
                className="input"
                aria-label="Password baru"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
                className="input"
                aria-label="Konfirmasi password baru"
              />
              <button
                type="button"
                onClick={savePassword}
                disabled={savingPassword}
                className="btn-secondary self-start"
              >
                {savingPassword ? "Memproses..." : "Ganti password"}
              </button>
            </div>
            <StatusMessage state={passwordState} />
          </div>
        </div>
      </Card>

      {/* ----------------------------- Data & config ------------------------- */}
      <Card>
        <CardHeader title="Data & konfigurasi" subtitle="Sumber data dan cakupan analisis" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Database" value={dbMode === "local" ? "SQLite lokal" : "libSQL / Turso"} />
          <Fact label="Sumber harga" value="Yahoo Finance (gratis)" />
          <Fact label="Saham dipindai" value={`${universeSize} saham IDX`} />
          <Fact label="Sektor" value={`${sectors.length} kategori`} />
          <Fact label="Pengguna terdaftar" value={`${totalUsers} akun`} />
          <Fact label="Peran" value={user.role === "admin" ? "Admin" : "Pengguna"} />
        </div>
        <p className="border-t border-paper-100 px-5 py-3 text-[0.6875rem] leading-relaxed text-paper-500">
          Harga dan laporan keuangan berasal dari penyedia data publik tanpa jaminan kebaruan
          maupun ketepatan. Bursa Efek Indonesia menyediakan data real-time secara resmi hanya
          untuk penyedia data berizin; aplikasi ini hanya menampilkan data yang sudah
          dipublikasikan.
        </p>
      </Card>

      {/* -------------------------Engine documentation ---------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard
          title="Indikator teknikal"
          subtitle="Input untuk komponen teknikal (bobot 60%)"
          items={TECHNICAL_INDICATORS}
        />
        <InfoCard
          title="Rasio fundamental"
          subtitle="Input untuk komponen fundamental (bobot 40%)"
          items={FUNDAMENTAL_RATIOS}
        />
        <InfoCard
          title="Pembobotan skor"
          subtitle="Bagaimana skor gabungan dihitung"
          items={SCORING_WEIGHTS}
        />
        <InfoCard
          title="Kebijakan penyegaran"
          subtitle="Seberapa sering data dimuat ulang"
          items={REFRESH_POLICY}
        />
      </div>

      {/* ------------------------------ Disclaimer -------------------------- */}
      <p className="text-[0.625rem] leading-relaxed text-paper-400">
        Aplikasi ini adalah alat bantu analisis, bukan nasihat keuangan. Rekomendasi bersifat
        otomatis, berbasis data historis, dan dapat keliru. Kerugian perdagangan berada di
        tangan Anda sendiri.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type StatusState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function StatusMessage({ state }: { state: StatusState }) {
  if (state.kind === "idle" || state.kind === "pending") return null;

  const isError = state.kind === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`mt-2 text-[0.6875rem] ${
        isError ? "text-turun-600" : "text-naik-600"
      }`}
    >
      {state.message}
    </p>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 text-sm font-medium text-paper-900">{value}</p>
    </div>
  );
}

function InfoCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: EngineInfo[];
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <dl className="px-5 py-2">
        {items.map((item) => (
          <div key={item.label} className="border-b border-paper-100 py-2 last:border-b-0">
            <dt className="text-xs font-medium text-paper-800">{item.label}</dt>
            <dd className="mt-0.5 text-[0.6875rem] leading-relaxed text-paper-500">
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
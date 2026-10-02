import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { getMarketStatus } from "@/lib/market";
import { isLocalFileDb } from "@/lib/db";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await getSessionUser();

  // Authoritative auth gate. Layout-level check plus per-page checks, since a
  // layout guard alone does not protect Server Functions or route handlers.
  if (!user) redirect("/login");

  return (
    <DashboardShell
      user={{ name: user.name, email: user.email }}
      market={getMarketStatus()}
      localDb={isLocalFileDb()}
    >
      {children}
    </DashboardShell>
  );
}

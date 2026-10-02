import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { countUsers, getSessionUser } from "@/lib/auth";
import { isLocalFileDb } from "@/lib/db";
import { ALL_SECTORS } from "@/lib/analysis-meta";
import { UNIVERSE } from "@/lib/universe";
import { ProfileView } from "@/components/ProfileView";

export const metadata: Metadata = { title: "Pengaturan" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [totalUsers] = await Promise.all([countUsers()]);

  return (
    <ProfileView
      user={{ name: user.name, email: user.email, createdAt: null, role: user.role }}
      dbMode={isLocalFileDb() ? "local" : "remote"}
      universeSize={UNIVERSE.length}
      sectors={ALL_SECTORS}
      totalUsers={totalUsers}
    />
  );
}
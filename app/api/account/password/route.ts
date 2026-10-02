import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, requireUser, updateProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi."),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter.").max(200),
});

/** POST /api/account/password - change password and revoke other sessions. */
export async function POST(request: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Data tidak valid." },
        { status: 400 },
      );
    }

    await updateProfile(userId, parsed.data);

    // Every session was revoked, including this one - the client must sign in
    // again. Clearing the cookie makes that explicit rather than leaving a
    // token that is valid but points at a deleted session row.
    const { cookies } = await import("next/headers");
    (await cookies()).delete("sahamsignal_session");

    return NextResponse.json({ ok: true, requiresRelogin: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[password]", err);
    return NextResponse.json({ error: "Gagal mengganti password." }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, requireUser, updateProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
});

/** PATCH /api/account/profile - update the display name. */
export async function PATCH(request: Request) {
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

    await updateProfile(userId, { name: parsed.data.name });
    return NextResponse.json({ ok: true, name: parsed.data.name });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[profile]", err);
    return NextResponse.json({ error: "Gagal menyimpan profil." }, { status: 500 });
  }
}
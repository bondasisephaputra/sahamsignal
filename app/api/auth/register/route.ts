import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, registerUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().toLowerCase().email("Format email tidak valid."),
  password: z.string().min(8, "Password minimal 8 karakter.").max(200),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Data tidak valid." },
        { status: 400 },
      );
    }

    const user = await registerUser(parsed.data);
    return NextResponse.json({ user: { name: user.name, email: user.email } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[register]", err);
    return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}

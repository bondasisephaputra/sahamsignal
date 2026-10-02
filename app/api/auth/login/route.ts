import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthError, loginUser } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email wajib diisi."),
  password: z.string().min(1, "Password wajib diisi."),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Email dan password wajib diisi." },
        { status: 400 },
      );
    }

    const user = await loginUser(parsed.data.email, parsed.data.password);
    return NextResponse.json({ user: { name: user.name, email: user.email } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[login]", err);
    return NextResponse.json({ error: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}

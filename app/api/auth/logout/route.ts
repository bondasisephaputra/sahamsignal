import { NextResponse } from "next/server";

import { logout } from "@/lib/auth";

export async function POST() {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[logout]", err);
    return NextResponse.json({ error: "Gagal keluar." }, { status: 500 });
  }
}

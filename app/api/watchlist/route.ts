import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { addToWatchlist, clearWatchlist, listWatchlist, removeFromWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ items: await listWatchlist(user.id) });
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const symbol = typeof body?.symbol === "string" ? body.symbol : "";
    const note = typeof body?.note === "string" ? body.note : null;

    const item = await addToWatchlist(userId, symbol, note);
    return NextResponse.json({ item });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("tidak valid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol");

  try {
    if (symbol === "__all__") await clearWatchlist(userId);
    else if (symbol) await removeFromWatchlist(userId, symbol);
    else return NextResponse.json({ error: "Parameter symbol wajib diisi." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watchlist delete]", err);
    return NextResponse.json({ error: "Gagal memperbarui watchlist." }, { status: 500 });
  }
}

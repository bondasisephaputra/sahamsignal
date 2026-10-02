import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getMarketOverview } from "@/lib/analysis";

export const dynamic = "force-dynamic";

/** GET /api/market - IHSG snapshot plus session status. */
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
  }

  try {
    const overview = await getMarketOverview();
    return NextResponse.json(overview);
  } catch (err) {
    console.error("[market]", err);
    return NextResponse.json({ error: "Gagal memuat data indeks." }, { status: 502 });
  }
}

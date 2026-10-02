import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth";
import { screenUniverse, toSignalRow } from "@/lib/analysis";
import { allSectors, UNIVERSE } from "@/lib/universe";
import { SignalExplorer } from "@/components/SignalExplorer";

export const metadata: Metadata = { title: "Sinyal" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SignalsPage(props: PageProps<"/dashboard/sinyal">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const query = await props.searchParams;
  const sector = typeof query.sektor === "string" ? query.sektor : "";
  const aksi = typeof query.aksi === "string" ? query.aksi : "";

  return (
    <Suspense fallback={<ExplorerSkeleton />}>
      <SignalsLoader sector={sector} action={aksi} />
    </Suspense>
  );
}

async function SignalsLoader({ sector, action }: { sector: string; action: string }) {
  const sectors = allSectors();

  const sectorFilter = sector && sectors.includes(sector) ? [sector] : undefined;
  const actionFilter: Array<"buy" | "hold" | "sell"> | undefined =
    action === "buy" || action === "hold" || action === "sell" ? [action] : undefined;

  const screen = await screenUniverse({
    sectors: sectorFilter,
    actions: actionFilter,
    limit: 200,
  });

  const rows = screen.results.map(toSignalRow);

  return (
    <SignalExplorer
      sectors={sectors}
      universeSize={UNIVERSE.length}
      initialSector={sectorFilter?.[0] ?? ""}
      initialAction={actionFilter?.[0] ?? ""}
      initialRows={rows}
      initialGeneratedAt={screen.generatedAt}
      scanned={screen.total}
      analysed={screen.analysed}
      failures={screen.failures}
    />
  );
}

function ExplorerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-paper-200" />
      <div className="mt-6 h-12 rounded-xl bg-paper-200" />
      <div className="mt-4 h-96 rounded-xl bg-paper-200" />
    </div>
  );
}

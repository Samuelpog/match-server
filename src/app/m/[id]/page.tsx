import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchView } from "@/components/MatchView";
import { ArenaSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Match" };

async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchView key={id} id={id} />;
}

export default function Page({ params }: PageProps<"/m/[id]">) {
  return (
    <Suspense fallback={<ArenaSkeleton />}>
      <Match params={params} />
    </Suspense>
  );
}

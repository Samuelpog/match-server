import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveMatch, MatchSkeleton } from "@/components/LiveMatch";

export const metadata: Metadata = { title: "Live-Ansicht" };

async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveMatch id={id} />;
}

export default function Page({ params }: PageProps<"/m/[id]">) {
  return (
    <Suspense fallback={<MatchSkeleton />}>
      <Match params={params} />
    </Suspense>
  );
}

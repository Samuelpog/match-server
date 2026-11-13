import type { Metadata } from "next";
import { Suspense } from "react";
import { SeriesView } from "@/components/SeriesView";
import { ArenaSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Serie" };

async function Series({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SeriesView key={id} id={id} />;
}

export default function Page({ params }: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={<ArenaSkeleton note="Serie wird geladen …" />}>
      <Series params={params} />
    </Suspense>
  );
}

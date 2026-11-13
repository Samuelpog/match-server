import type { Metadata } from "next";
import { Suspense } from "react";
import { ReplayLibrary } from "@/components/ReplayLibrary";
import { ArenaSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Replays" };

export default function Page() {
  return (
    <Suspense fallback={<ArenaSkeleton note="Replays werden geladen …" />}>
      <ReplayLibrary />
    </Suspense>
  );
}

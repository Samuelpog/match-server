import type { Metadata } from "next";
import { LocalPreview } from "@/components/LocalPreview";

export const metadata: Metadata = { title: "Vorschau ohne Server" };

export default function Page() {
  return <LocalPreview />;
}

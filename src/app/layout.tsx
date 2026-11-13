import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Match-Server", template: "%s · Match-Server" },
  description: "Match-Server mit Live-Ansicht: zwei Cloud-Umgebungen spielen per REST gegeneinander.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <nav aria-label="Hauptnavigation" className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-2 px-2 sm:px-4">
            <Link href="/" className="flex min-h-6 items-center font-semibold">
              Match-Server
            </Link>
            <Link href="/schnittstelle" className="flex min-h-6 items-center text-sm text-muted hover:text-ink">
              Schnittstelle
            </Link>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-2 py-4 sm:px-4 sm:py-8">{children}</main>
      </body>
    </html>
  );
}

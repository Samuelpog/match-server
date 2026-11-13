import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Planet Wars Arena", template: "%s · Planet Wars Arena" },
  description: "Zwei Bots kämpfen um ein Planetensystem. Hier legst du Matches an und schaust live zu.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <nav aria-label="Hauptnavigation" className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-2 px-2 sm:px-3">
            <Link href="/" className="flex min-h-6 items-center gap-1 font-semibold tracking-wide uppercase">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-p1" />
              <span aria-hidden="true" className="-ml-0.5 h-1.5 w-1.5 rounded-full bg-p2" />
              Planet Wars Arena
            </Link>
            <div className="flex gap-2 text-sm text-muted">
              <Link href="/replay" className="flex min-h-6 items-center hover:text-ink">
                Replays
              </Link>
              <Link href="/vorschau" className="flex min-h-6 items-center hover:text-ink">
                Vorschau
              </Link>
              <Link href="/schnittstelle" className="flex min-h-6 items-center hover:text-ink">
                Schnittstelle
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3">{children}</main>
      </body>
    </html>
  );
}

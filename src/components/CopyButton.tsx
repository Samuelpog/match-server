"use client";

import { useState } from "react";

/** Kopiert einen Text in die Zwischenablage und meldet das Ergebnis. */
export function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "done" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("done");
    } catch {
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="min-h-5 border border-line bg-raised px-2 text-sm font-semibold hover:border-ink"
    >
      <span aria-live="polite">
        {status === "done" ? "Kopiert" : status === "failed" ? "Bitte von Hand markieren" : label}
      </span>
    </button>
  );
}

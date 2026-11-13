"use client";

import Link from "next/link";
import { useState } from "react";

/** Hinweis mit Überschrift, wenn statt des Inhalts etwas zu erklären ist. */
export function Notice({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[720px] flex-col items-start gap-2 border border-line bg-surface p-2 sm:p-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="text-muted">{children}</div>
      <div className="flex flex-wrap gap-1">
        {actions}
        <Link href="/" className="flex min-h-6 items-center border border-line px-2 hover:border-ink">
          Zur Lobby
        </Link>
      </div>
    </div>
  );
}

/** Platzhalter in der Form der Ansicht, solange das Match lädt. */
export function ArenaSkeleton({ note }: { note?: string }) {
  return (
    <div role="status" aria-label="Match wird geladen" className="flex flex-col gap-2">
      <div className="grid animate-pulse grid-cols-2 gap-2 lg:grid-cols-[1fr_1.3fr_1fr]">
        <div className="h-20 bg-surface" />
        <div className="order-first col-span-full h-20 bg-surface lg:order-none lg:col-span-1" />
        <div className="h-20 bg-surface" />
      </div>
      <div className="flex aspect-[16/10] max-h-[74vh] items-center justify-center border border-line bg-space p-2 text-center text-muted">
        {note ?? "Match wird geladen …"}
      </div>
    </div>
  );
}

const TONES = {
  live: "border-danger bg-danger text-space",
  wait: "border-warn text-warn",
  done: "border-line text-muted",
} as const;

export function StatusChip({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`label border px-0.5 font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

/**
 * Knopf für etwas, das sich nicht zurücknehmen lässt: der erste Klick fragt
 * nach, erst der zweite führt aus.
 */
export function ConfirmButton({
  label,
  question,
  confirm,
  onConfirm,
}: {
  label: string;
  question: string;
  confirm: string;
  onConfirm: () => Promise<void>;
}) {
  const [stage, setStage] = useState<"idle" | "asking" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setStage("busy");
    setError(null);
    try {
      await onConfirm();
      setStage("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das hat nicht geklappt.");
      setStage("idle");
    }
  }

  if (stage === "idle") {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setStage("asking")}
          className="min-h-5 border border-line px-2 text-sm hover:border-danger hover:text-danger"
        >
          {label}
        </button>
        {error ? (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1 text-sm">
      <span>{question}</span>
      <button
        type="button"
        onClick={run}
        disabled={stage === "busy"}
        className="min-h-5 border border-danger px-2 font-semibold text-danger disabled:opacity-50"
      >
        {stage === "busy" ? "Moment …" : confirm}
      </button>
      <button
        type="button"
        onClick={() => setStage("idle")}
        disabled={stage === "busy"}
        className="min-h-5 border border-line px-2 hover:border-ink"
      >
        Nein
      </button>
    </span>
  );
}

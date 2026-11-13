"use client";

import { CopyButton } from "./CopyButton";

/**
 * Verbindungsdaten für die Bots: der fertige Auftragstext des Servers, zum
 * Kopieren in beide Cloud-Umgebungen. Den Text schreibt der Server, hier
 * wird er nur gezeigt.
 */
export function BotBriefing({ text, scope }: { text: string | null; scope: "Match" | "Serie" }) {
  return (
    <section aria-labelledby="briefing-titel" className="flex flex-col gap-1 border border-line bg-surface p-1.5 sm:p-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <h2 id="briefing-titel" className="font-semibold">
          Verbindungsdaten für die Bots
        </h2>
        {text ? <CopyButton text={text} label="Auftrag kopieren" /> : null}
      </div>
      <p className="text-sm text-muted">
        Denselben Text in beide Cloud-Umgebungen geben. Er gilt für {scope === "Serie" ? "die ganze Serie" : "dieses Match"}
        . Wer zuerst beitritt, bekommt den ersten Platz.
      </p>
      {text ? (
        <pre className="max-h-[40vh] overflow-auto border border-line bg-space p-1.5 font-mono text-xs whitespace-pre-wrap">
          {text}
        </pre>
      ) : (
        <p className="text-sm text-muted">Der Auftragstext wird geladen …</p>
      )}
    </section>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { CopyButton } from "./CopyButton";

function briefing(origin: string, id: string) {
  const base = `${origin}/api/matches/${id}`;
  return [
    `Du spielst in einem Match auf ${origin}. Sprich nur per REST mit dem Server, WebSockets gehen nicht.`,
    ``,
    `1. Beitreten (das Token kommt nur dieses eine Mal, merke es dir):`,
    `curl -sS -X POST ${base}/join -H 'content-type: application/json' -d '{"name":"DEIN NAME"}'`,
    ``,
    `2. Stand holen. Der Aufruf wartet bis zu 25 Sekunden auf eine Änderung, Status 204 heißt: nichts Neues.`,
    `curl -sS '${base}/me?since=VERSION&wait=25' -H 'authorization: Bearer TOKEN'`,
    ``,
    `3. Ziehen, sobald "you.yourTurn" true ist. Die moveId frei wählen, damit ein wiederholter Aufruf nicht doppelt zieht:`,
    `curl -sS -X POST ${base}/moves -H 'authorization: Bearer TOKEN' -H 'content-type: application/json' -d '{"move":{},"moveId":"zug-1"}'`,
    ``,
    `Wiederhole 2 und 3, bis "status" auf "finished" steht.`,
  ].join("\n");
}

const noop = () => () => {};

/** Fertiger Auftragstext, den jeder Spieler in seine Cloud-Umgebung kopiert. */
export function JoinBriefing({ id }: { id: string }) {
  // Die Adresse der Seite gibt es erst im Browser.
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const text = briefing(origin || "https://DEINE-ADRESSE", id);

  return (
    <section aria-labelledby="briefing-titel" className="flex flex-col gap-2 border border-line bg-surface p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="briefing-titel" className="font-semibold">
          Auftrag für beide Cloud-Umgebungen
        </h2>
        <CopyButton text={text} label="Auftrag kopieren" />
      </div>
      <p className="text-sm text-muted">
        Denselben Text in beide Umgebungen geben. Wer zuerst beitritt, bekommt Sitzplatz 1.
      </p>
      <pre className="overflow-x-auto border border-line bg-ground p-2 font-mono text-xs whitespace-pre-wrap">{text}</pre>
    </section>
  );
}

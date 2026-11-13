"use client";

import { useEffect, useState } from "react";
import type { MatchView } from "@/lib/match/types";
import { ApiError, fetchMatch } from "./api";

export type LiveMatch =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "error"; message: string }
  | { phase: "ready"; match: MatchView; connection: "live" | "reconnecting" };

const WAIT_SECONDS = 20;
const MAX_BACKOFF_MS = 10_000;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Hält den Stand eines Matches aktuell. Der Server hält jede Anfrage offen,
 * bis sich etwas ändert, deshalb kommt ein neuer Zug sofort an, ohne dass
 * die Seite im Sekundentakt nachfragt. Bei Fehlern wird mit wachsender
 * Pause neu verbunden.
 */
export function useMatch(id: string): LiveMatch {
  const [state, setState] = useState<LiveMatch>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function run() {
      let version: number | undefined;
      let failures = 0;
      while (!signal.aborted) {
        try {
          const changed = await fetchMatch(id, { since: version, waitSeconds: WAIT_SECONDS, signal });
          // Ohne Änderung trotzdem frisch holen: wer online ist, ändert die Version nicht.
          const match = changed ?? (await fetchMatch(id, { signal }));
          if (signal.aborted || !match) return;
          version = match.version;
          failures = 0;
          setState({ phase: "ready", match, connection: "live" });
          if (match.status === "finished") return;
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ApiError && error.status === 404) {
            setState({ phase: "missing" });
            return;
          }
          failures += 1;
          const message = error instanceof Error ? error.message : "Keine Verbindung zum Server.";
          setState((previous) =>
            previous.phase === "ready" ? { ...previous, connection: "reconnecting" } : { phase: "error", message },
          );
          await sleep(Math.min(1000 * 2 ** failures, MAX_BACKOFF_MS), signal);
        }
      }
    }

    run();
    return () => controller.abort();
  }, [id]);

  return state;
}

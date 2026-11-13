"use client";

import { useEffect, useState } from "react";
import type { ReplayResponse } from "@/lib/arena/api-types-v2";
import { toFrame, toMap, toMeta } from "@/lib/viewer/adapter";
import { ArenaController } from "@/lib/viewer/controller";
import { isOver } from "@/lib/viewer/model";
import { ApiError, fetchReplay, sleep } from "./arena-api";
import { loadReplay, saveReplay } from "./replay-store";

export type MatchStream =
  | { phase: "loading"; waking: boolean }
  /** Der Server kennt das Match nicht (mehr). `local`: im Browser liegt noch eine Kopie. */
  | { phase: "missing"; local: boolean }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      controller: ArenaController;
      connection: "live" | "reconnecting" | "closed";
      /** Alles bisher Empfangene im Format des Servers, zum Speichern als Datei. */
      replay: ReplayResponse;
    };

const WAIT_SECONDS = 20;
const MAX_BACKOFF_MS = 10_000;

/**
 * Hält ein Match aktuell. Ein einziger wartender Aufruf liefert neue Frames
 * und Änderungen am Kopf (Beitritt, Start, Verbindung der Bots, Ende). Der
 * Server hält die Anfrage offen, bis es etwas Neues gibt; es wird nicht im
 * Takt nachgefragt. Bei Fehlern wird mit wachsender Pause neu verbunden.
 * Ist das Match zu Ende, wandert es in den Speicher des Browsers.
 *
 * Für ein anderes Match die Komponente mit `key={id}` neu aufbauen: der
 * Zustand gehört zu genau einem Match. `flip` vertauscht die Seiten in der
 * Anzeige (siehe `adapter.ts`); gespeichert wird immer im Format des Servers.
 */
export function useMatchStream(id: string, flip = false): MatchStream {
  const [state, setState] = useState<MatchStream>({ phase: "loading", waking: false });

  useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;

    async function run() {
      let controller: ArenaController | null = null;
      let replay: ReplayResponse | null = null;
      let next = 0;
      let version: number | undefined;
      let failures = 0;

      // Schläft der Server, dauert der erste Aufruf bis zu einer Minute. Das soll man sehen.
      const slow = setTimeout(() => {
        if (!controller && !signal.aborted) setState({ phase: "loading", waking: true });
      }, 4000);

      while (!signal.aborted) {
        try {
          const response = await fetchReplay(id, { from: next, since: version, waitSeconds: WAIT_SECONDS, signal });
          if (signal.aborted) return;
          failures = 0;
          if (!response) {
            if (controller && replay) setState({ phase: "ready", controller, replay, connection: "live" });
            continue;
          }

          if (!controller || !replay) {
            controller = new ArenaController(toMap(response.map, flip), toMeta(response.match, flip));
            replay = { ...response, frames: [] };
            clearTimeout(slow);
          } else {
            controller.setMeta(toMeta(response.match, flip));
          }

          if (!controller.append(response.frames.map((frame) => toFrame(frame, flip)))) {
            // Es fehlt eine Runde: ab der letzten bekannten neu holen, ohne auf Änderungen zu warten.
            next = controller.buffer.lastRound + 1;
            version = undefined;
            continue;
          }
          for (const frame of response.frames) {
            if (frame.round === replay.frames.length) replay.frames.push(frame);
          }
          replay = { ...replay, match: response.match, next: replay.frames.length };
          next = replay.frames.length;
          version = response.match.version;

          const over = isOver(controller.meta.status);
          setState({ phase: "ready", controller, replay, connection: over ? "closed" : "live" });
          if (over) {
            saveReplay(replay).catch(() => {
              // Ohne Speicher im Browser bleibt das Replay nur, solange der Server es kennt.
            });
            return;
          }
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof ApiError && error.status === 404) {
            clearTimeout(slow);
            const local = await loadReplay(id).catch(() => null);
            if (!signal.aborted) setState({ phase: "missing", local: local !== null });
            return;
          }
          failures += 1;
          const message = error instanceof Error ? error.message : "Keine Verbindung zum Server.";
          setState((previous) =>
            previous.phase === "ready"
              ? { ...previous, connection: "reconnecting" }
              : failures >= 3
                ? { phase: "error", message }
                : previous,
          );
          await sleep(Math.min(1000 * 2 ** failures, MAX_BACKOFF_MS), signal);
        }
      }
    }

    run();
    return () => abort.abort();
  }, [id, flip]);

  return state;
}

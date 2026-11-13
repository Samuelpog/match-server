"use client";

import { useSyncExternalStore } from "react";
import type { ArenaController, PlaybackState } from "@/lib/viewer/controller";
import type { MatchMeta } from "@/lib/viewer/model";

/** Zustand des Abspielkopfs. Ändert sich höchstens einmal je Tick, nicht je Bild. */
export function usePlayback(controller: ArenaController): PlaybackState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}

/** Kopf des Matches (Namen, Status, Ergebnis), aktuell gehalten. */
export function useMeta(controller: ArenaController): MatchMeta {
  useSyncExternalStore(controller.subscribe, controller.getMetaVersion, controller.getMetaVersion);
  return controller.meta;
}

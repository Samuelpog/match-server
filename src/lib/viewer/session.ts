import type { ReplayResponse } from "@/lib/arena/api-types";
import { toFrame, toMap, toMeta } from "./adapter";
import { ArenaController } from "./controller";

/** Baut aus einer vollständigen Antwort des Servers oder einer Replay-Datei einen abspielbereiten Controller. */
export function controllerFromReplay(replay: ReplayResponse): ArenaController {
  const controller = new ArenaController(toMap(replay.map), toMeta(replay.match));
  controller.append(replay.frames.map(toFrame));
  return controller;
}

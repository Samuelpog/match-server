import type { ReplayResponse } from "@/lib/arena/api-types";
import { toFrame, toMap, toMeta } from "./adapter";
import { ArenaController } from "./controller";

/** Baut aus einer vollständigen Antwort des Servers oder einer Replay-Datei einen abspielbereiten Controller. */
export function controllerFromReplay(replay: ReplayResponse, flip = false): ArenaController {
  const controller = new ArenaController(toMap(replay.map), toMeta(replay.match, flip));
  controller.append(replay.frames.map((frame) => toFrame(frame, flip)));
  return controller;
}

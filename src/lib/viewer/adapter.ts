import type { MatchInfo, ReplayResponse } from "@/lib/arena/api-types";
import type * as Wire from "@/lib/planetwars/types";
import type { ArenaMap, Fleet, Frame, MatchMeta, Owner, PlanetEvent, PlanetState, Player, ResultReason } from "./model";

/**
 * Übersetzt das Format des Servers in das Anzeige-Modell. Die einzige Stelle,
 * an der die Ansicht die Feldnamen des Servers kennt.
 */

const REASONS: readonly ResultReason[] = ["elimination", "ships", "growth", "draw", "aborted"];

function toOwner(owner: Wire.Owner): Owner {
  return owner === 0 ? 1 : owner === 1 ? 2 : 0;
}

function toState(state: Wire.PlanetState): PlanetState {
  return { owner: toOwner(state[0]), ships: state[1] };
}

export function toMap(map: Wire.GameMap): ArenaMap {
  return {
    width: map.width,
    height: map.height,
    planets: map.planets.map(({ id, x, y, growth }) => ({ id, x, y, growth })),
  };
}

function toFleet(fleet: Wire.Fleet): Fleet {
  return {
    id: String(fleet.id),
    owner: (fleet.owner + 1) as Player,
    from: fleet.from,
    to: fleet.to,
    ships: fleet.ships,
    launch: fleet.depart,
    arrive: fleet.arrive,
  };
}

function toEvent(event: Wire.PlanetEvent, t: number): PlanetEvent {
  const before = toState(event.before);
  const after = toState(event.after);
  const foreign =
    before.owner === 0 ? event.arrivals[0] + event.arrivals[1] : event.arrivals[2 - before.owner];
  return {
    t,
    planet: event.planet,
    kind: event.captured ? "capture" : foreign > 0 ? "battle" : "reinforce",
    arrived: [event.arrivals[0], event.arrivals[1]],
    before,
    after,
  };
}

export function toFrame(frame: Wire.Frame): Frame {
  return {
    t: frame.t,
    at: frame.at,
    planets: frame.planets.map(toState),
    launches: frame.launches.map(toFleet),
    events: frame.events.map((event) => toEvent(event, frame.t)),
    seats: [
      { onTime: frame.t === 0 ? null : frame.players[0].submitted, invalid: frame.players[0].rejected },
      { onTime: frame.t === 0 ? null : frame.players[1].submitted, invalid: frame.players[1].rejected },
    ],
  };
}

export function toMeta(match: MatchInfo): MatchMeta {
  const player = (info: MatchInfo["players"][number]) => ({
    name: info.name ?? (info.joined ? `Sitz ${info.seat + 1}` : "Noch frei"),
    builtIn: info.kind === "bot",
    joined: info.joined,
    online: info.online,
    absent: info.absent,
  });
  const reason = match.result?.reason;
  return {
    id: match.id,
    status: match.status,
    tickLimit: match.tickLimit,
    tickMs: match.tickMs,
    players: [player(match.players[0]), player(match.players[1])],
    result: match.result
      ? {
          winner: toOwner(match.result.winner),
          reason: reason && REASONS.includes(reason) ? reason : "unknown",
        }
      : null,
    series: match.series,
    label: match.label,
  };
}

/**
 * Prüft, ob ein geladenes Objekt wie eine Replay-Datei aussieht. Geprüft wird
 * nur so viel, dass die Ansicht danach nicht abstürzt; eine Datei kann von
 * überall kommen.
 */
export function parseReplayFile(value: unknown): ReplayResponse {
  const fail = (why: string): never => {
    throw new Error(`Das ist keine gültige Replay-Datei: ${why}.`);
  };
  if (value === null || typeof value !== "object") fail("kein JSON-Objekt");
  const file = value as Partial<ReplayResponse>;
  if (file.format !== "planetwars-replay") fail('das Feld "format" fehlt oder ist unbekannt');
  if (file.version !== 1) fail(`Version ${String(file.version)} wird nicht unterstützt`);
  const { match, map, frames } = file;
  if (!match || typeof match !== "object" || !Array.isArray(match.players) || match.players.length !== 2) {
    fail("der Match-Kopf fehlt");
  }
  if (!map || !Array.isArray(map.planets) || map.planets.length === 0) fail("die Karte fehlt");
  if (!Array.isArray(frames) || frames.length === 0) fail("es sind keine Frames enthalten");
  const count = map!.planets.length;
  frames!.forEach((frame, index) => {
    if (!frame || frame.t !== index) fail(`Frame ${index} fehlt oder steht an falscher Stelle`);
    if (!Array.isArray(frame.planets) || frame.planets.length !== count) fail(`Frame ${index} passt nicht zur Karte`);
    if (!Array.isArray(frame.launches) || !Array.isArray(frame.events) || !Array.isArray(frame.players)) {
      fail(`Frame ${index} ist unvollständig`);
    }
    for (const fleet of frame.launches) {
      if (!(fleet.from >= 0 && fleet.from < count && fleet.to >= 0 && fleet.to < count)) {
        fail(`Frame ${index} nennt einen unbekannten Planeten`);
      }
    }
    for (const event of frame.events) {
      if (!(event.planet >= 0 && event.planet < count) || !Array.isArray(event.before) || !Array.isArray(event.after)) {
        fail(`Frame ${index} enthält ein unlesbares Ereignis`);
      }
    }
    if (frame.planets.some((planet) => !Array.isArray(planet) || typeof planet[1] !== "number")) {
      fail(`Frame ${index} enthält einen unlesbaren Planetenstand`);
    }
  });
  return file as ReplayResponse;
}

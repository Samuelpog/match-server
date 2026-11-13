import type { MatchInfo, ReplayResponse } from "@/lib/arena/api-types-v2";
import type * as Wire from "@/lib/game/types";
import type {
  ActionView,
  ArenaMap,
  BuildingType,
  Fleet,
  Frame,
  GameEvent,
  MatchMeta,
  Owner,
  Params,
  PlanetState,
  Player,
  ResultReason,
  SeatRound,
} from "./model";

/**
 * Übersetzt das Format des Servers in das Anzeige-Modell. Die einzige Stelle,
 * an der die Ansicht die Feldnamen des Servers kennt.
 */

const REASONS: readonly ResultReason[] = ["home", "points", "ships", "draw", "aborted"];
const BUILDINGS: readonly BuildingType[] = ["shipyard", "fortress", "command", "radar"];

/**
 * `flip` vertauscht die beiden Seiten in der Anzeige: Sitz 1 wird Spieler 1
 * (blau, links), Sitz 0 wird Spieler 2. In einer Serie wechseln die Sitze von
 * Spiel zu Spiel; so behält jeder Teilnehmer über die ganze Serie seine Farbe.
 */
function toOwner(owner: Wire.Owner, flip: boolean): Owner {
  if (owner === null) return 0;
  return ((flip ? 1 - owner : owner) + 1) as Owner;
}

/** Ein Paar in der Reihenfolge der Sitze wird zum Paar in der Reihenfolge der Spieler. */
function pair<T>(values: readonly [T, T], flip: boolean): [T, T] {
  return flip ? [values[1], values[0]] : [values[0], values[1]];
}

export function toMap(map: Wire.GameMap, flip = false): ArenaMap {
  return {
    width: map.width,
    height: map.height,
    planets: map.planets.map(({ id, name, x, y, growth, home, hub }) => ({
      id,
      name,
      x,
      y,
      growth,
      home: toOwner(home, flip),
      hub,
    })),
    routes: map.routes.map(([a, b, length]) => ({ a, b, length })),
  };
}

function toState(state: Wire.PlanetState, flip: boolean): PlanetState {
  return {
    owner: toOwner(state.owner, flip),
    ships: state.ships,
    building: state.building ? { type: state.building.type, ready: state.building.ready } : null,
    supply: state.supply,
  };
}

function toFleet(fleet: Wire.Fleet, flip: boolean): Fleet {
  return {
    id: fleet.id,
    owner: toOwner(fleet.owner, flip) as Player,
    from: fleet.from,
    to: fleet.to,
    ships: fleet.ships,
    progress: fleet.progress,
    length: fleet.length,
    arrive: fleet.arrive,
    supply: fleet.supply,
  };
}

const index = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** Die Eingabe eines Bots kann alles sein. Gelesen wird nur, was die erwartete Form hat. */
function toAction(record: Wire.ActionRecord): ActionView {
  const raw = (record.action !== null && typeof record.action === "object" ? record.action : {}) as Record<string, unknown>;
  const kind = raw.type === "move" || raw.type === "build" || raw.type === "supply" ? raw.type : "other";
  const building = BUILDINGS.find((type) => type === raw.building) ?? null;
  return {
    ok: record.ok,
    code: record.ok ? null : (record.code ?? "bad_action"),
    kind,
    from: kind === "move" ? index(raw.from) : index(raw.planet),
    to: kind === "build" ? null : index(raw.to),
    ships: kind === "move" ? index(raw.ships) : null,
    building: kind === "build" ? building : null,
    fleet: record.fleet ?? null,
  };
}

function toEvent(event: Wire.GameEvent, round: number, flip: boolean): GameEvent | null {
  if (event.step === "route") {
    return {
      kind: "route",
      round,
      a: event.route[0],
      b: event.route[1],
      at: event.at,
      fleets: event.fleets.map((fleet) => ({
        id: fleet.id,
        owner: toOwner(fleet.owner, flip) as Player,
        before: fleet.before,
        after: fleet.after,
      })),
    };
  }
  if (event.step === "arrival") {
    return {
      kind: event.captured ? "capture" : event.kind,
      round,
      planet: event.planet,
      fleets: event.fleets,
      arrived: pair(event.arrivals, flip),
      before: { owner: toOwner(event.before.owner, flip), ships: event.before.ships },
      strength: event.defense.strength,
      after: { owner: toOwner(event.after.owner, flip), ships: event.after.ships },
      destroyed: event.destroyed,
    };
  }
  if (event.step === "build") return { kind: "built", round, planet: event.planet, building: event.building };
  // Nachschub ist an der Flotte selbst zu sehen und braucht kein eigenes Ereignis.
  return null;
}

function toSeat(seat: Wire.SeatFrame, round: number): SeatRound {
  return {
    submitted: round === 0 ? null : seat.submitted,
    used: seat.actions.used,
    limit: seat.actions.limit,
    score: seat.score,
    ships: seat.ships,
    planets: seat.planets,
    production: seat.production,
  };
}

export function toFrame(frame: Wire.Frame, flip = false): Frame {
  const events: GameEvent[] = [];
  for (const event of frame.events) {
    const shown = toEvent(event, frame.round, flip);
    if (shown) events.push(shown);
  }
  return {
    round: frame.round,
    at: frame.at,
    planets: frame.planets.map((state) => toState(state, flip)),
    fleets: frame.fleets.map((fleet) => toFleet(fleet, flip)),
    actions: pair([frame.actions[0].map(toAction), frame.actions[1].map(toAction)], flip),
    events,
    seats: pair([toSeat(frame.players[0], frame.round), toSeat(frame.players[1], frame.round)], flip),
    visible: frame.visible ? pair(frame.visible, flip) : null,
  };
}

function toParams(params: Wire.RuleParams): Params {
  return {
    actions: { base: params.actions.base, max: params.actions.max },
    homeGuard: params.home.guard,
    fortressFactor: params.fortressFactor,
    shipyardFactor: params.shipyardFactor,
    scorePerBuilding: params.scorePerBuilding,
    buildings: params.buildings,
  };
}

export function toMeta(match: MatchInfo, flip = false): MatchMeta {
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
    rules: match.rules,
    params: toParams(match.params),
    rounds: match.rounds,
    roundMs: match.roundMs,
    timeoutMs: match.timeoutMs,
    players: pair([player(match.players[0]), player(match.players[1])], flip),
    result: match.result
      ? {
          winner: toOwner(match.result.winner, flip),
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
  const file = value as Partial<ReplayResponse> & { version?: unknown };
  if (file.format !== "planetwars-replay") fail('das Feld "format" fehlt oder ist unbekannt');
  if ((file.version as unknown) === 1) {
    throw new Error(
      "Diese Datei stammt aus dem alten Planet Wars. Seit der Umstellung auf die Rundenstrategie lässt sie sich nicht mehr abspielen.",
    );
  }
  if (file.version !== 2) fail(`Version ${String(file.version)} wird nicht unterstützt`);
  const { match, map, frames } = file;
  if (!match || typeof match !== "object" || !Array.isArray(match.players) || match.players.length !== 2) {
    fail("der Match-Kopf fehlt");
  }
  if (!match!.params || typeof match!.params !== "object" || !match!.params.actions || !match!.params.home) {
    fail("die Zahlenwerte der Regeln fehlen");
  }
  if (!map || !Array.isArray(map.planets) || map.planets.length === 0 || !Array.isArray(map.routes)) fail("die Karte fehlt");
  const count = map!.planets.length;
  const known = (planet: unknown) => typeof planet === "number" && planet >= 0 && planet < count;
  for (const route of map!.routes) {
    if (!Array.isArray(route) || !known(route[0]) || !known(route[1]) || !(route[2] >= 1)) fail("eine Route ist unlesbar");
  }
  if (!Array.isArray(frames) || frames.length === 0) fail("es sind keine Frames enthalten");
  frames!.forEach((frame, at) => {
    if (!frame || frame.round !== at) fail(`Frame ${at} fehlt oder steht an falscher Stelle`);
    if (!Array.isArray(frame.planets) || frame.planets.length !== count) fail(`Frame ${at} passt nicht zur Karte`);
    if (
      !Array.isArray(frame.fleets) ||
      !Array.isArray(frame.events) ||
      !Array.isArray(frame.players) ||
      frame.players.length !== 2 ||
      !Array.isArray(frame.actions) ||
      !Array.isArray(frame.actions[0]) ||
      !Array.isArray(frame.actions[1])
    ) {
      fail(`Frame ${at} ist unvollständig`);
    }
    if (frame.planets.some((planet) => !planet || typeof planet.ships !== "number")) {
      fail(`Frame ${at} enthält einen unlesbaren Planetenstand`);
    }
    for (const fleet of frame.fleets) {
      if (!fleet || !known(fleet.from) || !known(fleet.to) || !(fleet.length >= 1)) {
        fail(`Frame ${at} nennt eine Flotte mit unbekanntem Planeten`);
      }
    }
    for (const seat of frame.players) {
      if (!seat || !seat.actions) fail(`Frame ${at} ist unvollständig`);
    }
    for (const event of frame.events) {
      const readable =
        event &&
        ((event.step === "route" && Array.isArray(event.route) && known(event.route[0]) && known(event.route[1]) && Array.isArray(event.fleets)) ||
          (event.step === "arrival" && known(event.planet) && Array.isArray(event.fleets) && Array.isArray(event.arrivals) && !!event.before && !!event.after && !!event.defense) ||
          ((event.step === "build" || event.step === "production") && known(event.planet)));
      if (!readable) fail(`Frame ${at} enthält ein unlesbares Ereignis`);
    }
  });
  return file as ReplayResponse;
}

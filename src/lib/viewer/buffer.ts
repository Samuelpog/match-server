import type { ArenaMap, BuildEvent, Frame, Params, PlanetEvent, Player, RouteBattle } from "./model";

/**
 * Der Weg einer Flotte durch eine Runde: wo sie beginnt, wie weit sie zieht,
 * ob sie unterwegs kämpft und ob sie ankommt. Positionen zählen in Runden ab
 * dem Startplaneten der Flotte.
 */
export interface Track {
  id: number;
  owner: Player;
  from: number;
  to: number;
  length: number;
  supply: boolean;
  /** Schiffe zu Beginn der Runde, bei einer neuen Flotte die gestarteten Schiffe. */
  ships: number;
  /** Schiffe am Ende der Runde. 0: vernichtet. */
  shipsAfter: number;
  start: number;
  /** Position nach der Bewegung, wenn kein Kampf sie aufhält. */
  end: number;
  /** Startet in dieser Runde und bleibt bis zur nächsten am Startplaneten stehen. */
  launched: boolean;
  /** Kämpfe auf der Route in ihrer Reihenfolge. */
  battles: { at: number; after: number }[];
  /** Kommt in dieser Runde am Ziel an. */
  arrives: boolean;
}

/** Alles, was beim Auflösen einer Runde geschieht, zum Abspielen aufbereitet. */
export interface Transition {
  /** Die Runde, deren Auflösung gezeigt wird: der Weg von Frame `round - 1` zu Frame `round`. */
  round: number;
  tracks: Track[];
  /**
   * Schiffe, die ein Planet gleich zu Beginn der Runde abgibt: gestartete
   * Flotten und die Kosten eines Baus. Schlüssel ist der Planet.
   */
  launched: Map<number, number>;
  /** Planeten, auf denen in dieser Runde ein Bau beginnt. */
  started: Set<number>;
  routeBattles: RouteBattle[];
  planetEvents: PlanetEvent[];
  built: BuildEvent[];
}

/**
 * Alle bekannten Frames eines Matches und je Runde der aufbereitete Ablauf.
 * Der Puffer wächst nur nach hinten; Frames kommen in der Reihenfolge der Runden.
 */
export class ReplayBuffer {
  readonly frames: Frame[] = [];
  /** Index = Runde. Für Runde 0 gibt es keinen Ablauf. */
  readonly transitions: (Transition | null)[] = [];
  /** Alle Besitzerwechsel in der Reihenfolge der Runden, für die Zeitleiste. */
  readonly captures: PlanetEvent[] = [];

  private readonly routeLength = new Map<string, number>();

  /** `params` nennt die Baukosten. Ohne sie zeigt die Ansicht den Abzug erst mit dem neuen Stand. */
  constructor(
    readonly map: ArenaMap,
    private readonly params?: Params,
  ) {
    for (const route of map.routes) this.routeLength.set(`${route.a}:${route.b}`, route.length);
  }

  /** Letzte bekannte Runde, `-1` solange kein Frame da ist. */
  get lastRound(): number {
    return this.frames.length - 1;
  }

  /** Länge der Route zwischen zwei Planeten in Runden, 1 wenn es keine gibt. */
  lengthOf(a: number, b: number): number {
    return this.routeLength.get(a < b ? `${a}:${b}` : `${b}:${a}`) ?? 1;
  }

  /**
   * Hängt einen Frame an. Schon bekannte Runden werden übergangen. Fehlt eine
   * Runde dazwischen, bleibt der Puffer unverändert und die Antwort ist
   * `false`: der Aufrufer muss ab `lastRound + 1` neu holen.
   */
  append(frame: Frame): boolean {
    if (frame.round < this.frames.length) return true;
    if (frame.round !== this.frames.length) return false;
    if (frame.planets.length !== this.map.planets.length) return false;

    const previous = this.frames[frame.round - 1];
    this.frames.push(frame);
    this.transitions.push(previous ? this.plan(previous, frame) : null);
    for (const event of frame.events) if (event.kind === "capture") this.captures.push(event);
    return true;
  }

  private plan(previous: Frame, frame: Frame): Transition {
    const tracks = new Map<number, Track>();
    const launched = new Map<number, number>();
    const started = new Set<number>();
    const after = new Map(frame.fleets.map((fleet) => [fleet.id, fleet]));

    for (const fleet of previous.fleets) {
      tracks.set(fleet.id, {
        id: fleet.id,
        owner: fleet.owner,
        from: fleet.from,
        to: fleet.to,
        length: fleet.length,
        supply: fleet.supply,
        ships: fleet.ships,
        shipsAfter: after.get(fleet.id)?.ships ?? fleet.ships,
        start: fleet.progress,
        end: Math.min(fleet.length, fleet.progress + 1),
        launched: false,
        battles: [],
        arrives: false,
      });
    }

    // Neue Flotten stehen in den Aktionen. Auch die, die noch vor dem Planeten vernichtet wurden.
    frame.actions.forEach((actions, side) => {
      for (const action of actions) {
        if (action.ok && action.kind === "build" && action.from !== null && action.building) {
          started.add(action.from);
          const cost = this.params?.buildings[action.building]?.cost ?? 0;
          if (cost > 0) launched.set(action.from, (launched.get(action.from) ?? 0) + cost);
          continue;
        }
        if (!action.ok || action.kind !== "move" || action.fleet === null) continue;
        if (action.from === null || action.to === null || action.ships === null) continue;
        launched.set(action.from, (launched.get(action.from) ?? 0) + action.ships);
        const known = tracks.get(action.fleet);
        if (known) {
          // Zwei Züge über dieselbe Route in einer Runde bilden eine Flotte.
          known.ships += action.ships;
          if (!after.has(known.id)) known.shipsAfter = known.ships;
          continue;
        }
        tracks.set(action.fleet, {
          id: action.fleet,
          owner: (side + 1) as Player,
          from: action.from,
          to: action.to,
          length: after.get(action.fleet)?.length ?? this.lengthOf(action.from, action.to),
          supply: false,
          ships: action.ships,
          shipsAfter: after.get(action.fleet)?.ships ?? action.ships,
          start: 0,
          end: 0,
          launched: true,
          battles: [],
          arrives: false,
        });
      }
    });

    // Nachschub startet ohne Aktion. Er erscheint einfach im neuen Frame.
    for (const fleet of frame.fleets) {
      if (tracks.has(fleet.id)) continue;
      tracks.set(fleet.id, {
        id: fleet.id,
        owner: fleet.owner,
        from: fleet.from,
        to: fleet.to,
        length: fleet.length,
        supply: fleet.supply,
        ships: fleet.ships,
        shipsAfter: fleet.ships,
        start: fleet.progress,
        end: fleet.progress,
        launched: true,
        battles: [],
        arrives: false,
      });
    }

    const routeBattles: RouteBattle[] = [];
    const planetEvents: PlanetEvent[] = [];
    const built: BuildEvent[] = [];
    for (const event of frame.events) {
      if (event.kind === "route") {
        routeBattles.push(event);
        for (const fighter of event.fleets) {
          const track = tracks.get(fighter.id);
          if (!track) continue;
          track.battles.push({ at: track.from === event.a ? event.at : track.length - event.at, after: fighter.after });
          track.shipsAfter = fighter.after;
        }
      } else if (event.kind === "built") {
        built.push(event);
      } else {
        planetEvents.push(event);
        for (const id of event.fleets) {
          const track = tracks.get(id);
          if (!track) continue;
          track.arrives = true;
          track.end = track.length;
        }
      }
    }

    return { round: frame.round, tracks: [...tracks.values()], launched, started, routeBattles, planetEvents, built };
  }

  /** Der Frame, der an Position `pos` gilt (abgerundet, auf den Puffer begrenzt). */
  frameAt(pos: number): Frame | null {
    if (this.frames.length === 0) return null;
    return this.frames[Math.min(this.lastRound, Math.max(0, Math.floor(pos)))];
  }
}

/** Zahl der neutralen Planeten in einem Frame. */
export function neutralPlanets(frame: Frame): number {
  let count = 0;
  for (const planet of frame.planets) if (planet.owner === 0) count += 1;
  return count;
}

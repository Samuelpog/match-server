import type { ArenaMap, Fleet, Frame, Owner, PlanetEvent, TickStats } from "./model";

/**
 * Alle bekannten Frames eines Matches, dazu alles, was sich daraus ableiten
 * lässt: Flotten in der Luft, Ereignisse an Planeten, Summen je Tick. Der
 * Puffer wächst nur nach hinten; Frames kommen in der Reihenfolge der Ticks.
 */
export class ReplayBuffer {
  readonly frames: Frame[] = [];
  readonly stats: TickStats[] = [];
  /** Alle Flotten, sortiert nach Start-Tick. */
  readonly fleets: Fleet[] = [];
  /** Ereignisse je Tick; Index = Tick. */
  readonly events: PlanetEvent[][] = [];
  /** Alle Besitzerwechsel in der Reihenfolge der Ticks, für die Zeitleiste. */
  readonly captures: PlanetEvent[] = [];

  private readonly arrivals = new Map<number, Fleet[]>();
  /** Erste Flotte, die für `activeFleets` noch in Frage kommt. Wächst mit dem Abspielkopf. */
  private scanFrom = 0;
  private scanTick = 0;

  constructor(readonly map: ArenaMap) {}

  /** Letzter bekannter Tick, `-1` solange kein Frame da ist. */
  get lastTick(): number {
    return this.frames.length - 1;
  }

  /**
   * Hängt einen Frame an. Schon bekannte Ticks werden übergangen. Fehlt ein
   * Tick dazwischen, bleibt der Puffer unverändert und die Antwort ist
   * `false`: der Aufrufer muss ab `lastTick + 1` neu holen.
   */
  append(frame: Frame): boolean {
    if (frame.t < this.frames.length) return true;
    if (frame.t !== this.frames.length) return false;
    if (frame.planets.length !== this.map.planets.length) return false;

    for (const fleet of frame.launches) {
      this.fleets.push(fleet);
      const list = this.arrivals.get(fleet.arrive);
      if (list) list.push(fleet);
      else this.arrivals.set(fleet.arrive, [fleet]);
    }

    const previous = this.frames[frame.t - 1];
    this.frames.push(frame);
    const events = previous ? this.deriveEvents(previous, frame) : [];
    this.events.push(events);
    for (const event of events) if (event.kind === "capture") this.captures.push(event);
    this.stats.push(this.deriveStats(frame));
    return true;
  }

  private deriveEvents(previous: Frame, frame: Frame): PlanetEvent[] {
    const byPlanet = new Map<number, [number, number]>();
    for (const fleet of this.arrivals.get(frame.t) ?? []) {
      const arrived = byPlanet.get(fleet.to) ?? [0, 0];
      arrived[fleet.owner - 1] += fleet.ships;
      byPlanet.set(fleet.to, arrived);
    }

    const events: PlanetEvent[] = [];
    frame.planets.forEach((after, planet) => {
      const before = previous.planets[planet];
      const arrived = byPlanet.get(planet);
      const changed = before.owner !== after.owner;
      // Ein Besitzerwechsel ohne gemeldete Ankunft wird trotzdem gezeigt, statt ihn zu verschlucken.
      if (!arrived && !changed) return;
      const counts = arrived ?? [0, 0];
      const foreign = before.owner === 0 ? counts[0] + counts[1] : counts[2 - before.owner];
      const kind = changed ? "capture" : foreign > 0 ? "battle" : "reinforce";
      events.push({ t: frame.t, planet, kind, arrived: counts, before, after });
    });
    return events;
  }

  private deriveStats(frame: Frame): TickStats {
    const stats: TickStats = {
      onPlanets: [0, 0],
      inFlight: [0, 0],
      ships: [0, 0],
      production: [0, 0],
      planets: [0, 0],
      neutralPlanets: 0,
    };
    frame.planets.forEach((planet, index) => {
      if (planet.owner === 0) {
        stats.neutralPlanets += 1;
        return;
      }
      const side = planet.owner - 1;
      stats.onPlanets[side] += planet.ships;
      stats.production[side] += this.map.planets[index].growth;
      stats.planets[side] += 1;
    });
    // In der Luft: wie im Tick davor, plus Starts, minus Ankünfte dieses Ticks.
    const before = this.stats[frame.t - 1];
    if (before) stats.inFlight = [before.inFlight[0], before.inFlight[1]];
    for (const fleet of frame.launches) {
      if (fleet.arrive > frame.t) stats.inFlight[fleet.owner - 1] += fleet.ships;
    }
    for (const fleet of this.arrivals.get(frame.t) ?? []) {
      if (fleet.launch < frame.t) stats.inFlight[fleet.owner - 1] -= fleet.ships;
    }
    stats.ships = [stats.onPlanets[0] + stats.inFlight[0], stats.onPlanets[1] + stats.inFlight[1]];
    return stats;
  }

  /** Der Frame, der an Position `pos` gilt (abgerundet, auf den Puffer begrenzt). */
  frameAt(pos: number): Frame | null {
    if (this.frames.length === 0) return null;
    return this.frames[Math.min(this.lastTick, Math.max(0, Math.floor(pos)))];
  }

  /**
   * Flotten, die an Position `pos` unterwegs sind. Eine Flotte ist ab ihrem
   * Start-Tick sichtbar und verschwindet mit ihrem Ankunfts-Tick.
   */
  activeFleets(pos: number, into: Fleet[] = []): Fleet[] {
    into.length = 0;
    const fleets = this.fleets;
    // Beim Zurückspulen von vorn suchen, sonst dort weiter, wo zuletzt alles davor gelandet war.
    if (pos < this.scanTick) this.scanFrom = 0;
    this.scanTick = pos;
    let allLandedSoFar = true;
    for (let i = this.scanFrom; i < fleets.length; i++) {
      const fleet = fleets[i];
      if (fleet.launch > pos) break;
      if (fleet.arrive > pos) {
        into.push(fleet);
        allLandedSoFar = false;
      } else if (allLandedSoFar) {
        this.scanFrom = i + 1;
      }
    }
    return into;
  }

  /** Ereignisse, deren Tick in `(pos - span, pos]` liegt, älteste zuerst. */
  eventsWithin(pos: number, span: number, into: PlanetEvent[] = []): PlanetEvent[] {
    into.length = 0;
    const last = Math.min(this.lastTick, Math.floor(pos));
    const first = Math.max(1, Math.floor(pos - span) + 1);
    for (let t = first; t <= last; t++) {
      for (const event of this.events[t]) into.push(event);
    }
    return into;
  }

  /** Letzter Besitzerwechsel eines Planeten bis einschließlich Tick `t`, sonst `null`. */
  lastCapture(planet: number, t: number): PlanetEvent | null {
    for (let i = this.captures.length - 1; i >= 0; i--) {
      const capture = this.captures[i];
      if (capture.t <= t && capture.planet === planet) return capture;
    }
    return null;
  }
}

/** Anteil von Spieler 1 an der Summe beider Werte, `0.5` wenn beide null sind. */
export function share(pair: readonly [number, number]): number {
  const sum = pair[0] + pair[1];
  return sum === 0 ? 0.5 : pair[0] / sum;
}

export function ownerOfSeat(seat: number | null | undefined): Owner {
  return seat === 0 ? 1 : seat === 1 ? 2 : 0;
}

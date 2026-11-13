import { travelTicks } from "./engine";
import { mulberry32 } from "./rng";
import type { BotFunction, BotInput, GameMap, GameState, Order, Seat } from "./types";

export interface BuiltinBot {
  id: string;
  name: string;
  description: string;
  play: BotFunction;
}

interface Incoming {
  /** Schiffe im Anflug je Sitz. */
  ships: [number, number];
}

function incomingByPlanet(map: GameMap, state: GameState): Incoming[] {
  const incoming: Incoming[] = map.planets.map(() => ({ ships: [0, 0] }));
  for (const fleet of state.fleets) incoming[fleet.to].ships[fleet.owner] += fleet.ships;
  return incoming;
}

/** Schiffe, die ein eigener Planet abgeben kann, ohne an bekannten Angriffen zu fallen. */
function spare(state: GameState, incoming: Incoming[], you: Seat, id: number): number {
  const enemy = (1 - you) as Seat;
  const threat = incoming[id].ships[enemy] - incoming[id].ships[you];
  return Math.max(0, state.planets[id][1] - Math.max(0, threat));
}

/** Tut nichts. Gut, um den eigenen Bot gegen ein wehrloses Ziel zu prüfen. */
const idle: BotFunction = () => [];

/** Schickt von zufälligen Planeten zufällig viele Schiffe an zufällige Ziele. Bei gleichem Stand immer gleich. */
const random: BotFunction = ({ map, state, you }) => {
  const next = mulberry32((map.seed ^ Math.imul(state.tick + 1, 2654435761) ^ (you + 1)) >>> 0);
  const orders: Order[] = [];
  state.planets.forEach(([owner, ships], id) => {
    if (owner !== you || ships < 10 || next() < 0.7) return;
    let to = Math.floor(next() * map.planets.length);
    if (to === id) to = (to + 1) % map.planets.length;
    orders.push({ from: id, to, ships: Math.ceil(ships * (0.3 + next() * 0.5)) });
  });
  return orders;
};

/**
 * Wächst gezielt: nimmt jeweils die Planeten, die je eingesetztem Schiff und
 * je Flugzeit am meisten Produktion bringen, und schickt genau so viele
 * Schiffe, wie für die Eroberung nötig sind. Überschuss wandert an die Front.
 */
const expand: BotFunction = ({ map, state, you }) => {
  const enemy = (1 - you) as Seat;
  const incoming = incomingByPlanet(map, state);
  const mine = state.planets.flatMap(([owner], id) => (owner === you ? [id] : []));
  const available = new Map(mine.map((id) => [id, spare(state, incoming, you, id)]));

  const candidates: { from: number; to: number; need: number; score: number }[] = [];
  for (const from of mine) {
    state.planets.forEach(([owner, ships], to) => {
      if (owner === you) return;
      const eta = travelTicks(map, from, to);
      const defence = ships + (owner === enemy ? map.planets[to].growth * eta : 0);
      const need = defence + incoming[to].ships[enemy] - incoming[to].ships[you] + 1;
      if (need <= 0) return;
      const worth = map.planets[to].growth * (owner === enemy ? 2 : 1);
      candidates.push({ from, to, need, score: worth / (need + eta * 3) });
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.from - b.from || a.to - b.to);

  const orders: Order[] = [];
  const claimed = new Set<number>();
  for (const { from, to, need } of candidates) {
    const left = available.get(from) ?? 0;
    if (claimed.has(to) || need > left) continue;
    orders.push({ from, to, ships: need });
    available.set(from, left - need);
    claimed.add(to);
  }

  // Wer nichts erobern konnte, schickt seinen Überschuss zum eigenen Planeten, der dem Gegner am nächsten liegt.
  const hostile = state.planets.flatMap(([owner], id) => (owner === enemy ? [id] : []));
  if (hostile.length > 0 && mine.length > 1) {
    const reach = (id: number) => Math.min(...hostile.map((target) => travelTicks(map, id, target)));
    const front = mine.reduce((best, id) => (reach(id) < reach(best) ? id : best));
    for (const from of mine) {
      const left = available.get(from) ?? 0;
      if (from === front || left < 20 || orders.some((order) => order.from === from)) continue;
      orders.push({ from, to: front, ships: Math.floor(left / 2) });
    }
  }
  return orders;
};

/**
 * Greift an: sichert sich früh zwei, drei billige Planeten in der Nähe und
 * wirft danach alles auf den jeweils schwächsten erreichbaren Planeten des Gegners.
 */
const rush: BotFunction = (input) => {
  const { map, state, you } = input;
  const enemy = (1 - you) as Seat;
  const incoming = incomingByPlanet(map, state);
  const mine = state.planets.flatMap(([owner], id) => (owner === you ? [id] : []));
  const hostile = state.planets.flatMap(([owner], id) => (owner === enemy ? [id] : []));
  if (mine.length < 3 || hostile.length === 0) return expand(input);

  const orders: Order[] = [];
  for (const from of mine) {
    const left = spare(state, incoming, you, from);
    if (left < 15) continue;
    let best: { to: number; cost: number } | null = null;
    for (const to of hostile) {
      const eta = travelTicks(map, from, to);
      const cost = state.planets[to][1] + map.planets[to].growth * eta + incoming[to].ships[enemy] + eta * 2;
      if (!best || cost < best.cost) best = { to, cost };
    }
    if (best) orders.push({ from, to: best.to, ships: Math.floor(left * 0.8) });
  }
  return orders;
};

export const BUILTIN_BOTS: readonly BuiltinBot[] = [
  {
    id: "expansion",
    name: "Expansion",
    description: "Nimmt gezielt die lohnendsten Planeten und schickt genau die nötigen Schiffe.",
    play: expand,
  },
  {
    id: "sturm",
    name: "Sturm",
    description: "Sichert sich wenige Planeten und greift dann pausenlos den Gegner an.",
    play: rush,
  },
  {
    id: "zufall",
    name: "Zufall",
    description: "Schickt zufällige Flotten an zufällige Ziele. Reproduzierbar bei gleicher Karte.",
    play: random,
  },
  {
    id: "passiv",
    name: "Passiv",
    description: "Tut nichts. Ein wehrloses Ziel für erste Tests des eigenen Bots.",
    play: idle,
  },
];

export const DEMO_BOTS: [string, string] = ["expansion", "sturm"];

export function getBuiltinBot(id: string): BuiltinBot | null {
  return BUILTIN_BOTS.find((bot) => bot.id === id) ?? null;
}

/** Ruft einen Bot auf und fängt Fehler ab: ein kaputter Bot setzt aus, statt das Match zu stoppen. */
export function runBot(play: BotFunction, input: BotInput): Order[] {
  try {
    const orders = play(input);
    return Array.isArray(orders) ? orders : [];
  } catch {
    return [];
  }
}


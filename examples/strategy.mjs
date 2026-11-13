/**
 * Beispiel-Strategie für die Rundenstrategie. Eine Funktion: Stand hinein
 * (`PlayerState` aus docs/API.md), Liste von Aktionen heraus.
 *
 * Dieselbe Datei läuft im Simulator und gegen den Server:
 *   npm run sim -- --a ./examples/strategy.mjs --b standard
 *   node examples/bot.mjs --vs standard
 *
 * Die Strategie ist absichtlich schlicht: Jeder eigene Planet nimmt den
 * schwächsten Nachbarn, den er sicher erobern kann. Wer keinen findet und
 * nicht an der Front liegt, schiebt seine Schiffe Richtung Gegner.
 */
export default function decide(state) {
  const me = state.you;
  const planets = state.planets;
  const guard = state.params.home.guard;

  // Nachbarn je Planet aus der Routenliste: [[a, b, Runden], ...]
  const near = planets.map(() => []);
  for (const [a, b, length] of state.routes) {
    near[a].push({ id: b, length });
    near[b].push({ id: a, length });
  }

  // Runden bis zum gegnerischen Heimatplaneten, von jedem Planeten aus.
  const enemyHome = planets.find((planet) => planet.home !== null && planet.home !== me).id;
  const toEnemy = planets.map(() => Infinity);
  toEnemy[enemyHome] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [a, b, length] of state.routes) {
      const best = Math.min(toEnemy[a], toEnemy[b]) + length;
      if (best < toEnemy[a] || best < toEnemy[b]) {
        if (best < toEnemy[a]) toEnemy[a] = best;
        else toEnemy[b] = best;
        changed = true;
      }
    }
  }

  // Was schon unterwegs ist, muss nicht noch einmal geschickt werden.
  const onTheWay = planets.map(() => 0);
  for (const fleet of state.fleets) if (fleet.owner === me) onTheWay[fleet.to] += fleet.ships;

  const candidates = [];
  for (const source of planets) {
    if (source.owner !== me || source.ships < 2) continue;
    let best = null;
    for (const { id, length } of near[source.id]) {
      const target = planets[id];
      if (target.owner === me) continue;
      const defence =
        target.owner === null
          ? target.ships
          : target.ships + target.growth * length + (target.home === target.owner ? guard : 0);
      const need = defence + 1 - onTheWay[id];
      if (need <= 0 || need > source.ships - 2) continue;
      if (!best || need < best.ships) best = { type: "move", from: source.id, to: id, ships: need };
    }
    if (best) {
      candidates.push({ action: best, weight: 1000 - best.ships });
      continue;
    }
    const front = near[source.id].some(({ id }) => planets[id].owner !== me);
    if (!front && source.ships >= 6) {
      const next = near[source.id].reduce((a, b) => (toEnemy[b.id] + b.length < toEnemy[a.id] + a.length ? b : a));
      candidates.push({ action: { type: "move", from: source.id, to: next.id, ships: source.ships }, weight: source.ships });
    }
  }

  // Je Runde gelten nur `state.actions.limit` Aktionen. Die wichtigsten zuerst.
  return candidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, state.actions.limit)
    .map((candidate) => candidate.action);
}

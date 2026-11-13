/**
 * Simulator für die Bot-Entwicklung: spielt zwei Bots ohne Server
 * gegeneinander, über viele Karten und beide Sitzverteilungen.
 *
 *   npm run sim -- --a standard --b sturm
 *   npm run sim -- --a ./examples/strategy.mjs --b standard --karten 500
 *
 * Ein Bot ist die Kennung eines eingebauten Bots oder eine Datei, deren
 * Standard-Export eine Funktion ist: Stand hinein, Liste von Aktionen heraus.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILTIN_BOTS, DEFAULTS, generateMap, getBuiltinBot, simulate, type BotFunction } from "@/lib/game";

const args: Record<string, string> = {};
process.argv.slice(2).forEach((arg, index, all) => {
  if (arg.startsWith("--")) args[arg.slice(2)] = all[index + 1] ?? "";
});

async function load(spec: string): Promise<{ name: string; play: BotFunction }> {
  const builtin = getBuiltinBot(spec);
  if (builtin) return { name: builtin.id, play: builtin.play };
  if (!/[./\\]/.test(spec)) {
    throw new Error(`Den eingebauten Bot "${spec}" gibt es nicht. Vorhanden: ${BUILTIN_BOTS.map((bot) => bot.id).join(", ")}.`);
  }
  const loaded = (await import(pathToFileURL(resolve(spec)).href)) as { default?: unknown };
  if (typeof loaded.default !== "function") throw new Error(`${spec} braucht eine Funktion als Standard-Export.`);
  return { name: spec, play: loaded.default as BotFunction };
}

function intArg(name: string, fallback: number): number {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} muss eine ganze Zahl ab 0 sein.`);
  return value;
}

const percent = (part: number, whole: number) => `${((100 * part) / Math.max(1, whole)).toFixed(1)} %`;

async function main() {
  const a = await load(args.a || "standard");
  const b = await load(args.b || "sturm");
  const maps = intArg("karten", 200);
  const first = intArg("seed", 1);
  const planets = intArg("planeten", DEFAULTS.planets);
  const rounds = intArg("runden", DEFAULTS.rounds);

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let games = 0;
  let totalRounds = 0;
  let early = 0;
  let leadChanges = 0;
  let rejected = 0;
  let slowest = 0;
  const reasons: Record<string, number> = {};
  const started = Date.now();

  for (let seed = first; seed < first + maps; seed++) {
    const map = generateMap({ seed, planets });
    for (const swapped of [false, true]) {
      const timed = (play: BotFunction): BotFunction => (view) => {
        const before = performance.now();
        const actions = play(view);
        slowest = Math.max(slowest, performance.now() - before);
        return actions;
      };
      const bots: [BotFunction, BotFunction] = swapped ? [timed(b.play), timed(a.play)] : [timed(a.play), timed(b.play)];
      const { frames, result } = simulate({ map, bots, rounds });
      games += 1;
      if (result.winner === null) draws += 1;
      else if ((result.winner === 0) !== swapped) winsA += 1;
      else winsB += 1;
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      const played = frames.length - 1;
      totalRounds += played;
      if (played < rounds) early += 1;
      // Wechselt nach Runde 30 die Führung nach Punkten?
      let leader = 0;
      let changed = false;
      for (const frame of frames) {
        const lead = Math.sign(frame.players[0].score - frame.players[1].score);
        if (lead !== 0 && leader !== 0 && lead !== leader && frame.round > 30) changed = true;
        if (lead !== 0) leader = lead;
        for (const records of frame.actions) rejected += records.filter((record) => !record.ok).length;
      }
      if (changed) leadChanges += 1;
    }
  }

  console.log(`${a.name} gegen ${b.name}: ${games} Spiele auf ${maps} Karten (Seeds ${first} bis ${first + maps - 1}), ${planets} Planeten, ${rounds} Runden`);
  console.log(`  Siege ${a.name}: ${winsA} (${percent(winsA, games)})`);
  console.log(`  Siege ${b.name}: ${winsB} (${percent(winsB, games)})`);
  console.log(`  Unentschieden: ${draws} (${percent(draws, games)})`);
  console.log(`  Ende durch: ${Object.entries(reasons).map(([reason, count]) => `${reason} ${count}`).join(", ")}`);
  console.log(`  Länge: im Schnitt ${(totalRounds / games).toFixed(1)} Runden, vor der letzten Runde beendet: ${percent(early, games)}`);
  console.log(`  Führungswechsel nach Runde 30: ${percent(leadChanges, games)} der Spiele`);
  console.log(`  Abgelehnte Aktionen: ${rejected}`);
  console.log(`  Längste Rechenzeit eines Zugs: ${slowest.toFixed(1)} ms, Laufzeit gesamt ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((error: Error) => {
  console.error(`Abbruch: ${error.message}`);
  process.exit(1);
});

const REPO_DOCS = "https://github.com/Samuelpog/match-server/blob/main/docs/API.md";

function common(base: string): string {
  return [
    "Regeln und alle Endpunkte: " + REPO_DOCS,
    "Vorlage für einen Bot ohne Abhängigkeiten: examples/bot.mjs im selben Repository.",
    "",
    "Wichtig:",
    "- Fairness-Regel: Ein Bot ruft nur health, join, state, orders und me auf. Der Zuschauer-Strom (replay) und die Match-Liste sind für Menschen.",
    "- Token nur im Kopf senden: Authorization: Bearer <token>",
    "- Je Runde zählt die erste Einreichung. Aktionen immer mit der Runde aus dem zuletzt gelesenen Stand.",
    "- Je Runde gelten höchstens state.actions.limit Aktionen. Eine Flotte fliegt nur über eine Route zum Nachbarn.",
    "- Die Regel-Kennung steht in state.rules, alle Zahlenwerte in state.params.",
    "- Der Server schläft nach 15 Minuten Ruhe. Vor dem Start GET " + base + "/api/health aufrufen und bei Zeitüberschreitung wiederholen.",
    "- Hinter einem HTTPS-Proxy braucht Node die Variable NODE_USE_ENV_PROXY=1, sonst scheitert fetch.",
  ].join("\n");
}

/** Auftragstext für einen Bot, der einem einzelnen Match beitreten soll. */
export function matchBriefing(base: string, matchId: string): string {
  const url = `${base}/api/matches/${matchId}`;
  return [
    `Planet Wars: tritt dem Match ${matchId} bei und spiele es zu Ende.`,
    "",
    `1. POST ${url}/join mit Body {"name": "<dein Name>"}. Die Antwort enthält "seat" und "token".`,
    `2. GET ${url}/state?wait=25 liefert den Stand, sobald du am Zug bist.`,
    `3. POST ${url}/orders?wait=25 mit Body {"round": <state.round>, "actions": [{"type": "move", "from": 0, "to": 5, "ships": 20}]}.`,
    '   Die Antwort enthält unter "state" schon den nächsten Stand. Weiter bei 3, bis state.match.status nicht mehr "running" ist.',
    `Zuschauen: ${base}/m/${matchId}`,
    "",
    common(base),
  ].join("\n");
}

/** Auftragstext für einen Bot, der einer Serie beitreten soll. */
export function seriesBriefing(base: string, seriesId: string): string {
  const url = `${base}/api/series/${seriesId}`;
  return [
    `Planet Wars: tritt der Serie ${seriesId} bei und spiele alle Matches darin.`,
    "",
    `1. POST ${url}/join mit Body {"name": "<dein Name>"}. Die Antwort enthält "slot" und "token". Das Token gilt für die ganze Serie.`,
    `2. GET ${url}/me?wait=25&after=<zuletzt gespieltes Match> nennt unter "current" das nächste Match und deinen Sitz darin.`,
    "   Beim ersten Mal after leer lassen. Bei Status 204 erneut fragen.",
    `3. Das Match spielen: GET ${base}/api/matches/<matchId>/state?wait=25, dann POST ${base}/api/matches/<matchId>/orders?wait=25`,
    '   mit Body {"round": <state.round>, "actions": [...]}, bis state.match.status nicht mehr "running" ist.',
    '4. Zurück zu 2, bis series.status "finished" oder "aborted" ist. Dein Sitz wechselt von Spiel zu Spiel.',
    "",
    common(base),
  ].join("\n");
}

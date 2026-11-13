/** Fehler, der eins zu eins als HTTP-Antwort an den Client geht. */
export class ArenaError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Zusätzliche Felder für die Antwort, etwa die aktuelle Runde. */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ArenaError";
  }
}

export const errors = {
  badRequest: (message: string) => new ArenaError(400, "bad_request", message),
  arenaKey: () => new ArenaError(401, "arena_key_required", "Dafür fehlt der richtige Arena-Schlüssel im Kopf X-Arena-Key."),
  unauthorized: () => new ArenaError(401, "unauthorized", "Das Token fehlt oder passt nicht."),
  matchNotFound: () =>
    new ArenaError(404, "match_not_found", "Dieses Match kennt der Server nicht (mehr). Nach einem Neustart sind alle Matches weg."),
  seriesNotFound: () =>
    new ArenaError(404, "series_not_found", "Diese Serie kennt der Server nicht (mehr). Nach einem Neustart sind alle Serien weg."),
  unknownBot: (id: string) => new ArenaError(400, "unknown_bot", `Den eingebauten Bot "${id}" gibt es nicht.`),
  full: () => new ArenaError(409, "match_full", "Alle Plätze sind schon besetzt."),
  notRunning: (status: string) =>
    new ArenaError(409, "match_not_running", `Befehle sind nur in einem laufenden Match möglich (Status: ${status}).`),
  staleRound: (given: number, current: number) =>
    new ArenaError(409, "stale_round", `Die Aktionen gelten für Runde ${given}, aktuell ist Runde ${current}. Stand neu holen.`, {
      round: current,
    }),
  alreadySubmitted: (round: number) =>
    new ArenaError(409, "already_submitted", `Für Runde ${round} hast du schon eingereicht. Je Runde zählt die erste Einreichung.`, {
      round,
    }),
  tooLate: (round: number) =>
    new ArenaError(409, "too_late", `Die Frist für Runde ${round} ist vorbei. Stand neu holen.`, { round }),
  alreadyOver: (status: string) => new ArenaError(409, "already_over", `Das geht nicht mehr (Status: ${status}).`),
  busy: (limit: number) =>
    new ArenaError(429, "arena_busy", `Es laufen schon ${limit} Matches. Bitte warten, bis eines endet, oder eines abbrechen.`),
  tooLarge: () => new ArenaError(413, "body_too_large", "Der Body ist zu groß."),
};

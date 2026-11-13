/** Fehler, der eins zu eins als HTTP-Antwort an den Client geht. */
export class MatchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MatchError";
  }
}

export const errors = {
  notFound: () => new MatchError(404, "match_not_found", "Dieses Match gibt es nicht oder es ist abgelaufen."),
  unknownGame: (id: string) => new MatchError(400, "unknown_game", `Das Spiel "${id}" ist nicht registriert.`),
  full: () => new MatchError(409, "match_full", "Alle Sitzplätze sind schon besetzt."),
  unauthorized: () => new MatchError(401, "unauthorized", "Spieler-Token fehlt oder passt nicht zu diesem Match."),
  createKey: () => new MatchError(401, "create_key_required", "Zum Anlegen eines Matches fehlt der richtige Schlüssel."),
  notRunning: (status: string) =>
    new MatchError(409, "match_not_running", `Züge sind nur in einem laufenden Match möglich (Status: ${status}).`),
  notYourTurn: () => new MatchError(409, "not_your_turn", "Der andere Spieler ist am Zug."),
  invalidMove: (message: string) => new MatchError(422, "invalid_move", message),
  badRequest: (message: string) => new MatchError(400, "bad_request", message),
  conflict: () =>
    new MatchError(409, "write_conflict", "Das Match wurde gleichzeitig geändert. Bitte Stand neu holen und noch einmal senden."),
};

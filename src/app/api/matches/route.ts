import { timingSafeEqual } from "node:crypto";
import { bearer, handle, json, readBody } from "@/lib/http";
import { errors } from "@/lib/match/errors";
import { createMatch, getPublicView } from "@/lib/match/service";
import { getStore } from "@/lib/match/store";

function checkCreateKey(given: string | null) {
  const expected = process.env.CREATE_KEY;
  if (!expected) return;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw errors.createKey();
}

/** Legt ein Match an. Body: `{ "game"?: string }`. */
export function POST(request: Request) {
  return handle(async () => {
    checkCreateKey(bearer(request));
    const body = await readBody(request);
    if (body.game !== undefined && typeof body.game !== "string") {
      throw errors.badRequest('"game" muss ein Text sein.');
    }
    const store = getStore();
    const record = await createMatch(store, body.game);
    return json(
      {
        match: await getPublicView(store, record.id),
        links: { watch: `/m/${record.id}`, api: `/api/matches/${record.id}` },
      },
      201,
    );
  });
}

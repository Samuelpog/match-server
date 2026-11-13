import { Redis } from "@upstash/redis";
import type { MatchRecord } from "./types";

/** Ein Match verschwindet 24 Stunden nach der letzten Änderung. */
export const MATCH_TTL_SECONDS = 60 * 60 * 24;
const PRESENCE_TTL_SECONDS = 120;

export interface MatchStore {
  readonly kind: "memory" | "redis";
  get(id: string): Promise<MatchRecord | null>;
  /** Legt ein neues Match an. `false`, wenn die ID schon vergeben ist. */
  create(record: MatchRecord): Promise<boolean>;
  /**
   * Speichert nur, wenn die gespeicherte Version noch `expectedVersion` ist.
   * So können zwei gleichzeitige Aufrufe einander nicht überschreiben.
   */
  update(record: MatchRecord, expectedVersion: number): Promise<boolean>;
  /** Merkt sich, wann sich ein Spieler zuletzt gemeldet hat. */
  touch(id: string, seat: number, at: number): Promise<void>;
  presence(id: string, seats: number): Promise<(number | null)[]>;
}

/**
 * Speicher im Arbeitsspeicher für Tests und lokale Entwicklung. Auf Vercel
 * taugt er nicht: jede Funktionsinstanz hätte ihren eigenen Stand.
 */
export class MemoryStore implements MatchStore {
  readonly kind = "memory" as const;
  private matches = new Map<string, string>();
  private seen = new Map<string, number>();

  async get(id: string) {
    const raw = this.matches.get(id);
    return raw ? (JSON.parse(raw) as MatchRecord) : null;
  }

  async create(record: MatchRecord) {
    if (this.matches.has(record.id)) return false;
    this.matches.set(record.id, JSON.stringify(record));
    return true;
  }

  async update(record: MatchRecord, expectedVersion: number) {
    const raw = this.matches.get(record.id);
    if (!raw || (JSON.parse(raw) as MatchRecord).version !== expectedVersion) return false;
    this.matches.set(record.id, JSON.stringify(record));
    return true;
  }

  async touch(id: string, seat: number, at: number) {
    this.seen.set(`${id}:${seat}`, at);
  }

  async presence(id: string, seats: number) {
    return Array.from({ length: seats }, (_, seat) => this.seen.get(`${id}:${seat}`) ?? null);
  }
}

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'version', ARGV[1], 'data', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`;

const UPDATE_SCRIPT = `
if redis.call('HGET', KEYS[1], 'version') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'version', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;

/** Dauerhafter Speicher über die REST-Schnittstelle von Upstash Redis. */
export class RedisStore implements MatchStore {
  readonly kind = "redis" as const;

  constructor(private readonly redis: Redis) {}

  private key(id: string) {
    return `match:${id}`;
  }

  private seenKey(id: string, seat: number) {
    return `seen:${id}:${seat}`;
  }

  async get(id: string) {
    const raw = await this.redis.hget<string>(this.key(id), "data");
    return raw ? (JSON.parse(raw) as MatchRecord) : null;
  }

  async create(record: MatchRecord) {
    const written = await this.redis.eval(
      CREATE_SCRIPT,
      [this.key(record.id)],
      [String(record.version), JSON.stringify(record), String(MATCH_TTL_SECONDS)],
    );
    return Number(written) === 1;
  }

  async update(record: MatchRecord, expectedVersion: number) {
    const written = await this.redis.eval(
      UPDATE_SCRIPT,
      [this.key(record.id)],
      [String(expectedVersion), String(record.version), JSON.stringify(record), String(MATCH_TTL_SECONDS)],
    );
    return Number(written) === 1;
  }

  async touch(id: string, seat: number, at: number) {
    await this.redis.set(this.seenKey(id, seat), String(at), { ex: PRESENCE_TTL_SECONDS });
  }

  async presence(id: string, seats: number) {
    if (seats === 0) return [];
    const keys = Array.from({ length: seats }, (_, seat) => this.seenKey(id, seat));
    const values = await this.redis.mget<(string | null)[]>(...keys);
    return values.map((value) => (value === null ? null : Number(value)));
  }
}

const globalStore = globalThis as typeof globalThis & { __matchStore?: MatchStore };

/**
 * Nimmt Redis, sobald die Zugangsdaten gesetzt sind (die Upstash-Integration
 * von Vercel setzt sie automatisch), sonst den Speicher im Arbeitsspeicher.
 */
export function getStore(): MatchStore {
  if (globalStore.__matchStore) return globalStore.__matchStore;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  globalStore.__matchStore =
    url && token
      ? new RedisStore(new Redis({ url, token, automaticDeserialization: false }))
      : new MemoryStore();
  return globalStore.__matchStore;
}

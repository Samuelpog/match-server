import { ReplayBuffer } from "./buffer";
import { isOver, type ArenaMap, type Frame, type MatchMeta } from "./model";

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

/** Tick-Dauer, falls der Server keine nennt. */
const DEFAULT_TICK_MS = 400;
/** Ab diesem Rückstand springt die Live-Ansicht, statt aufzuholen. */
const SNAP_LAG = 6;

export interface PlaybackState {
  /** Ganzer Tick unter dem Abspielkopf. */
  tick: number;
  lastTick: number;
  playing: boolean;
  /** Der Abspielkopf folgt dem neuesten Frame. */
  following: boolean;
  speed: number;
  /** Der Abspielkopf steht auf dem letzten Frame eines beendeten Matches. */
  atEnd: boolean;
}

type Listener = () => void;

/**
 * Hält Daten und Abspielkopf eines Matches zusammen. Die Zeichenfläche fragt
 * in jedem Bild `pos` ab; die Anzeigen drumherum hören auf `subscribe` und
 * werden nur benachrichtigt, wenn sich für sie etwas ändert (neuer Tick,
 * neuer Frame, Start, Pause), nicht in jedem Bild.
 */
export class ArenaController {
  readonly buffer: ReplayBuffer;
  /** Position des Abspielkopfs in Ticks, mit Nachkommastellen. */
  pos = 0;

  private metaValue: MatchMeta;
  private playing = true;
  private following: boolean;
  private speed = 1;
  private lastNow: number | null = null;
  /** Gemessener Abstand zwischen zwei Frames im laufenden Match. */
  private liveTickMs: number;
  private lastArrival: number | null = null;
  private listeners = new Set<Listener>();
  private frameListeners = new Set<(pos: number) => void>();
  private snapshot: PlaybackState;
  private metaVersion = 0;
  private paceMs: number | null = null;
  private paceCount = 0;

  constructor(map: ArenaMap, meta: MatchMeta) {
    this.buffer = new ReplayBuffer(map);
    this.metaValue = meta;
    // Ein laufendes Match beginnt live, ein beendetes als Replay von vorn.
    this.following = !isOver(meta.status);
    this.liveTickMs = meta.tickMs > 0 ? meta.tickMs : DEFAULT_TICK_MS;
    this.snapshot = this.compute();
  }

  get meta(): MatchMeta {
    return this.metaValue;
  }

  /** Zählt hoch, sobald sich `meta` ändert. Für `useSyncExternalStore`. */
  getMetaVersion = (): number => this.metaVersion;

  private get over(): boolean {
    return isOver(this.metaValue.status);
  }

  /**
   * Dauer eines Ticks beim Abspielen mit Tempo 1. Gemessen am echten Verlauf
   * (`at` der Frames), damit ein Replay so schnell läuft wie das Match selbst.
   * Der Median hält einzelne lange Fristen aus dem Wert heraus.
   */
  get tickMs(): number {
    const frames = this.buffer.frames;
    if (this.paceCount !== frames.length && (this.paceCount === 0 || frames.length - this.paceCount >= 20 || this.over)) {
      this.paceCount = frames.length;
      const gaps: number[] = [];
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1].at;
        const b = frames[i].at;
        if (a !== undefined && b !== undefined && b > a) gaps.push(b - a);
      }
      gaps.sort((x, y) => x - y);
      this.paceMs = gaps.length >= 3 ? Math.min(1500, Math.max(60, gaps[gaps.length >> 1])) : null;
    }
    if (this.paceMs !== null) return this.paceMs;
    return this.metaValue.tickMs > 0 ? this.metaValue.tickMs : DEFAULT_TICK_MS;
  }

  setMeta(meta: MatchMeta): void {
    this.metaValue = meta;
    this.metaVersion += 1;
    this.emit(true);
  }

  /** Nimmt neue Frames auf. `false`: es fehlt ein Tick, der Aufrufer muss neu holen. */
  append(frames: Frame[], now: number = performance.now()): boolean {
    const before = this.buffer.lastTick;
    for (const frame of frames) {
      if (!this.buffer.append(frame)) return false;
    }
    const added = this.buffer.lastTick - before;
    if (added <= 0) return true;

    // Nur einzelne, frisch eingetroffene Frames sagen etwas über den Takt.
    if (added === 1 && before >= 0 && this.lastArrival !== null) {
      const interval = now - this.lastArrival;
      if (interval > 30 && interval < 10_000) this.liveTickMs = this.liveTickMs * 0.7 + interval * 0.3;
    }
    this.lastArrival = now;

    if (this.following && this.buffer.lastTick - this.pos > SNAP_LAG) {
      this.pos = Math.max(0, this.buffer.lastTick - 1);
    }
    this.emit(true);
    return true;
  }

  /** Rückt den Abspielkopf vor. Wird einmal je Bild mit der aktuellen Zeit aufgerufen. */
  advance(now: number): void {
    const elapsed = this.lastNow === null ? 0 : Math.min(250, now - this.lastNow);
    this.lastNow = now;
    const head = this.buffer.lastTick;
    if (!this.playing || head < 0 || elapsed <= 0) return;

    if (this.following) {
      // Nach einer Pause des Browsers (Tab im Hintergrund) nicht alles nachspielen.
      if (head - this.pos > SNAP_LAG) this.pos = Math.max(0, head - 1);
      const lag = head - this.pos;
      // Etwas schneller, wenn Frames dichter kommen als gedacht, damit kein Rückstand wächst.
      const rate = lag > 2 ? 2 : lag > 1.15 ? 1.2 : 1;
      this.pos = Math.min(head, this.pos + (elapsed / this.liveTickMs) * rate);
      // Das Match ist zu Ende und der letzte Frame erreicht: es gibt nichts mehr zu verfolgen.
      if (this.over && this.pos >= head) {
        this.playing = false;
        this.following = false;
      }
    } else {
      this.pos += (elapsed / this.tickMs) * this.speed;
      if (this.pos >= head) {
        this.pos = head;
        if (this.over) this.playing = false;
        else this.following = true;
      }
    }
    this.emit(false);
  }

  play(): void {
    if (this.playing) return;
    // Am Ende eines beendeten Matches heißt „Abspielen": noch einmal von vorn.
    if (this.over && this.pos >= this.buffer.lastTick) this.pos = 0;
    this.playing = true;
    this.lastNow = null;
    this.emit(true);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.following = false;
    this.emit(true);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Springt an eine Position. Verlässt die Live-Verfolgung, das Abspielen läuft weiter wie zuvor. */
  seek(pos: number): void {
    this.pos = Math.min(Math.max(0, pos), Math.max(0, this.buffer.lastTick));
    this.following = false;
    this.emit(true);
  }

  /** Einen Tick vor oder zurück, hält dabei an. */
  step(delta: number): void {
    this.playing = false;
    this.seek(Math.floor(this.pos + 1e-6) + delta);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    // Im Live-Betrieb gibt es nur ein Tempo. Wer es ändert, will den Verlauf ansehen.
    if (speed !== 1) this.following = false;
    this.emit(true);
  }

  /** Zurück zum neuesten Frame. Bei einem beendeten Match: ans Ende. */
  goLive(): void {
    const head = Math.max(0, this.buffer.lastTick);
    if (this.over) {
      this.pos = head;
      this.playing = false;
      this.following = false;
    } else {
      this.pos = Math.max(0, head - 1);
      this.following = true;
      this.playing = true;
      this.speed = 1;
      this.lastNow = null;
    }
    this.emit(true);
  }

  /**
   * Meldet jede Bewegung des Abspielkopfs, also bis zu einmal je Bild. Nur für
   * Dinge, die sich ohne Neuzeichnen durch React bewegen (Marke der Zeitleiste).
   */
  onFrame(listener: (pos: number) => void): () => void {
    this.frameListeners.add(listener);
    listener(this.pos);
    return () => this.frameListeners.delete(listener);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): PlaybackState => this.snapshot;

  private compute(): PlaybackState {
    const lastTick = this.buffer.lastTick;
    const tick = Math.max(0, Math.min(lastTick, Math.floor(this.pos + 1e-6)));
    return {
      tick,
      lastTick,
      playing: this.playing,
      following: this.following,
      speed: this.speed,
      atEnd: this.over && lastTick >= 0 && this.pos >= lastTick,
    };
  }

  /** Benachrichtigt die Zuhörer, wenn sich der sichtbare Zustand geändert hat (oder `force`). */
  private emit(force: boolean): void {
    const next = this.compute();
    const previous = this.snapshot;
    const changed =
      next.tick !== previous.tick ||
      next.lastTick !== previous.lastTick ||
      next.playing !== previous.playing ||
      next.following !== previous.following ||
      next.speed !== previous.speed ||
      next.atEnd !== previous.atEnd;
    if (changed) this.snapshot = next;
    for (const listener of this.frameListeners) listener(this.pos);
    if (changed || force) for (const listener of this.listeners) listener();
  }
}

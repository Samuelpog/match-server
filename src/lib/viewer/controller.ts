import { ReplayBuffer } from "./buffer";
import { isOver, type ArenaMap, type Frame, type MatchMeta } from "./model";

export const SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;

/**
 * Dauer einer Runde beim Abspielen mit Tempo 1. Ein Replay läuft in diesem
 * festen Schautempo, egal wie schnell das Match gespielt wurde.
 */
export const VIEW_ROUND_MS = 1500;
/** Länger dauert die Auflösung einer Runde auch live nicht. Danach steht das Bild, bis die nächste Runde kommt. */
const MAX_LIVE_ROUND_MS = 2500;
/** Ab diesem Rückstand springt die Live-Ansicht, statt aufzuholen. */
const SNAP_LAG = 6;

export interface PlaybackState {
  /** Letzte vollständig gezeigte Runde: der Stand unter dem Abspielkopf. */
  round: number;
  /** Die Runde, deren Auflösung gerade läuft. Gleich `round`, wenn das Bild steht. */
  showing: number;
  lastRound: number;
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
 * werden nur benachrichtigt, wenn sich für sie etwas ändert (neue Runde,
 * neuer Frame, Start, Pause), nicht in jedem Bild.
 */
export class ArenaController {
  readonly buffer: ReplayBuffer;
  /**
   * Position des Abspielkopfs in Runden. Eine ganze Zahl `r` ist der Stand
   * nach Runde `r`; dazwischen läuft die Auflösung der Runde `r + 1`.
   */
  pos = 0;

  private metaValue: MatchMeta;
  private playing = true;
  private following: boolean;
  private speed = 1;
  private lastNow: number | null = null;
  /** Gemessener Abstand zwischen zwei Frames im laufenden Match. */
  private liveRoundMs: number;
  private lastArrival: number | null = null;
  private listeners = new Set<Listener>();
  private frameListeners = new Set<(pos: number) => void>();
  private snapshot: PlaybackState;
  private metaVersion = 0;

  constructor(map: ArenaMap, meta: MatchMeta) {
    this.buffer = new ReplayBuffer(map, meta.params);
    this.metaValue = meta;
    // Ein laufendes Match beginnt live, ein beendetes als Replay von vorn.
    this.following = !isOver(meta.status);
    this.liveRoundMs = meta.roundMs > 0 ? meta.roundMs : VIEW_ROUND_MS;
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
   * Dauer, über die eine Runde gerade gezeigt wird, in Millisekunden. Live
   * richtet sie sich nach dem Takt des Matches, im Replay nach dem Tempo.
   */
  get roundViewMs(): number {
    if (this.following) return Math.min(MAX_LIVE_ROUND_MS, this.liveRoundMs);
    return VIEW_ROUND_MS / this.speed;
  }

  setMeta(meta: MatchMeta): void {
    this.metaValue = meta;
    this.metaVersion += 1;
    this.emit(true);
  }

  /** Nimmt neue Frames auf. `false`: es fehlt eine Runde, der Aufrufer muss neu holen. */
  append(frames: Frame[], now: number = performance.now()): boolean {
    const before = this.buffer.lastRound;
    for (const frame of frames) {
      if (!this.buffer.append(frame)) return false;
    }
    const added = this.buffer.lastRound - before;
    if (added <= 0) return true;

    // Nur einzelne, frisch eingetroffene Frames sagen etwas über den Takt.
    if (added === 1 && before >= 0 && this.lastArrival !== null) {
      const interval = now - this.lastArrival;
      if (interval > 30 && interval < 15_000) this.liveRoundMs = this.liveRoundMs * 0.6 + interval * 0.4;
    }
    this.lastArrival = now;

    if (this.following && this.buffer.lastRound - this.pos > SNAP_LAG) {
      this.pos = Math.max(0, this.buffer.lastRound - 1);
    }
    this.emit(true);
    return true;
  }

  /** Rückt den Abspielkopf vor. Wird einmal je Bild mit der aktuellen Zeit aufgerufen. */
  advance(now: number): void {
    const elapsed = this.lastNow === null ? 0 : Math.min(250, now - this.lastNow);
    this.lastNow = now;
    const head = this.buffer.lastRound;
    if (!this.playing || head < 0 || elapsed <= 0) return;

    if (this.following) {
      // Nach einer Pause des Browsers (Tab im Hintergrund) nicht alles nachspielen.
      if (head - this.pos > SNAP_LAG) this.pos = Math.max(0, head - 1);
      const lag = head - this.pos;
      // Etwas schneller, wenn Frames dichter kommen als gedacht, damit kein Rückstand wächst.
      const rate = lag > 2 ? 2 : lag > 1.15 ? 1.2 : 1;
      this.pos = Math.min(head, this.pos + (elapsed / Math.min(MAX_LIVE_ROUND_MS, this.liveRoundMs)) * rate);
      // Das Match ist zu Ende und der letzte Frame erreicht: es gibt nichts mehr zu verfolgen.
      if (this.over && this.pos >= head) {
        this.playing = false;
        this.following = false;
      }
    } else {
      this.pos += (elapsed / VIEW_ROUND_MS) * this.speed;
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
    if (this.over && this.pos >= this.buffer.lastRound) this.pos = 0;
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
    this.pos = Math.min(Math.max(0, pos), Math.max(0, this.buffer.lastRound));
    this.following = false;
    this.emit(true);
  }

  /**
   * Eine Runde vor oder zurück, hält dabei an. Mitten in einer Auflösung geht
   * „zurück" an deren Anfang und „vor" an deren Ende.
   */
  step(delta: number): void {
    this.playing = false;
    const whole = Math.abs(this.pos - Math.round(this.pos)) < 1e-6;
    const base = whole ? Math.round(this.pos) : delta > 0 ? Math.floor(this.pos) : Math.ceil(this.pos);
    this.seek(base + delta);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    // Im Live-Betrieb gibt es nur ein Tempo. Wer es ändert, will den Verlauf ansehen.
    if (speed !== 1) this.following = false;
    this.emit(true);
  }

  /** Zurück zum neuesten Frame. Bei einem beendeten Match: ans Ende. */
  goLive(): void {
    const head = Math.max(0, this.buffer.lastRound);
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
    const lastRound = this.buffer.lastRound;
    const round = Math.max(0, Math.min(lastRound, Math.floor(this.pos + 1e-6)));
    const showing = Math.max(0, Math.min(lastRound, Math.ceil(this.pos - 1e-6)));
    return {
      round,
      showing,
      lastRound,
      playing: this.playing,
      following: this.following,
      speed: this.speed,
      atEnd: this.over && lastRound >= 0 && this.pos >= lastRound,
    };
  }

  /** Benachrichtigt die Zuhörer, wenn sich der sichtbare Zustand geändert hat (oder `force`). */
  private emit(force: boolean): void {
    const next = this.compute();
    const previous = this.snapshot;
    const changed =
      next.round !== previous.round ||
      next.showing !== previous.showing ||
      next.lastRound !== previous.lastRound ||
      next.playing !== previous.playing ||
      next.following !== previous.following ||
      next.speed !== previous.speed ||
      next.atEnd !== previous.atEnd;
    if (changed) this.snapshot = next;
    for (const listener of this.frameListeners) listener(this.pos);
    if (changed || force) for (const listener of this.listeners) listener();
  }
}

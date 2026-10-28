import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  MAX_ENTRIES,
  cleanLabel,
  createEntries,
  createId,
  ensureBallNumbers,
  replaceLabels,
  type Entry,
} from '../domain/entries';
import { decideDraw, type DrawPlan } from '../domain/draw';
import { SAMPLE_LABELS } from './sampleEntries';
import layout from '../scene/bingoLayout.json';

const LAYOUT_RACK = layout.rack;

export interface DrawResult {
  readonly id: string;
  readonly entryId: string;
  readonly ball: number;
  readonly label: string;
  readonly at: number;
}

export interface ActiveDraw {
  readonly plan: DrawPlan;
  readonly winner: Entry;
  /** `performance.now()` when the draw started. */
  readonly startedAt: number;
}

export interface Notice {
  readonly id: number;
  readonly text: string;
}

interface PersistedState {
  entries: Entry[];
  history: DrawResult[];
  sound: boolean;
  /** Background music, independent of the machine sounds. */
  music: boolean;
}

export interface BingoState extends PersistedState {
  draw: ActiveDraw | null;
  /** Result on show; its ball sits in the tray until the next draw. */
  lastResult: DrawResult | null;
  notice: Notice | null;
  /**
   * New options waiting in the ball rack, already numbered (around the balls
   * in the cage too). They go into the cage one by one as the rack tips them in.
   * There may be more than the rack has cups (`RACK_SLOTS`): the first ones
   * sit in the cups and the rack tips itself into the cage to make room.
   */
  pending: Entry[];

  addPending: (labels: readonly string[]) => number;
  removePending: (id: string) => void;
  /** Moves one waiting ball into the cage (called as it lands there). */
  commitPending: (id: string) => void;
  addEntries: (labels: readonly string[]) => number;
  updateEntry: (id: string, label: string) => void;
  removeEntry: (id: string) => void;
  replaceAll: (labels: readonly string[]) => void;
  /** Drops the sample options into the ball rack, for a first try. */
  addSample: () => number;
  clearEntries: () => void;

  startDraw: (options?: { reducedMotion?: boolean; hand?: boolean }) => boolean;
  completeDraw: () => void;
  dismissResult: () => void;
  removeWinner: () => void;
  clearHistory: () => void;
  setSound: (on: boolean) => void;
  setMusic: (on: boolean) => void;
}

export const HISTORY_LIMIT = 50;
/** Cups in the ball rack (bingoLayout.json: tiers × perTier). */
export const RACK_SLOTS = LAYOUT_RACK.tiers * LAYOUT_RACK.perTier;

let drawTimer: ReturnType<typeof setTimeout> | undefined;
let noticeId = 0;
const notice = (text: string): Notice => ({ id: ++noticeId, text });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** localStorage that never throws (private mode, blocked storage, tests). */
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable or full: keep working in memory */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export function sanitizePersisted(raw: unknown): Partial<PersistedState> {
  if (!isObject(raw)) return {};
  const out: Partial<PersistedState> = {};
  if (Array.isArray(raw.entries)) {
    const rows = raw.entries
      .filter((e): e is { id: string; label: string; ball?: unknown } =>
        isObject(e) && typeof e.id === 'string' && typeof e.label === 'string')
      .map((e) => ({ id: e.id, label: cleanLabel(e.label), ball: e.ball }))
      .filter((e) => e.label.length > 0)
      .slice(0, MAX_ENTRIES);
    out.entries = ensureBallNumbers(rows);
  }
  if (Array.isArray(raw.history)) {
    out.history = raw.history
      .filter((r): r is DrawResult =>
        isObject(r) &&
        typeof r.id === 'string' &&
        typeof r.entryId === 'string' &&
        typeof r.label === 'string' &&
        typeof r.at === 'number' &&
        typeof r.ball === 'number')
      .slice(0, HISTORY_LIMIT);
  }
  if (typeof raw.sound === 'boolean') out.sound = raw.sound;
  if (typeof raw.music === 'boolean') out.music = raw.music;
  return out;
}

export const useBingoStore = create<BingoState>()(
  persist(
    (set, get) => ({
      // A first visit starts with an empty cage: options go in through the rack.
      entries: [],
      history: [],
      sound: true,
      music: true,
      draw: null,
      lastResult: null,
      notice: null,
      pending: [],

      addPending: (labels) => {
        const { entries, pending } = get();
        const room = MAX_ENTRIES - entries.length - pending.length;
        const clean = labels.map(cleanLabel).filter(Boolean);
        const take = clean.slice(0, Math.max(0, room));
        if (take.length === 0) {
          if (clean.length > 0) set({ notice: notice(`El bombo admite como máximo ${MAX_ENTRIES} bolas.`) });
          return 0;
        }
        const added = createEntries(take, [...entries, ...pending]);
        const left = clean.length - take.length;
        set({
          pending: [...pending, ...added],
          notice: notice(
            left > 0
              ? `El bombo admite como máximo ${MAX_ENTRIES} bolas: ${plural(left, 'opción se ha quedado', 'opciones se han quedado')} fuera`
              : added.length === 1
                ? `Bola ${added[0]!.ball} al portabolas: ${added[0]!.label}`
                : `${plural(added.length, 'bola', 'bolas')} al portabolas`,
          ),
        });
        return added.length;
      },

      removePending: (id) => set((s) => ({ pending: s.pending.filter((e) => e.id !== id) })),

      commitPending: (id) => {
        const { pending, entries } = get();
        const entry = pending.find((e) => e.id === id);
        if (!entry) return;
        const room = entries.length < MAX_ENTRIES;
        // Numbers were handed out with the cage as it was; keep them unique if it changed since.
        const ball = entries.some((e) => e.ball === entry.ball) ? createEntries([entry.label], entries)[0]!.ball : entry.ball;
        set({
          pending: pending.filter((e) => e.id !== id),
          entries: room ? [...entries, { ...entry, ball }] : entries,
        });
      },

      addEntries: (labels) => {
        const { draw, entries } = get();
        if (draw) return 0;
        const room = MAX_ENTRIES - entries.length;
        const clean = labels.map(cleanLabel).filter(Boolean).slice(0, Math.max(0, room));
        if (clean.length === 0) {
          if (room <= 0) set({ notice: notice(`El bombo admite como máximo ${MAX_ENTRIES} bolas.`) });
          return 0;
        }
        const added = createEntries(clean, entries);
        set({
          entries: [...entries, ...added],
          notice: notice(
            added.length === 1
              ? `Bola ${added[0]!.ball}: ${added[0]!.label}`
              : `${plural(added.length, 'bola añadida', 'bolas añadidas')} al bombo`,
          ),
        });
        return added.length;
      },

      updateEntry: (id, label) => {
        const clean = cleanLabel(label);
        if (get().draw || !clean) return;
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, label: clean } : e)) }));
      },

      removeEntry: (id) => {
        const { draw, entries, lastResult } = get();
        if (draw) return;
        const removed = entries.find((e) => e.id === id);
        if (!removed) return;
        set({
          entries: entries.filter((e) => e.id !== id),
          lastResult: lastResult?.entryId === id ? null : lastResult,
          notice: notice(`Bola ${removed.ball} retirada: ${removed.label}`),
        });
      },

      replaceAll: (labels) => {
        if (get().draw) return;
        const clean = labels.map(cleanLabel).filter(Boolean).slice(0, MAX_ENTRIES);
        set((s) => {
          const entries = replaceLabels(s.entries, clean);
          const keepResult = s.lastResult && entries.some((e) => e.id === s.lastResult!.entryId);
          return {
            entries,
            lastResult: keepResult ? s.lastResult : null,
            notice: notice(`Bombo actualizado: ${plural(clean.length, 'bola', 'bolas')}`),
          };
        });
      },

      addSample: () => get().addPending(SAMPLE_LABELS),

      clearEntries: () => {
        if (get().draw) return;
        set({ entries: [], lastResult: null, notice: notice('Bombo vacío') });
      },

      startDraw: ({ reducedMotion = false, hand = false } = {}) => {
        const { draw, entries } = get();
        if (draw || entries.length === 0) return false;
        const { plan, winner } = decideDraw(entries, { reducedMotion, hand });
        set({
          draw: { plan, winner, startedAt: performance.now() },
          lastResult: null,
          notice: notice('Girando el bombo…'),
        });
        // The store owns the timeline, so the result arrives even if no frame is drawn.
        clearTimeout(drawTimer);
        drawTimer = setTimeout(() => get().completeDraw(), plan.timeline.totalMs);
        return true;
      },

      completeDraw: () => {
        const { draw, history } = get();
        if (!draw) return;
        clearTimeout(drawTimer);
        const result: DrawResult = {
          id: createId(),
          entryId: draw.winner.id,
          ball: draw.winner.ball,
          label: draw.winner.label,
          at: Date.now(),
        };
        set({
          draw: null,
          lastResult: result,
          history: [result, ...history].slice(0, HISTORY_LIMIT),
          notice: notice(`Ha salido la bola ${result.ball}: ${result.label}`),
        });
      },

      dismissResult: () => set({ lastResult: null }),

      removeWinner: () => {
        const { lastResult } = get();
        if (lastResult) get().removeEntry(lastResult.entryId);
        set({ lastResult: null });
      },

      clearHistory: () => set({ history: [], notice: notice('Historial de bolas borrado') }),

      setSound: (on) => set({ sound: on }),

      setMusic: (on) => set({ music: on }),
    }),
    {
      name: 'bombo:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedState => ({
        entries: s.entries,
        history: s.history,
        sound: s.sound,
        music: s.music,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);

/** One-time import of the previous wheel's saved list, so nobody loses their options. */
export function importLegacyWheelList(): void {
  try {
    if (localStorage.getItem('bombo:imported')) return;
    localStorage.setItem('bombo:imported', '1');
    const legacy = JSON.parse(localStorage.getItem('rueda:v1') ?? 'null') as { state?: unknown } | null;
    const restored = sanitizePersisted(legacy?.state);
    if (restored.entries?.length) {
      useBingoStore.setState({ entries: restored.entries, history: [] });
    }
  } catch {
    /* nothing to import */
  }
}

export const selectIsDrawing = (s: BingoState) => s.draw !== null;

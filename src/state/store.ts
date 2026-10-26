import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  MAX_ENTRIES,
  cleanLabel,
  createEntries,
  createId,
  replaceLabels,
  type Entry,
} from '../domain/entries';
import type { SpinPlan } from '../domain/planSpin';
import { decideSpin } from '../domain/selection';
import { normalizeAngle } from '../domain/wheelMath';
import { SAMPLE_LABELS } from './sampleEntries';

export interface SpinResult {
  readonly id: string;
  readonly entryId: string;
  readonly label: string;
  readonly at: number;
}

export interface ActiveSpin {
  readonly plan: SpinPlan;
  readonly winner: Entry;
  /** `performance.now()` when the spin started. */
  readonly startedAt: number;
}

export interface Notice {
  readonly id: number;
  readonly text: string;
}

interface PersistedState {
  entries: Entry[];
  rotation: number;
  history: SpinResult[];
  sound: boolean;
}

export interface WheelState extends PersistedState {
  spin: ActiveSpin | null;
  lastResult: SpinResult | null;
  notice: Notice | null;

  addEntries: (labels: readonly string[]) => number;
  updateEntry: (id: string, label: string) => void;
  removeEntry: (id: string) => void;
  replaceAll: (labels: readonly string[]) => void;
  resetToSample: () => void;
  clearEntries: () => void;

  startSpin: (options?: { reducedMotion?: boolean }) => boolean;
  completeSpin: () => void;
  dismissResult: () => void;
  removeWinner: () => void;
  clearHistory: () => void;
  setSound: (on: boolean) => void;
}

export const HISTORY_LIMIT = 50;
/** Pause after the wheel stops before the result is announced. */
export const SETTLE_MS = 180;

let spinTimer: ReturnType<typeof setTimeout> | undefined;
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

function sanitizePersisted(raw: unknown): Partial<PersistedState> {
  if (!raw || typeof raw !== 'object') return {};
  const value = raw as Record<string, unknown>;
  const out: Partial<PersistedState> = {};
  if (Array.isArray(value.entries)) {
    out.entries = value.entries
      .filter(
        (e): e is Entry =>
          !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.label === 'string',
      )
      .map((e) => ({ id: e.id, label: cleanLabel(e.label) }))
      .filter((e) => e.label.length > 0)
      .slice(0, MAX_ENTRIES);
  }
  if (typeof value.rotation === 'number' && Number.isFinite(value.rotation)) {
    out.rotation = normalizeAngle(value.rotation);
  }
  if (Array.isArray(value.history)) {
    out.history = value.history
      .filter(
        (r): r is SpinResult =>
          !!r &&
          typeof r === 'object' &&
          typeof r.id === 'string' &&
          typeof r.entryId === 'string' &&
          typeof r.label === 'string' &&
          typeof r.at === 'number',
      )
      .slice(0, HISTORY_LIMIT);
  }
  if (typeof value.sound === 'boolean') out.sound = value.sound;
  return out;
}

export const useWheelStore = create<WheelState>()(
  persist(
    (set, get) => ({
      entries: createEntries(SAMPLE_LABELS),
      rotation: 0,
      history: [],
      sound: true,
      spin: null,
      lastResult: null,
      notice: null,

      addEntries: (labels) => {
        const { spin, entries } = get();
        if (spin) return 0;
        const room = MAX_ENTRIES - entries.length;
        const clean = labels.map(cleanLabel).filter(Boolean).slice(0, Math.max(0, room));
        if (clean.length === 0) {
          if (room <= 0) set({ notice: notice(`Máximo ${MAX_ENTRIES} opciones.`) });
          return 0;
        }
        set({
          entries: [...entries, ...createEntries(clean)],
          notice: notice(
            clean.length === 1
              ? `Añadida: ${clean[0]}`
              : `${plural(clean.length, 'opción añadida', 'opciones añadidas')}`,
          ),
        });
        return clean.length;
      },

      updateEntry: (id, label) => {
        const clean = cleanLabel(label);
        if (get().spin || !clean) return;
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, label: clean } : e)) }));
      },

      removeEntry: (id) => {
        const { spin, entries, lastResult } = get();
        if (spin) return;
        const removed = entries.find((e) => e.id === id);
        if (!removed) return;
        set({
          entries: entries.filter((e) => e.id !== id),
          lastResult: lastResult?.entryId === id ? null : lastResult,
          notice: notice(`Eliminada: ${removed.label}`),
        });
      },

      replaceAll: (labels) => {
        if (get().spin) return;
        const clean = labels.map(cleanLabel).filter(Boolean).slice(0, MAX_ENTRIES);
        set((s) => ({
          entries: replaceLabels(s.entries, clean),
          notice: notice(`Lista actualizada: ${plural(clean.length, 'opción', 'opciones')}`),
        }));
      },

      resetToSample: () => {
        if (get().spin) return;
        set({
          entries: createEntries(SAMPLE_LABELS),
          lastResult: null,
          notice: notice('Lista de ejemplo restablecida'),
        });
      },

      clearEntries: () => {
        if (get().spin) return;
        set({ entries: [], lastResult: null, notice: notice('Lista vaciada') });
      },

      startSpin: ({ reducedMotion = false } = {}) => {
        const { spin, entries, rotation } = get();
        if (spin || entries.length === 0) return false;
        const { plan, winner } = decideSpin(entries, rotation, { reducedMotion });
        set({
          spin: { plan, winner, startedAt: performance.now() },
          lastResult: null,
          notice: notice('Girando…'),
        });
        // The store owns the timeline, so the result arrives even if no frame is drawn.
        clearTimeout(spinTimer);
        spinTimer = setTimeout(() => get().completeSpin(), plan.durationMs + SETTLE_MS);
        return true;
      },

      completeSpin: () => {
        const { spin, history } = get();
        if (!spin) return;
        clearTimeout(spinTimer);
        const result: SpinResult = {
          id: createId(),
          entryId: spin.winner.id,
          label: spin.winner.label,
          at: Date.now(),
        };
        set({
          spin: null,
          rotation: normalizeAngle(spin.plan.targetRotation),
          lastResult: result,
          history: [result, ...history].slice(0, HISTORY_LIMIT),
          notice: notice(`Ha salido: ${result.label}`),
        });
      },

      dismissResult: () => set({ lastResult: null }),

      removeWinner: () => {
        const { lastResult } = get();
        if (lastResult) get().removeEntry(lastResult.entryId);
        set({ lastResult: null });
      },

      clearHistory: () => set({ history: [], notice: notice('Historial borrado') }),

      setSound: (on) => set({ sound: on }),
    }),
    {
      name: 'rueda:v1',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedState => ({
        entries: s.entries,
        rotation: s.rotation,
        history: s.history,
        sound: s.sound,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);

export const selectIsSpinning = (s: WheelState) => s.spin !== null;

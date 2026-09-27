import { useMemo } from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_ALGORITHM_ID } from '../../core/algorithms/catalog.ts';
import type { AlgoDef, ParamSpec, Preset } from '../../core/algorithms/types.ts';
import { defaultParams } from '../../core/algorithms/types.ts';
import type { Lang } from '../../core/code/anchors.ts';
import { isPresetInput } from '../../core/input/fields.ts';
import type { AlgoInput } from '../../core/input/types.ts';
import {
  DEFAULT_SPEED,
  initialTransport,
  type Speed,
  type TransportAction,
  transport,
} from '../../core/trace/player.ts';
import type { Frame } from '../../core/trace/types.ts';
import { loadAlgorithm } from '../registry/loaders.ts';
import { initialPaneFlags, reconcileForWidth, reconcilePanes } from './panes.ts';
import { type BuiltTrace, buildTrace } from './traceBuilder.ts';

/**
 * The one store.
 *
 * Re-render discipline (plan §6.2) is the whole reason this is a hand-written
 * selector store rather than a single context:
 *
 *  - the frame index changes up to 60x/second during playback, and *only* the
 *    viewport subtree should re-render per tick;
 *  - the transport bar must subscribe to `isPlaying` / `canStepBack` — values
 *    that change at human speed — never to `index` directly;
 *  - the code listing re-renders when the *anchor* changes, which is far less
 *    often than the index (a swap emits two frames on one line).
 *
 * Zustand's selector equality is what makes that possible: each subscriber is
 * woken only when the slice it selected actually changes identity.
 */

export type RunStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlayerState {
  /* --- what is being shown --- */
  algoId: string;
  algo: AlgoDef | null;
  status: RunStatus;
  error: string | null;

  /* --- inputs --- */
  params: Record<string, number | string | boolean>;
  input: AlgoInput;
  presetId: string | null;

  /* --- the trace --- */
  trace: Frame[];
  index: number;
  isPlaying: boolean;
  speed: Speed;
  completed: boolean;
  truncated: boolean;
  /** Wall-clock ms the last materialisation took. Shown in the status bar. */
  lastRunMs: number;
  /** True when the last trace was built in the worker. Shown as "worker". */
  offThread: boolean;

  /* --- presentation --- */
  lang: Lang;
  loop: boolean;
  showPointerLabels: boolean;
  sidebarOpen: boolean;
  /** The custom-input editor is a transient sheet, not a fourth column. */
  inputOpen: boolean;
  /** The code panel is a drawer below `xl` and a column above it. */
  codeOpen: boolean;
  shortcutsOpen: boolean;

  /* --- actions --- */
  load: (
    id?: string,
    opts?: { presetId?: string; lang?: Lang; input?: AlgoInput },
  ) => Promise<void>;
  applyPreset: (preset: Preset) => void | Promise<void>;
  setParam: (spec: ParamSpec, value: number | string | boolean) => void | Promise<void>;
  setInput: (input: AlgoInput) => void | Promise<void>;
  rerun: () => void | Promise<void>;
  dispatch: (action: TransportAction) => void;
  setSpeed: (speed: Speed) => void;
  setLang: (lang: Lang) => void;
  setLoop: (loop: boolean) => void;
  togglePointerLabels: () => void;
  setSidebarOpen: (open: boolean) => void;
  setInputOpen: (open: boolean) => void;
  toggleInput: () => void;
  setCodeOpen: (open: boolean) => void;
  toggleCode: () => void;
  /** Re-reconcile panes after a viewport change. See `panes.ts`. */
  syncPanesToWidth: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

const DEFAULT_PRESET = (algo: AlgoDef): Preset =>
  algo.presets[0] ?? {
    id: 'default',
    label: 'Default',
    input: { type: 'numbers', values: [] },
  };

function seedFor(algo: AlgoDef, presetId: string | null | undefined): AlgoInput {
  const preset = algo.presets.find((p) => p.id === presetId) ?? DEFAULT_PRESET(algo);
  return preset.input;
}

/**
 * Apply a freshly built trace to the store.
 *
 * A `requestId` guards against out-of-order completion: switching algorithms
 * quickly, or dragging a numeric param, can leave an older worker response
 * arriving after a newer synchronous one. Without the guard the viewport would
 * briefly show the previous algorithm's data — the exact class of bug that makes
 * people distrust a visualiser.
 */
let requestCounter = 0;

function applyTrace(
  set: (partial: Partial<PlayerState>) => void,
  built: BuiltTrace,
  requestId: number,
  extra: Partial<PlayerState> = {},
) {
  if (requestId !== requestCounter) return; // superseded
  set({
    trace: built.trace,
    truncated: built.truncated,
    lastRunMs: built.ms,
    offThread: built.offThread,
    error: built.error,
    index: 0,
    isPlaying: false,
    completed: false,
    ...extra,
  });
}

export const usePlayer = create<PlayerState>()(
  subscribeWithSelector((set, get) => ({
    algoId: DEFAULT_ALGORITHM_ID,
    algo: null,
    status: 'idle',
    error: null,

    params: {},
    input: { type: 'numbers', values: [] },
    presetId: null,

    trace: [],
    index: 0,
    isPlaying: false,
    speed: DEFAULT_SPEED,
    completed: false,
    truncated: false,
    lastRunMs: 0,
    offThread: false,

    lang: 'javascript',
    loop: false,
    showPointerLabels: true,
    /*
     * Panes start open only where they are columns.
     *
     * Both used to be hard-coded `true`, which meant a phone visitor arrived to
     * two stacked drawers with the header, narration, viewport and transport all
     * behind them. On a desktop this is unchanged, so the fix costs the desktop
     * nothing — see `panes.ts` for why the rule is "at most one *drawer*" rather
     * than "at most one pane".
     */
    ...initialPaneFlags(),
    shortcutsOpen: false,

    async load(id, opts) {
      const previous = get().algo;
      const target = id ?? previous?.id ?? DEFAULT_ALGORITHM_ID;
      set({ status: 'loading', error: null });
      try {
        const algo = await loadAlgorithm(target);
        const presetId = opts?.presetId ?? get().presetId;
        const preset = algo.presets.find((p) => p.id === presetId) ?? DEFAULT_PRESET(algo);
        const input = opts?.input ?? seedFor(algo, preset.id);
        const params = { ...defaultParams(algo), ...(preset.params ?? {}) };
        const requestId = ++requestCounter;
        const built = await buildTrace(algo, input, params);

        applyTrace(set, built, requestId, {
          algoId: target,
          algo,
          status: 'ready',
          params,
          input,
          presetId: preset.id,
          // Keep the language across algorithm switches. A student comparing
          // Java to Python on one algorithm should not be reset to JavaScript
          // on the next one.
          lang: opts?.lang ?? (previous ? get().lang : 'javascript'),
        });
      } catch (e) {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    async applyPreset(preset) {
      const { algo } = get();
      if (!algo) return;
      const params = { ...defaultParams(algo), ...(preset.params ?? {}) };
      const built = await buildTrace(algo, preset.input, params);
      applyTrace(set, built, ++requestCounter, {
        presetId: preset.id,
        input: preset.input,
        params,
      });
    },

    async setParam(spec, value) {
      const { algo, params, input } = get();
      if (!algo) return;
      const next = { ...params, [spec.key]: value };
      // Some params (a `target`, a `rotation`) change the computation but not
      // the data, so this re-runs without regenerating the input.
      const built = await buildTrace(algo, input, next);
      applyTrace(set, built, ++requestCounter, { params: next });
    },

    async setInput(input) {
      const { algo, params } = get();
      if (!algo) return;
      const built = await buildTrace(algo, input, params);
      applyTrace(set, built, ++requestCounter, { input });
    },

    async rerun() {
      const { algo, input, params } = get();
      if (!algo) return;
      const built = await buildTrace(algo, input, params);
      applyTrace(set, built, ++requestCounter, {});
    },

    dispatch(action) {
      const { trace } = get();
      const next = transport(
        {
          index: get().index,
          isPlaying: get().isPlaying,
          speed: get().speed,
          completed: get().completed,
        },
        action,
        trace.length,
      );
      set(next);
    },

    setSpeed(speed) {
      set({ speed });
    },
    setLang(lang) {
      set({ lang });
    },
    setLoop(loop) {
      set({ loop });
    },
    togglePointerLabels() {
      set({ showPointerLabels: !get().showPointerLabels });
    },
    /*
     * Every pane mutation goes through `reconcilePanes`, so "at most one drawer
     * is open" is enforced by the only code that can break it. These three used
     * to be plain assignments, which is what let the store hold a state the
     * layout could not render.
     */
    setSidebarOpen(sidebarOpen) {
      set(reconcilePanes(get(), 'nav', sidebarOpen));
    },
    setInputOpen(inputOpen) {
      set(reconcilePanes(get(), 'input', inputOpen));
    },
    toggleInput() {
      const { inputOpen } = get();
      set(reconcilePanes(get(), 'input', !inputOpen));
    },
    setCodeOpen(codeOpen) {
      set(reconcilePanes(get(), 'code', codeOpen));
    },
    toggleCode() {
      const { codeOpen } = get();
      set(reconcilePanes(get(), 'code', !codeOpen));
    },
    /**
     * Called when the window crosses a docking threshold.
     *
     * The store only enforces the rule on pane actions, and a resize is not an
     * action on a pane: a student with both columns open who drags the window
     * down to 900px would otherwise strand two drawers open, which is the exact
     * state this module exists to make unreachable.
     */
    syncPanesToWidth() {
      set(reconcileForWidth(get()));
    },
    setShortcutsOpen(shortcutsOpen) {
      set({ shortcutsOpen });
    },
  })),
);

/* ------------------------------------------------------------------ *
 * Derived selectors
 *
 * Kept as named exports so components subscribe to the narrowest possible
 * slice. A component that calls `usePlayer(s => s.trace)` re-renders once per
 * run; a component that calls `usePlayer(s => s.index)` re-renders per tick.
 * Mixing those up is the main performance risk in an app shaped like this.
 * ------------------------------------------------------------------ */

export const useAlgo = () => usePlayer((s) => s.algo);
export const useStatus = () => usePlayer((s) => s.status);
export const useFrameCount = () => usePlayer((s) => s.trace.length);
export const useIndex = () => usePlayer((s) => s.index);
export const useIsPlaying = () => usePlayer((s) => s.isPlaying);
export const useLang = () => usePlayer((s) => s.lang);
export const useLoop = () => usePlayer((s) => s.loop);
export const useTrace = () => usePlayer((s) => s.trace);
export const useInput = () => usePlayer((s) => s.input);
export const useParams = () => usePlayer((s) => s.params);
export const usePresetId = () => usePlayer((s) => s.presetId);
export const useSidebarOpen = () => usePlayer((s) => s.sidebarOpen);
export const useInputOpen = () => usePlayer((s) => s.inputOpen);
export const useCodeOpen = () => usePlayer((s) => s.codeOpen);
export const useShortcutsOpen = () => usePlayer((s) => s.shortcutsOpen);
export const useTruncated = () => usePlayer((s) => s.truncated);
export const useRunError = () => usePlayer((s) => s.error);
export const useRunMs = () => usePlayer((s) => s.lastRunMs);
export const useOffThread = () => usePlayer((s) => s.offThread);
export const useShowPointerLabels = () => usePlayer((s) => s.showPointerLabels);

/**
 * Transport capabilities, for the controls. Changes at human speed, not per frame.
 *
 * Wrapped in `useShallow` because the selector builds a fresh object. Zustand
 * compares snapshots with `Object.is`, so without the shallow wrapper every store
 * notification looks like a change, `useSyncExternalStore` re-renders in a loop,
 * and React throws "maximum update depth exceeded". This is the single most
 * common Zustand mistake, and it is completely invisible until the component
 * happens to render for the first time.
 */
export const useTransportFlags = () =>
  usePlayer(
    useShallow((s) => {
      const length = s.trace.length;
      return {
        isPlaying: s.isPlaying,
        canStepBack: length > 0 && s.index > 0,
        canStepForward: length > 0 && s.index < length - 1,
        atStart: length === 0 || s.index === 0,
        atEnd: length === 0 || s.index >= length - 1,
      };
    }),
  );

/** The current frame. The only selector a viewport subscribes to. */
export const useCurrentFrame = () => usePlayer((s) => s.trace[s.index] ?? null);

/**
 * Is the input on screen the preset's own, or the student's?
 *
 * Drives the header's "yours" badge and, through the same `isPresetInput`
 * predicate, decides whether a custom input goes in the share link — the two
 * must agree, or the badge contradicts the link.
 *
 * Subscribes to the three slices the answer depends on and derives with
 * `useMemo`, rather than putting the comparison inside the selector. A selector
 * returning a boolean is correct but re-runs its `JSON.stringify` on *every*
 * store notification, which during playback is 60 times a second over an array
 * that may be 150 elements long, to produce a value that has not changed.
 */
export const useIsCustomInput = (): boolean => {
  const algo = usePlayer((s) => s.algo);
  const presetId = usePlayer((s) => s.presetId);
  const input = usePlayer((s) => s.input);
  return useMemo(
    () => !isPresetInput(algo?.presets.find((p) => p.id === presetId)?.input, input),
    [algo, presetId, input],
  );
};

/**
 * The current anchor, separately from the frame.
 *
 * The code listing subscribes to *this* rather than to the frame, so it
 * re-renders only when the highlighted line actually changes. A swap emits two
 * frames on one line, and re-highlighting twice is wasted work that also makes
 * the highlight flicker.
 */
export const useCurrentAnchor = () => usePlayer((s) => s.trace[s.index]?.anchor ?? null);

export const selectCurrentFrame = (s: PlayerState) => s.trace[s.index] ?? null;
export const selectProgress = (s: PlayerState) =>
  s.trace.length > 1 ? s.index / (s.trace.length - 1) : s.trace.length === 1 ? 1 : 0;

export { initialTransport };

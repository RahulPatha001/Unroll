import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_ALGORITHM_ID } from '../../core/algorithms/catalog.ts';
import type { AlgoDef, ParamSpec, Preset } from '../../core/algorithms/types.ts';
import { defaultParams } from '../../core/algorithms/types.ts';
import type { Lang } from '../../core/code/anchors.ts';
import { resizeInput } from '../../core/input/resize.ts';
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
  /**
   * Is `input` the student's own, rather than a preset's?
   *
   * This started as `!isPresetInput(preset.input, input)` — a value comparison —
   * and that is provably unable to answer the question. `regeneratesInput`
   * produces a *new* array from a preset, so after growing `Reversed` from 8 to
   * 20 elements the input no longer equals the preset it came from, the
   * comparison reported "custom", and the control was then capped at the current
   * length — so it stuck at 20 and refused to go higher. The inference could not
   * tell "regenerated from this preset" from "typed by hand", because after the
   * fact they are the same bytes.
   *
   * So provenance is recorded rather than reconstructed. The risk a flag carries
   * — some path changing the input and forgetting to set it — is the reason
   * `isPresetInput` exists in the first place, and it is a real one; the
   * difference is that every write to `input` in this file now sets it in the
   * same statement, and `boundary.test.ts`'s sibling check is the one that
   * would catch a new write path.
   */
  inputCustom: boolean;

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
 * Is this input the student's own rather than a preset's?
 *
 * By value comparison against the active preset, for the reason `isPresetInput`
 * already documents: a flag would have to be set by every path that can change
 * the input, and the one that forgets is the one that lies.
 */
function isCustomInput(state: Pick<PlayerState, 'input' | 'inputCustom'>): boolean {
  return state.inputCustom;
}

/**
 * Raise a `size` param so it stops truncating the input it is applied to.
 *
 * 28 of the 66 algorithms declare a `size` param, and their `run` functions do
 * `input.values.slice(0, size)`. The default is 8 or 9, so an input longer than
 * that was silently cut down, and this function exists because that was happening
 * through **three** separate doors, each of which looked fine on its own:
 *
 *  1. The input editor. Typing 30 values and pressing Run drew 8 cells, the header
 *     said `n = 8`, the "yours" badge was lit, and nothing said 22 values had been
 *     dropped. The values were still in the URL, so reopening the editor showed
 *     all 30 again and the bug looked intermittent.
 *  2. A share link. `?algo=bubble-sort&input=<40 values>` goes through `load`,
 *     which built the trace with `defaultParams` — so `size` was 8 and 32 values
 *     vanished before the URL's own `params` were ever applied. The recipient saw
 *     8 cells and a "yours" badge. A link is a promise that the run reproduces, and
 *     this broke it for any link that did not also carry `params`.
 *  3. Restoring a link after navigating away and back, same path as (2).
 *
 * So it lives here, in the store, rather than in whichever component happened to
 * notice. `load` and `setInput` are the only two ways an input enters the state,
 * and both now go through it, which is the property that makes it a fix rather
 * than a patch.
 *
 * The rule is that **the input wins**, because the input is the thing a person
 * just supplied. `size` exists to let you deliberately run *fewer* elements than
 * you provided — a 4-element bubble sort is a reasonable thing to want — not to
 * override you without saying so. It is still editable afterwards.
 *
 * `spec.max` is the real ceiling (150 for all of them) and is respected here; the
 * input editor is what tells the student when they are past it.
 */
function fitSizeParam(
  algo: AlgoDef,
  input: AlgoInput,
  params: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  const spec = algo.params.find((p) => p.key === 'size' && p.kind === 'number');
  if (!spec) return params;
  const n = algo.inputSpec.sizeOf(input);
  if (!Number.isFinite(n) || n <= 0) return params;
  const current = Number(params[spec.key] ?? spec.default);
  if (!Number.isFinite(current) || n <= current) return params;
  return { ...params, [spec.key]: Math.min(n, spec.max ?? n) };
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
    inputCustom: false,

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
        // Before the trace is built, not after: the truncation happens *inside*
        // `run`, so a size that is too small has already discarded the values by
        // the time anything could notice.
        const params = fitSizeParam(algo, input, {
          ...defaultParams(algo),
          ...(preset.params ?? {}),
        });
        const requestId = ++requestCounter;
        const built = await buildTrace(algo, input, params);

        applyTrace(set, built, requestId, {
          algoId: target,
          algo,
          status: 'ready',
          params,
          input,
          presetId: preset.id,
          // An input carried by the URL is the sender's own data, so it is custom
          // by definition even though a preset is also selected — a share link
          // with `?input=` and `?preset=` is the editor having been used before
          // the link was copied.
          inputCustom: Boolean(opts?.input),
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
        inputCustom: false,
      });
    },

    async setParam(spec, value) {
      const { algo, params, input } = get();
      if (!algo) return;

      /*
        A `regeneratesInput` param cannot exceed a *custom* input's own length,
        and that is enforced here rather than only in the control's `max`.

        The header already narrows the field so a student cannot type past their
        own data, but a value can also arrive from a share link or from any other
        caller, and a store that will hold `size: 40` beside a six-element input
        is a store holding a state its own UI calls impossible. Clamping at the
        single point every route passes through is what makes the invariant true
        rather than merely encouraged.
      */
      if (spec.regeneratesInput && spec.kind === 'number' && isCustomInput(get())) {
        const ceiling = Math.max(1, algo.inputSpec.sizeOf(input));
        const n = Number(value);
        if (Number.isFinite(n) && n > ceiling) {
          const capped = { ...params, [spec.key]: ceiling };
          const built = await buildTrace(algo, input, capped);
          applyTrace(set, built, ++requestCounter, { params: capped });
          return;
        }
      }

      const next = { ...params, [spec.key]: value };

      /*
        Honour `regeneratesInput`, which 28 algorithms declare and nothing
        implemented.

        The flag's own contract is "changing this regenerates the input (e.g. a
        new random array)", and until now it was referenced nowhere, so `size`
        could only ever *truncate* the input it was applied to. Raising it did
        nothing at all: drag `size` from 8 to 20 and the viewport still drew 8
        cells, because there was nothing to slice up to. A control that only
        subtracts is not a size control.

        Two cases, and the second is the reason this lives here rather than in
        the header:

        - **A preset input** is regenerated to the new count. This is the flag
          working as documented, and `resizeInput` preserves the shape that makes
          the preset worth choosing — a `Reversed` array stays reversed, an
          `All equal` one stays all-equal — so growing to 20 does not quietly
          discard the lesson the preset was selected for.

        - **A custom input is never regenerated.** The student typed those exact
          values, and inventing twenty more to satisfy a number field would
          replace their data with data they did not write, silently. So the
          parameter is left where it is and the control's range is narrowed to
          the input's own length by `LessonHeader`, which makes the limit visible
          where the student is looking instead of swallowing the keystroke here.
      */
      if (spec.regeneratesInput && spec.kind === 'number') {
        if (!isCustomInput(get())) {
          const resized = resizeInput(input, Number(value), algo.inputSpec.sizeOf);
          const fitted = fitSizeParam(algo, resized, next);
          const built = await buildTrace(algo, resized, fitted);
          applyTrace(set, built, ++requestCounter, {
            input: resized,
            params: fitted,
            // Still the preset's data, just at a different length — which is the
            // distinction the value comparison could not make.
            inputCustom: false,
          });
          return;
        }
      }

      // Some params (a `target`, a `rotation`) change the computation but not the
      // data, so this re-runs without regenerating the input.
      const built = await buildTrace(algo, input, next);
      applyTrace(set, built, ++requestCounter, { params: next });
    },

    async setInput(input) {
      const { algo, params } = get();
      if (!algo) return;
      const next = fitSizeParam(algo, input, params);
      const built = await buildTrace(algo, input, next);
      applyTrace(set, built, ++requestCounter, { input, params: next, inputCustom: true });
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
/**
 * The header's "yours" badge.
 *
 * Reads `inputCustom` rather than re-deriving it, so the badge and the `size`
 * control can never disagree about whether the data on screen is the student's.
 * They were separate answers to one question before, which is the same class of
 * bug as a store holding a state its own UI calls impossible.
 */
export const useIsCustomInput = (): boolean => usePlayer((s) => s.inputCustom);

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

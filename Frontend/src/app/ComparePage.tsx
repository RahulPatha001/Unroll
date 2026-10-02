import { AlertTriangle, ArrowLeftRight, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG } from '../core/algorithms/catalog.ts';
import type { AlgoDef } from '../core/algorithms/types.ts';
import { CATEGORY_LABEL } from '../core/algorithms/types.ts';
import type { AlgoInput } from '../core/input/types.ts';
import type { Frame } from '../core/trace/types.ts';
import { Scrubber } from '../features/player/Scrubber.tsx';
import { buildTrace } from '../features/player/traceBuilder.ts';
import { loadAlgorithm } from '../features/registry/loaders.ts';
import { Viewport } from '../features/viewport/Viewport.tsx';
import { cn } from '../lib/utils.ts';
import { PageBody, PageShell } from './PageShell.tsx';

/**
 * Two algorithms, one input, one transport.
 *
 * ## Why this is the most useful page in the app
 *
 * Comparing algorithms is the thing students actually want to do and the thing
 * no single-algorithm visualiser can support. "Is quicksort faster than merge
 * sort" is not answerable from two separate visits: the inputs differ, the step
 * counts are not comparable, and you cannot watch them diverge.
 *
 * Here they run on **the same input**, so the step counts become the answer. Merge
 * sort takes `n log n` steps and quicksort takes "however many swaps this
 * particular input needed" — and on a reversed array those two numbers are
 * dramatically different in a way that prose cannot show.
 *
 * ## Two honest constraints, both surfaced rather than hidden
 *
 *  - **Compatible input types.** The point is one shared input, so the two
 *    algorithms have to accept the same *shape*. A number array and a graph are
 *    not comparable, and pretending otherwise by silently running each on its own
 *    default would produce a side-by-side that looks authoritative and means
 *    nothing. So a mismatch is stated plainly and both keep their own preset,
 *    labelled as such.
 *  - **Different traces, one index.** The sliders share a *position*, not a step.
 *    Merge sort's frame 40 and quicksort's frame 40 are not the same moment, and
 *    the page says so. Making them genuinely comparable would need a notion of
 *    shared semantic steps, which the trace format does not have — and inventing
 *    one would be a lie about what the two animations are doing.
 *
 * ## Not built on `playerStore`
 *
 * For the same reason as `EmbeddedStepper`: it is a singleton, it owns the URL,
 * and it owns global keyboard shortcuts. This page holds two traces in local state
 * and needs neither.
 */

interface Side {
  algo: AlgoDef;
  trace: Frame[];
  input: AlgoInput;
  presetLabel: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; a: Side; b: Side; shared: boolean };

export function ComparePage({
  pathname,
  onNavigate,
  initialA,
  initialB,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
  initialA?: string;
  initialB?: string;
}) {
  const [idA, setIdA] = useState(initialA ?? 'bubble-sort');
  const [idB, setIdB] = useState(initialB ?? 'quick-sort');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    setPlaying(false);

    void (async () => {
      try {
        const [algoA, algoB] = await Promise.all([loadAlgorithm(idA), loadAlgorithm(idB)]);
        if (cancelled || !alive.current) return;

        const presetA = algoA.presets[0];
        const presetB = algoB.presets[0];
        if (!presetA || !presetB) throw new Error('both algorithms need at least one preset');

        /*
         * "Same input" is only meaningful when the two algorithms accept the same
         * shape. `type` is the discriminator on the `AlgoInput` union, so comparing
         * it is an exact answer rather than a heuristic — `numbers` and `chars`
         * genuinely cannot be one input.
         */
        const shared = presetA.input.type === presetB.input.type;
        const inputB = shared ? presetA.input : presetB.input;

        const paramsFor = (algo: AlgoDef) => ({
          ...Object.fromEntries(algo.params.map((p) => [p.key, p.default])),
          ...(presetA.params ?? {}),
        });

        const [builtA, builtB] = await Promise.all([
          buildTrace(algoA, presetA.input, paramsFor(algoA)),
          buildTrace(algoB, inputB, paramsFor(algoB)),
        ]);
        if (cancelled || !alive.current) return;

        setState({
          kind: 'ready',
          shared,
          a: { algo: algoA, trace: builtA.trace, input: presetA.input, presetLabel: presetA.label },
          b: { algo: algoB, trace: builtB.trace, input: inputB, presetLabel: presetB.label },
        });
        setIndex(0);
      } catch (e) {
        if (cancelled || !alive.current) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idA, idB]);

  const reduced = usePrefersReducedMotion();

  const maxIndex =
    state.kind === 'ready' ? Math.max(state.a.trace.length, state.b.trace.length) - 1 : 0;

  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((i) => {
        if (i >= maxIndex) {
          setPlaying(false);
          return maxIndex;
        }
        return i + 1;
      });
    }, 110);
    return () => window.clearInterval(timer);
  }, [playing, reduced, maxIndex]);

  const seek = useCallback(
    (v: number) => {
      setPlaying(false);
      setIndex(Math.max(0, Math.min(maxIndex, v)));
    },
    [maxIndex],
  );

  /*
   * Grouped for the two `<select>`s, so a 66-item flat list is navigable.
   *
   * `<optgroup>` rather than a flat list because 66 options sorted alphabetically
   * hides the one you want behind 40 unrelated ones, and the catalog's own category
   * grouping is exactly the right mental model here.
   */
  const options = useMemo(() => {
    const byCat = new Map<string, typeof CATALOG>();
    for (const e of CATALOG) {
      const list = byCat.get(e.category) ?? [];
      list.push(e);
      byCat.set(e.category, list);
    }
    return [...byCat];
  }, []);

  return (
    <PageShell
      pathname={pathname}
      onNavigate={onNavigate}
      title="Compare algorithms — Unroll"
      description="Run two algorithms on the same input, side by side, with one shared transport."
    >
      <PageBody className="pb-10">
        <div className="fade-rise pt-8 pb-6 sm:pt-10">
          <h1 className="flex items-center gap-2.5 text-[26px] font-extrabold tracking-tight text-text-strong sm:text-[32px]">
            <ArrowLeftRight className="size-6 text-accent" />
            Side by side
          </h1>
          <p className="measure mt-2 text-[14px] leading-relaxed text-text-muted">
            Two algorithms, the same input, one transport. The step counts answer the question
            directly, and you can watch them get there.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <AlgoSelect id={idA} onChange={setIdA} options={options} label="Algorithm A" />
          <div className="hidden pb-2.5 text-text-subtle sm:block" aria-hidden="true">
            <ArrowLeftRight className="size-4" />
          </div>
          <AlgoSelect id={idB} onChange={setIdB} options={options} label="Algorithm B" />
        </div>

        {state.kind === 'error' ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="text-[13px] text-text-muted">
              Could not build both traces: {state.message}
            </p>
          </div>
        ) : null}

        {state.kind === 'ready' ? (
          <>
            {!state.shared ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
                <p className="text-[13px] leading-relaxed text-text-muted">
                  These two take <strong className="text-text">different kinds of input</strong>, so
                  they are running their own default presets rather than a shared one. The step
                  counts below are not comparable.
                </p>
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SidePanel
                side={state.a}
                index={index}
                length={state.a.trace.length}
                accent="accent"
              />
              <SidePanel side={state.b} index={index} length={state.b.trace.length} accent="info" />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-surface-raised/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-text-inverse shadow-md shadow-accent-deep/25 transition-all hover:bg-accent-hover active:scale-95"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                <Play className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => seek(0)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-inset hover:text-text"
                aria-label="Back to the start"
              >
                <RotateCcw className="size-4" />
              </button>
              <Scrubber
                className="min-w-0 flex-1"
                index={index}
                length={maxIndex + 1}
                onSeek={seek}
                label="Scrub both algorithms"
                valueText={`Step ${index + 1} of ${maxIndex + 1}`}
              />
              <span className="shrink-0 font-mono text-[11px] text-text-subtle tabular-nums">
                {index + 1}/{maxIndex + 1}
              </span>
            </div>

            {/*
              The verdict. This is the payoff of the whole page, so it is stated as a
              plain comparison rather than left for the reader to compute off two
              numbers.
            */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Verdict
                label={state.a.algo.title}
                steps={state.a.trace.length}
                other={state.b.trace.length}
                done={index >= state.a.trace.length - 1}
                tone="accent"
              />
              <Verdict
                label={state.b.algo.title}
                steps={state.b.trace.length}
                other={state.a.trace.length}
                done={index >= state.b.trace.length - 1}
                tone="info"
              />
            </div>
          </>
        ) : null}
      </PageBody>
    </PageShell>
  );
}

function AlgoSelect({
  id,
  onChange,
  options,
  label,
}: {
  id: string;
  onChange: (v: string) => void;
  options: Array<[string, typeof CATALOG]>;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
        {label}
      </span>
      <select
        value={id}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-surface-raised/70 px-3 py-2 text-[13px] text-text-strong outline-none transition-colors focus:border-accent/60"
      >
        {options.map(([cat, list]) => (
          <optgroup key={cat} label={CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function SidePanel({
  side,
  index,
  length,
  accent,
}: {
  side: Side;
  index: number;
  length: number;
  accent: 'accent' | 'info';
}) {
  const frame = side.trace[index] ?? null;
  const finished = index >= length - 1;
  return (
    <section
      aria-label={`${side.algo.title} visualisation`}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-surface-raised/40',
        finished ? 'border-accent/50' : 'border-border/80',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            finished ? 'bg-success' : accent === 'accent' ? 'bg-accent' : 'bg-info',
          )}
          aria-hidden="true"
        />
        <h2 className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-strong">
          {side.algo.title}
        </h2>
        <span className="shrink-0 font-mono text-[10px] text-text-subtle tabular-nums">
          {Math.min(index + 1, length)}/{length}
        </span>
      </header>
      {/*
        `flex flex-col` for the same reason as the article stepper: a viewport's
        root is `flex-1` in a column, so without a flex parent here the chart has no
        definite height and collapses to a strip.
      */}
      <div className="relative flex h-56 flex-col overflow-hidden bg-surface/40">
        <Viewport frame={frame} showPointerLabels={false} />
      </div>
      <p className="border-t border-border/70 px-3 py-1.5 text-[10.5px] text-text-subtle">
        {side.presetLabel}
        {finished ? ' · finished' : ''}
      </p>
    </section>
  );
}

function Verdict({
  label,
  steps,
  other,
  done,
  tone,
}: {
  label: string;
  steps: number;
  other: number;
  done: boolean;
  tone: 'accent' | 'info';
}) {
  const ratio = other > 0 ? steps / other : 1;
  const faster = steps < other;
  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3',
        done ? 'border-success/40 bg-success/10' : 'border-border/80 bg-surface-raised/40',
      )}
    >
      <div className="truncate text-[11px] font-medium text-text-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-[19px] font-bold text-text-strong tabular-nums">
        {steps}
        <span className="ml-1.5 text-[11px] font-medium text-text-subtle">steps</span>
      </div>
      <div
        className={cn(
          'mt-1 text-[10.5px] font-semibold',
          // Explicit rather than `text-${tone}`. Tailwind scans source for
          // complete class *strings*, so an interpolated name produces no rule at
          // all and the element renders with no colour — which is precisely the
          // silent failure `checkTokens.mjs` and `tools/tokens.test.ts` exist to
          // catch elsewhere, and which a dynamic class reintroduces by the back
          // door.
          done
            ? 'text-success'
            : steps === other
              ? 'text-text-subtle'
              : faster
                ? tone === 'accent'
                  ? 'text-accent'
                  : 'text-info'
                : 'text-text-subtle',
        )}
      >
        {done
          ? 'finished'
          : steps === other
            ? 'same length'
            : faster
              ? `${ratio.toFixed(2)}× fewer steps`
              : `${(1 / ratio).toFixed(2)}× more steps`}
      </div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

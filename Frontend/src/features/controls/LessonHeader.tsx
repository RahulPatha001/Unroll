import { Check, Clock, Dices, Layers, Menu, PanelRight, Sigma, SquarePen } from 'lucide-react';
import type { AlgoDef, ParamSpec } from '../../core/algorithms/types.ts';
import { shuffleInput } from '../../core/input/shuffle.ts';
import { type AlgoInput, inputSize } from '../../core/input/types.ts';
import type { Frame } from '../../core/trace/types.ts';
import { cn } from '../../lib/utils.ts';
import { useCurrentFrame, useIsCustomInput, usePlayer } from '../player/playerStore.ts';

/**
 * The lesson header: what it is, how fast it is, what it costs, and every
 * preset and parameter that changes the run.
 *
 * Complexity is shown as four labelled cells rather than a single "O(n log n)"
 * string, because the interesting part of a complexity line is the *gap* between
 * best and worst (bubble sort: O(n) vs O(n²)) and the space cost (in-place vs
 * O(n)). Collapsing that into one number throws away the lesson.
 */
export function LessonHeader({ algo }: { algo: AlgoDef }) {
  const params = usePlayer((s) => s.params);
  const setParam = usePlayer((s) => s.setParam);
  const setInput = usePlayer((s) => s.setInput);
  const presetId = usePlayer((s) => s.presetId);
  const applyPreset = usePlayer((s) => s.applyPreset);
  const input = usePlayer((s) => s.input);
  const custom = useIsCustomInput();
  const inputOpen = usePlayer((s) => s.inputOpen);
  const toggleInput = usePlayer((s) => s.toggleInput);
  const sidebarOpen = usePlayer((s) => s.sidebarOpen);
  const setSidebarOpen = usePlayer((s) => s.setSidebarOpen);
  const codeOpen = usePlayer((s) => s.codeOpen);
  const toggleCode = usePlayer((s) => s.toggleCode);

  const frame = useCurrentFrame();
  const traits = collectTraits(algo);

  return (
    <header className="shrink-0 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-sm">
      {/* Row 1: identity and the two panel toggles. */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            'shrink-0 rounded-md p-1.5 transition-colors',
            sidebarOpen
              ? 'bg-slate-800 text-amber-300'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          )}
          aria-label={sidebarOpen ? 'Hide the algorithm list' : 'Show the algorithm list'}
          aria-pressed={sidebarOpen}
          title="Toggle the algorithm list (B)"
        >
          <Menu className="size-4" />
        </button>
        <h1
          className="min-w-0 shrink truncate text-[15px] font-bold tracking-tight text-slate-50"
          title={algo.title}
        >
          {algo.title}
        </h1>
        <span className="hidden shrink-0 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase sm:inline">
          {algo.category.replace('-', ' ')}
        </span>
        <span className="hidden shrink-0 rounded-md bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline">
          {algo.level}
        </span>
        {/*
          At most three chips, then a count.

          Eight of them squeezed the algorithm's *name* down to "Dijkst…" — the
          one string on screen a student is guaranteed to be reading, made
          unreadable by decoration. Clipping the chips is the right trade-off, but
          the honest version of that is a deliberate cap with a visible remainder
          rather than a `max-width` that quietly amputates whatever happened to be
          last. Three is enough to give the flavour ("priority-queue, weighted,
          shortest-path"); the full trait list is in the sidebar's "when to use
          it" panel, and the complexity row below states the consequential facts.
        */}
        <span className="ml-1 hidden min-w-0 shrink items-center gap-1 overflow-hidden md:flex">
          {traits.slice(0, 3).map((t) => (
            <span
              key={t}
              className="shrink-0 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300"
            >
              {t}
            </span>
          ))}
          {traits.length > 3 ? (
            <span
              className="shrink-0 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
              title={traits.join(' · ')}
            >
              +{traits.length - 3}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          onClick={toggleCode}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 xl:hidden"
          aria-expanded={codeOpen}
        >
          <PanelRight className="size-3" />
          code
        </button>
      </div>

      {/* Row 2: what it does. */}
      <p className="px-4 pb-2.5 text-[13px] leading-relaxed text-slate-300/90">{algo.summary}</p>

      {/* Row 3: complexity, as four separate facts. */}
      <div className="flex flex-wrap items-stretch gap-x-5 gap-y-2 border-t border-slate-800/70 bg-slate-900/30 px-4 py-2">
        <ComplexityCell
          icon={<Check className="size-3" />}
          label="best"
          value={algo.complexity.best ?? '—'}
          good
        />
        <ComplexityCell
          icon={<Sigma className="size-3" />}
          label="average"
          value={algo.complexity.average}
        />
        <ComplexityCell
          icon={<Clock className="size-3" />}
          label="worst"
          value={algo.complexity.worst}
          warn={
            algo.complexity.best !== undefined && algo.complexity.best !== algo.complexity.worst
          }
        />
        <ComplexityCell
          icon={<Layers className="size-3" />}
          label="space"
          value={algo.complexity.space}
        />
        {algo.complexity.note ? (
          <span className="self-center text-[11px] text-slate-400 italic">
            {algo.complexity.note}
          </span>
        ) : null}
        <span className="self-center font-mono text-[10px] text-slate-600 tabular-nums">
          n = {displayedSize(frame, input)}
        </span>
      </div>

      {/* Row 4: presets and parameters. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800/70 px-4 py-1.5">
        <span className="mr-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          presets
        </span>
        {algo.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.blurb}
            aria-pressed={p.id === presetId}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150',
              p.id === presetId
                ? 'border-amber-400/70 bg-amber-400/15 text-amber-200 shadow-[0_0_16px_-4px] shadow-amber-400/40'
                : 'border-slate-700/80 text-slate-400 hover:border-slate-500 hover:bg-slate-800/60 hover:text-slate-200',
            )}
          >
            {p.label}
          </button>
        ))}

        {algo.params.map((spec) => (
          <ParamControl
            key={spec.key}
            spec={spec}
            value={params[spec.key] ?? spec.default}
            // `setParam` re-runs on its own. An extra `rerun()` here used to
            // paper over that, at the cost of building every trace twice per
            // keystroke.
            onChange={(v) => {
              void setParam(spec, v);
            }}
          />
        ))}

        <button
          type="button"
          onClick={() => setInput(reshuffle(input))}
          className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
          title="Generate a new input of the same shape"
        >
          <Dices className="size-3" />
          shuffle
        </button>

        {/*
          The custom-input trigger.

          It carries a "yours" badge when the input is not the active preset's,
          and that badge is the only way a student can tell — after navigating
          away and back, or after following a link — whether they are looking at
          the algorithm's example data or their own. It is computed by value
          comparison against the preset rather than tracked by a flag, because a
          flag has to be set by every path that can change the input and the one
          that forgets is the one that lies to the user.
        */}
        <button
          type="button"
          onClick={() => toggleInput()}
          aria-pressed={inputOpen}
          className={cn(
            'flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors',
            inputOpen
              ? 'border-amber-400/70 bg-amber-400/15 text-amber-200'
              : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
          )}
          title="Run this algorithm on your own input (I)"
        >
          <SquarePen className="size-3" />
          your input
          {custom ? (
            <span className="rounded bg-amber-400/20 px-1 text-[9px] font-bold tracking-wide text-amber-300 uppercase">
              yours
            </span>
          ) : null}
        </button>
      </div>
    </header>
  );
}

function ComplexityCell({
  icon,
  label,
  value,
  good,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 self-center">
      <span
        className={cn(
          'flex size-5 items-center justify-center rounded',
          good
            ? 'bg-emerald-400/15 text-emerald-400'
            : warn
              ? 'bg-amber-400/15 text-amber-400'
              : 'bg-slate-800 text-slate-500',
        )}
      >
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[9px] font-semibold tracking-wide text-slate-500 uppercase">
          {label}
        </div>
        <div
          className={cn(
            'font-mono text-[12px] font-bold',
            good ? 'text-emerald-300' : 'text-slate-200',
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function ParamControl({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}) {
  if (spec.kind === 'select') {
    return (
      <label className="ml-1 flex items-center gap-1 text-[11px] text-slate-400">
        {spec.label}
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
        >
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (spec.kind === 'toggle') {
    return (
      <label className="ml-1 flex items-center gap-1 text-[11px] text-slate-400">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3 accent-amber-400"
        />
        {spec.label}
      </label>
    );
  }

  if (spec.kind === 'text') {
    return (
      <label
        className="ml-1 flex items-center gap-1.5 text-[11px] text-slate-400"
        title={spec.help}
      >
        {spec.label}
        <input
          type="text"
          value={String(value)}
          placeholder={spec.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-200"
        />
      </label>
    );
  }

  return (
    <label className="ml-1 flex items-center gap-1.5 text-[11px] text-slate-400" title={spec.help}>
      {spec.label}
      <input
        type="number"
        value={Number(value)}
        min={spec.min}
        max={spec.max}
        step={spec.step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200 tabular-nums"
      />
    </label>
  );
}

/**
 * The element count for the `n =` readout.
 *
 * Taken from the *frame* when the frame is index-based, because a size param
 * slices the input rather than replacing it: bubble sort with `size: 5` on an
 * 8-element preset draws five cells, and reporting `n = 8` there is simply a lie
 * about what is on screen. For the identity-based kinds (tree, graph, linked
 * list) the input is the only place the count exists, so fall back to it.
 */
function displayedSize(frame: Frame | null, input: AlgoInput): number {
  if (!frame) return inputSize(input);
  switch (frame.kind) {
    case 'array':
      return frame.values.length;
    case 'linear':
      return frame.items.length;
    case 'grid':
      return frame.rows * frame.cols;
    // One case per kind, on purpose. Folding them together with `?.` and `||`
    // was the first attempt and it does not typecheck: `frame.nodes` and
    // `frame.size` do not exist on every member of that union, and a
    // discriminated union is exactly the thing that stops you from pretending
    // they do.
    case 'linked':
      return frame.nodes.length;
    case 'hash':
      return frame.size;
    case 'graph':
    case 'tree':
    case 'trie':
      return Object.keys(frame.nodes).length;
    default:
      return inputSize(input);
  }
}

/**
 * The trait chips, de-duplicated.
 *
 * De-duplication is not cosmetic: these become React `key`s, and `build-heap`
 * both lists `'in place'` in `traits.tags` and sets `traits.inPlace: true`. The
 * duplicate key made React log a warning and drop a chip from the DOM, which
 * looks like a rendering bug and is impossible to trace back to a traits field.
 */
function collectTraits(algo: AlgoDef): string[] {
  const t = algo.traits;
  const out: string[] = [...(t.tags ?? [])];
  if (t.stable) out.push('stable');
  if (t.inPlace) out.push('in place');
  if (t.online) out.push('online');
  if (t.offline) out.push('needs full input');
  return [...new Set(out)];
}

/**
 * The seed for the next reshuffle.
 *
 * A monotonic counter rather than `Math.random()`, so it stays inside the `core/`
 * determinism rule that makes golden traces and shareable URLs meaningful: two
 * clicks give two different inputs, and the same sequence of clicks always gives
 * the same sequence. The actual generation lives in `core/input/shuffle.ts`,
 * which is pure and covers every input type.
 */
let shuffleCounter = 0;

function reshuffle(input: AlgoInput): AlgoInput {
  shuffleCounter += 1;
  return shuffleInput(input, shuffleCounter * 2654435761);
}

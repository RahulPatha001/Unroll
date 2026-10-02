import {
  Check,
  Clock,
  Dices,
  Info,
  Layers,
  Lightbulb,
  Link2,
  Menu,
  PanelRight,
  Sigma,
  SquarePen,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AlgoDef, ParamSpec } from '../../core/algorithms/types.ts';
import { shuffleInput } from '../../core/input/shuffle.ts';
import { type AlgoInput, inputSize } from '../../core/input/types.ts';
import type { Frame } from '../../core/trace/types.ts';
import { useCopyLink } from '../../lib/clipboard.ts';
import { Em } from '../../lib/richText.tsx';
import { cn } from '../../lib/utils.ts';
import { useCurrentFrame, useIsCustomInput, usePlayer } from '../player/playerStore.ts';

/**
 * The lesson header: what it is, and every control that changes the run.
 *
 * ## Two rows, and why not four
 *
 * This used to be four stacked rows — identity, summary, complexity, presets —
 * and it was the largest thing on screen that had nothing to do with the
 * algorithm. Measured: 281px of a 900px window at 1440 wide, 315px at 1280 (the
 * *taller* of the two, because the complexity row wrapped), and 403px of an
 * 844px phone. The visualisation got 43%, then 32%, then 25% of the screen as
 * the window narrowed.
 *
 * The layout is now two fixed-height rows: identity and controls. Everything
 * *explanatory* — summary, complexity, traits, and the "when to use it" prose
 * that used to sit under the algorithm list — is behind one disclosure, in an
 * overlay that does not resize anything.
 *
 * Three decisions worth stating, because each one is a trade:
 *
 *  - **Controls stay visible; prose does not.** Presets, parameters, shuffle and
 *    "your input" are how you *use* the visualiser. Summary and complexity are
 *    how you *read* it. Collapsing the first would be a regression dressed as a
 *    layout improvement.
 *
 *  - **The detail panel is an overlay, not an expansion.** An inline disclosure
 *    would push the visualisation down when opened, which is the same class of
 *    bug as the input editor: one element on screen is supposed to only change
 *    because the algorithm changed it. Overlaying also means the header's height
 *    is *unconditional* — opening the panel cannot change it, and neither can
 *    resizing the window.
 *
 *  - **The control row does not wrap.** It is `flex-nowrap` with horizontal
 *    scroll. Wrapping is what made the header's height depend on the window's
 *    width in the first place, and the trait of the fix has to be that the
 *    number of lines is a function of the content and nothing else. Scrolling a
 *    toolbar beats a header that changes height as you drag a window edge.
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
  const [detailOpen, setDetailOpen] = useState(false);
  const { copied, copy: copyLink } = useCopyLink();

  const frame = useCurrentFrame();
  const traits = collectTraits(algo);

  /*
    The ceiling a `regeneratesInput` control may offer.

    `size` regenerates the input when it changes, so for a preset its range is the
    full 2-150. For a *custom* input it is not, and pretending otherwise is how a
    student ends up dragging a field to 50 and watching the run refuse to grow:
    growing a custom input would mean inventing values they did not type, which is
    the opposite of what "your input" means. So the range narrows to what they
    actually supplied, putting the limit on the control where they can see it
    rather than swallowing the keystroke somewhere invisible.
  */
  const inputCount = inputSize(input);
  const ceilingFor = (spec: ParamSpec): number | undefined =>
    spec.regeneratesInput && custom
      ? Math.min(spec.max ?? Number.POSITIVE_INFINITY, Math.max(2, inputCount))
      : spec.max;

  return (
    <header className="relative z-20 shrink-0 border-b border-border/80 bg-surface-raised/60 backdrop-blur-sm">
      {/* Row 1: identity, and the two things that toggle whole panels. */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            'shrink-0 rounded-md p-1.5 transition-colors',
            sidebarOpen
              ? 'bg-surface-inset text-accent-hover'
              : 'text-text-muted hover:bg-surface-inset hover:text-text',
          )}
          aria-label={sidebarOpen ? 'Hide the algorithm list' : 'Show the algorithm list'}
          aria-pressed={sidebarOpen}
          aria-expanded={sidebarOpen}
          title="Toggle the algorithm list (B)"
        >
          <Menu className="size-4" />
        </button>
        <h1
          className="min-w-0 shrink truncate text-[15px] font-bold tracking-tight text-text-strong"
          title={algo.title}
        >
          {algo.title}
        </h1>
        <span className="hidden shrink-0 rounded-md bg-surface-inset/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-muted uppercase sm:inline">
          {algo.category.replace('-', ' ')}
        </span>
        <span className="hidden shrink-0 rounded-md bg-surface-inset/90 px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:inline">
          {algo.level}
        </span>
        {/*
          The trait chips used to live here, capped at three with a `+N`
          remainder. They were the reason the *title* truncated — at 1280 it read
          "Dijkstra's Shortest …" — and every one of them is repeated in the
          detail panel, so the row was paying vertical space to say something
          available one click away.
        */}

        {/*
          The share link, in the header rather than only in the input editor.

          A link reproduces the run exactly — algorithm, language, frame, preset,
          and any custom input — and it was reachable only from inside the editor,
          which is a strange place to look: the editor is for *changing* a run,
          and someone who wants to send what they are looking at is not thinking
          about the editor. The URL is already being kept in sync by
          `useUrlSync`, so this is a readout of state that exists, not a new
          feature — which is also why it cannot be stale.
        */}
        <button
          type="button"
          onClick={copyLink}
          className="flex shrink-0 items-center gap-1.5 rounded border border-border-strong px-2 py-1 text-[11px] text-text-muted transition-colors hover:border-border-subtle hover:text-text"
          title="Copy a link to this exact run, including the current step"
        >
          {copied ? <Check className="size-3 text-success" /> : <Link2 className="size-3" />}
          {copied ? 'copied' : 'share'}
        </button>

        <button
          type="button"
          onClick={() => setDetailOpen(!detailOpen)}
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors',
            detailOpen
              ? 'border-accent/70 bg-accent/15 text-accent-strong'
              : 'border-border-strong text-text-muted hover:border-border-subtle hover:text-text',
          )}
          aria-expanded={detailOpen}
          aria-controls="algorithm-detail"
          title="What this algorithm does, what it costs, and when to use it"
        >
          <Info className="size-3" />
          details
        </button>

        <button
          type="button"
          onClick={toggleCode}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[11px] transition-colors',
            codeOpen
              ? 'border-border-strong text-text-muted'
              : 'border-border-strong text-text-muted hover:border-border-subtle hover:text-text',
          )}
          aria-expanded={codeOpen}
          aria-controls="code-panel"
          title="Toggle the code panel (C)"
        >
          <PanelRight className="size-3" />
          code
        </button>
      </div>

      {/*
        Row 2: the controls.

        `flex-nowrap` inside `scroll-fade-x` is the load-bearing part, and both
        halves matter. With `flex-wrap` the row became two lines at some widths
        and one at others, so the header's height was a function of the window
        width — measured to oscillate between 236px and 315px across 1024-1920,
        non-monotonically, so that 1200 was *shorter* than 1440. Switching to
        `nowrap` fixed the wrapping and exposed a second cause: a visible
        scrollbar takes layout space and so appeared only when the content
        overflowed, which depended on whether the code panel was a docked column.
        Hence `scroll-fade-x`, which scrolls without occupying a line.

        `n =` sits *outside* the scroll container. It is a readout rather than a
        control, and a number that scrolls away is a number nobody reads.
      */}
      <div className="flex items-center gap-2 border-t border-border/70 px-2 py-1.5">
        <div className="scroll-fade-x flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
          <span className="mr-1 shrink-0 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
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
                'shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150',
                p.id === presetId
                  ? 'border-accent/70 bg-accent/15 text-accent-strong shadow-[0_0_16px_-4px] shadow-accent/40'
                  : 'border-border-strong/80 text-text-muted hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}

          {algo.params.map((spec) => (
            <ParamControl
              key={spec.key}
              spec={spec}
              max={ceilingFor(spec)}
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
            className="flex shrink-0 items-center gap-1 rounded border border-border-strong px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:border-border-subtle hover:text-text"
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
              'flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[11px] transition-colors',
              inputOpen
                ? 'border-accent/70 bg-accent/15 text-accent-strong'
                : 'border-border-strong text-text-muted hover:border-border-subtle hover:text-text',
            )}
            title="Run this algorithm on your own input (I)"
          >
            <SquarePen className="size-3" />
            your input
            {custom ? (
              <span className="rounded bg-accent/20 px-1 text-[9px] font-bold tracking-wide text-accent-hover uppercase">
                yours
              </span>
            ) : null}
          </button>
        </div>

        <span className="shrink-0 font-mono text-[10px] text-text-subtle tabular-nums">
          n = {displayedSize(frame, input)}
        </span>
      </div>

      {detailOpen ? (
        <AlgorithmDetail algo={algo} traits={traits} onClose={() => setDetailOpen(false)} />
      ) : null}
    </header>
  );
}

/**
 * The detail panel: summary, complexity, traits, and when to use it.
 *
 * An overlay, and the reason is the same reason the input editor is one. This
 * sits above the narration card and the visualisation, so opening it covers them
 * rather than pushing them down — the panel below the header is the one element
 * on screen that is supposed to only ever change because the algorithm changed
 * it, and a disclosure that reflows it is a disclosure that breaks the app's
 * central promise.
 *
 * Which also means the header's height is unconditional: this can be open or
 * shut and the header measures the same, and so does resizing the window.
 */
function AlgorithmDetail({
  algo,
  traits,
  onClose,
}: {
  algo: AlgoDef;
  traits: string[];
  onClose: () => void;
}) {
  // Escape closes, and only while this panel is the thing being dismissed —
  // `useKeyboardShortcuts` also listens for Escape, and the input editor's
  // dismissal has to keep working when this is shut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      id="algorithm-detail"
      /*
        `absolute top-full` against the `relative` header, so it takes up no
        space in the flex column. The `max-h` with internal scroll is what stops
        a long "when to use it" paragraph on a short window from running off the
        bottom of the screen — the same class of bug as the code listing that
        used to paint over the panel below it.
      */
      className="pop-in absolute inset-x-0 top-full max-h-[min(70vh,520px)] overflow-y-auto border-b border-border bg-surface-raised/98 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-sm"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-text-muted/90">
          {algo.summary}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted"
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      {/*
        A fixed grid, not `flex-wrap`.

        This row used to wrap, and the wrapping was the bug: the header's height
        depended on the window's width because of it. Inside an overlay the
        wrapping would be harmless, but a grid is still the better answer — the
        four cells are a comparison, and a comparison that silently becomes two
        rows of two at some widths is harder to read than one that never does.
        Two columns below `sm`, four above.
      */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </div>

      {algo.complexity.note ? (
        <p className="mt-2 text-[11px] text-text-muted italic">{algo.complexity.note}</p>
      ) : null}

      {traits.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {traits.map((t) => (
            <li
              key={t}
              className="rounded-md bg-info-deep/15 px-1.5 py-0.5 text-[10px] font-medium text-info"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        "When to use it", moved here from under the algorithm list.

        It was a fifteen-line wall of prose sitting in the navigation column, so
        finding an algorithm and reading about it were the same scroll. The list
        is for finding things; this panel is for reading about one.
      */}
      <div className="mt-3 border-t border-border/70 pt-2.5">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="size-3 shrink-0 text-success" />
          <span className="text-[10px] font-semibold tracking-wide text-text-muted uppercase">
            when to use it
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
          <Em text={algo.intuition} />
        </p>
      </div>
    </div>
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
            ? 'bg-success/15 text-success'
            : warn
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-inset text-text-subtle',
        )}
      >
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[9px] font-semibold tracking-wide text-text-subtle uppercase">
          {label}
        </div>
        <div
          className={cn(
            'font-mono text-[12px] font-bold',
            good ? 'text-success-strong' : 'text-text',
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/*
 * One parameter control.
 *
 * `shrink-0 whitespace-nowrap` on every label is load-bearing, and it was the
 * last thing standing between this header and a height that does not depend on
 * the window. Without them a label whose text no longer fits wraps onto a second
 * and third line *inside* its own box, so the control row grew taller as the
 * window narrowed — measured at 36px, 46px, 63px and 79px for the same
 * algorithm at 1920, 1440, 1200 and 1024. A flex row only scrolls when its items
 * refuse to shrink, so a label that can shrink will always choose to wrap
 * instead, and `flex-nowrap` on the parent does not stop it.
 */
/*
 * A `min`/`max` on a number input is advice, not enforcement.
 *
 * The browser clamps arrow-key stepping and honours the attribute on form
 * submission, but it does **not** clamp typed text: type `999` into a field
 * declared `max={150}` and the field keeps 999. That is not a cosmetic gap.
 * `size` is the parameter 28 algorithms slice their input with, so a field
 * showing 999 next to a header reading `n = 8` is two pieces of screen
 * disagreeing about the same run, and nothing on the page says which is right.
 *
 * So the value is clamped on the way in, and an unparseable field falls back to
 * the spec's default rather than becoming `NaN` — a `NaN` in `params` propagates
 * into the algorithm and produces a trace that is quietly wrong rather than one
 * that visibly failed.
 */
function clampParam(spec: ParamSpec, raw: string, max?: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return Number(spec.default);
  if (spec.min !== undefined && n < spec.min) return spec.min;
  const ceiling = max ?? spec.max;
  if (ceiling !== undefined && n > ceiling) return ceiling;
  return n;
}

function ParamControl({
  spec,
  value,
  max,
  onChange,
}: {
  spec: ParamSpec;
  value: number | string | boolean;
  /** Overrides `spec.max`; the header narrows it for a custom input. */
  max?: number;
  onChange: (v: number | string | boolean) => void;
}) {
  const LABEL =
    'ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-text-muted';

  if (spec.kind === 'select') {
    return (
      <label className={LABEL}>
        {spec.label}
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="shrink-0 rounded border border-border-strong bg-surface-inset px-1 py-0.5 text-[11px] text-text"
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
      <label className={LABEL}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3 shrink-0 accent-accent"
        />
        {spec.label}
      </label>
    );
  }

  if (spec.kind === 'text') {
    return (
      <label className={LABEL} title={spec.help}>
        {spec.label}
        <input
          type="text"
          value={String(value)}
          placeholder={spec.placeholder ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 shrink-0 rounded border border-border-strong bg-surface-inset px-1 py-0.5 font-mono text-[11px] text-text"
        />
      </label>
    );
  }

  return (
    <label className={LABEL} title={spec.help}>
      {spec.label}
      <input
        type="number"
        value={Number(value)}
        min={spec.min}
        max={max ?? spec.max}
        step={spec.step ?? 1}
        onChange={(e) => onChange(clampParam(spec, e.target.value, max))}
        className="w-16 shrink-0 rounded border border-border-strong bg-surface-inset px-1 py-0.5 text-[11px] text-text tabular-nums"
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

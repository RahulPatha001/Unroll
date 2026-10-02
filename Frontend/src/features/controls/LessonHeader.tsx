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
 * Two calm rows instead of four competing ones:
 *
 *  - Row 1 (identity): menu, title, category, level … share, details, code.
 *    Generous 12px padding and 8px gaps so the title can breathe; the trait
 *    chips that used to truncate it live in the detail panel, where they are
 *    one click away instead of always in the way.
 *  - Row 2 (setup): presets, parameters, shuffle, your input — the controls
 *    that change the run. Grouped with hairline dividers, horizontally
 *    scrollable without a scrollbar (`scroll-fade-x`), so the row is exactly
 *    one line tall at every width. `n =` sits outside the scroll as a readout.
 *
 * The detail panel is an overlay (`absolute top-full`), never an expansion:
 * opening it covers the stage rather than pushing it down, so the header's
 * height is unconditional — open or shut, 320px or 2560px wide, it measures
 * the same. That is the invariant `tests/visual/layout.spec.ts` sweeps for.
 *
 * Complexity is four labelled cells (best / average / worst / space) because
 * the gap between best and worst *is* the lesson for most algorithms.
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

  const inputCount = inputSize(input);
  const ceilingFor = (spec: ParamSpec): number | undefined =>
    spec.regeneratesInput && custom
      ? Math.min(spec.max ?? Number.POSITIVE_INFINITY, Math.max(2, inputCount))
      : spec.max;

  return (
    <header
      data-lesson-header="true"
      className="relative z-20 shrink-0 border-b border-border/70 bg-surface-raised/70 backdrop-blur-md"
    >
      {/* Row 1: identity + panel toggles. Roomier than before: px-3, py-2. */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            'shrink-0 rounded-lg p-2 transition-all duration-150',
            sidebarOpen
              ? 'bg-surface-inset text-accent-hover ring-1 ring-border/60 ring-inset'
              : 'text-text-muted hover:bg-surface-inset hover:text-text active:scale-95',
          )}
          aria-label={sidebarOpen ? 'Hide the algorithm list' : 'Show the algorithm list'}
          aria-pressed={sidebarOpen}
          aria-expanded={sidebarOpen}
          title="Toggle the algorithm list (B)"
        >
          <Menu className="size-4" />
        </button>
        <h1
          className="min-w-0 shrink truncate text-[16px] font-bold tracking-tight text-text-strong"
          title={algo.title}
        >
          {algo.title}
        </h1>
        <span className="hidden shrink-0 rounded-full bg-surface-inset/90 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-text-muted uppercase ring-1 ring-border/50 ring-inset sm:inline">
          {algo.category.replace('-', ' ')}
        </span>
        <span className="hidden shrink-0 rounded-full bg-surface-inset/90 px-2.5 py-1 text-[10px] font-medium text-text-muted ring-1 ring-border/50 ring-inset sm:inline">
          {algo.level}
        </span>

        <button
          type="button"
          onClick={copyLink}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong/80 px-3 py-1.5 text-[11.5px] font-medium text-text-muted transition-all duration-150 hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text active:scale-95"
          title="Copy a link to this exact run, including the current step"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Link2 className="size-3.5" />}
          {copied ? 'copied' : 'share'}
        </button>

        <button
          type="button"
          onClick={() => setDetailOpen(!detailOpen)}
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all duration-150 active:scale-95',
            detailOpen
              ? 'border-accent/70 bg-accent/15 text-accent-strong shadow-sm shadow-accent/20'
              : 'border-border-strong/80 text-text-muted hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text',
          )}
          aria-expanded={detailOpen}
          aria-controls="algorithm-detail"
          title="What this algorithm does, what it costs, and when to use it"
        >
          <Info className="size-3.5" />
          details
        </button>

        <button
          type="button"
          onClick={toggleCode}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all duration-150 active:scale-95',
            codeOpen
              ? 'border-accent/50 bg-accent/10 text-accent-strong'
              : 'border-border-strong/80 text-text-muted hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text',
          )}
          aria-expanded={codeOpen}
          aria-controls="code-panel"
          title="Toggle the code panel (C)"
        >
          <PanelRight className="size-3.5" />
          code
        </button>
      </div>

      {/* Row 2: setup. One line, always — `flex-nowrap` + `scroll-fade-x`. */}
      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <div className="scroll-fade-x flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
          <span className="mr-1 shrink-0 text-[10px] font-semibold tracking-widest text-text-subtle uppercase">
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
                'shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-all duration-150 active:scale-95',
                p.id === presetId
                  ? 'border-accent/70 bg-accent/15 text-accent-strong shadow-[0_0_16px_-4px] shadow-accent/40'
                  : 'border-border-strong/70 text-text-muted hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}

          <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border/70" />

          {algo.params.map((spec) => (
            <ParamControl
              key={spec.key}
              spec={spec}
              max={ceilingFor(spec)}
              value={params[spec.key] ?? spec.default}
              onChange={(v) => {
                void setParam(spec, v);
              }}
            />
          ))}

          <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border/70" />

          <button
            type="button"
            onClick={() => setInput(reshuffle(input))}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong/70 px-3 py-1 text-[11.5px] font-medium text-text-muted transition-all duration-150 hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text active:scale-95"
            title="Generate a new input of the same shape"
          >
            <Dices className="size-3.5" />
            shuffle
          </button>

          <button
            type="button"
            onClick={() => toggleInput()}
            aria-pressed={inputOpen}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-all duration-150 active:scale-95',
              inputOpen
                ? 'border-accent/70 bg-accent/15 text-accent-strong'
                : 'border-border-strong/70 text-text-muted hover:border-border-subtle hover:bg-surface-inset/60 hover:text-text',
            )}
            title="Run this algorithm on your own input (I)"
          >
            <SquarePen className="size-3.5" />
            your input
            {custom ? (
              <span className="rounded-full bg-accent/20 px-1.5 py-px text-[9px] font-bold tracking-wide text-accent-hover uppercase">
                yours
              </span>
            ) : null}
          </button>
        </div>

        <span className="shrink-0 rounded-md bg-surface-inset/60 px-2 py-1 font-mono text-[10.5px] font-medium text-text-subtle tabular-nums ring-1 ring-border/50 ring-inset">
          n = {displayedSize(frame, input)}
        </span>
      </div>

      {detailOpen ? (
        <AlgorithmDetail algo={algo} traits={traits} onClose={() => setDetailOpen(false)} />
      ) : null}
    </header>
  );
}

function AlgorithmDetail({
  algo,
  traits,
  onClose,
}: {
  algo: AlgoDef;
  traits: string[];
  onClose: () => void;
}) {
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
      className="pop-in absolute inset-x-3 top-full z-30 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border border-border-strong/70 bg-surface-raised/95 px-5 py-4 shadow-2xl shadow-black/50 backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-text-muted/90">
          {algo.summary}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-text-subtle transition-all duration-150 hover:bg-surface-inset hover:text-text-muted active:scale-95"
          aria-label="Close details"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
        <p className="mt-2.5 text-[11.5px] text-text-muted italic">{algo.complexity.note}</p>
      ) : null}

      {traits.length > 0 ? (
        <ul className="mt-3.5 flex flex-wrap gap-1.5">
          {traits.map((t) => (
            <li
              key={t}
              className="rounded-full bg-info-deep/15 px-2.5 py-1 text-[10.5px] font-medium text-info ring-1 ring-info-deep/20 ring-inset"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex items-center gap-1.5">
          <Lightbulb className="size-3.5 shrink-0 text-success" />
          <span className="text-[10px] font-semibold tracking-widest text-text-muted uppercase">
            when to use it
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
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
    <div className="flex items-center gap-2 rounded-xl bg-surface-inset/50 px-2.5 py-2 ring-1 ring-border/50 ring-inset">
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-lg',
          good
            ? 'bg-success/15 text-success'
            : warn
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-overlay/60 text-text-subtle',
        )}
      >
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[9px] font-semibold tracking-widest text-text-subtle uppercase">
          {label}
        </div>
        <div
          className={cn(
            'font-mono text-[12.5px] font-bold',
            good ? 'text-success-strong' : 'text-text',
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

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
  max?: number;
  onChange: (v: number | string | boolean) => void;
}) {
  const LABEL =
    'ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] text-text-muted';

  if (spec.kind === 'select') {
    return (
      <label className={LABEL}>
        {spec.label}
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="shrink-0 rounded-lg border border-border-strong/80 bg-surface-inset px-1.5 py-1 text-[11.5px] text-text"
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
          className="size-3.5 shrink-0 accent-accent"
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
          className="w-28 shrink-0 rounded-lg border border-border-strong/80 bg-surface-inset px-1.5 py-1 font-mono text-[11.5px] text-text"
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
        className="w-16 shrink-0 rounded-lg border border-border-strong/80 bg-surface-inset px-1.5 py-1 text-[11.5px] text-text tabular-nums"
      />
    </label>
  );
}

function displayedSize(frame: Frame | null, input: AlgoInput): number {
  if (!frame) return inputSize(input);
  switch (frame.kind) {
    case 'array':
      return frame.values.length;
    case 'linear':
      return frame.items.length;
    case 'grid':
      return frame.rows * frame.cols;
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

function collectTraits(algo: AlgoDef): string[] {
  const t = algo.traits;
  const out: string[] = [...(t.tags ?? [])];
  if (t.stable) out.push('stable');
  if (t.inPlace) out.push('in place');
  if (t.online) out.push('online');
  if (t.offline) out.push('needs full input');
  return [...new Set(out)];
}

let shuffleCounter = 0;

function reshuffle(input: AlgoInput): AlgoInput {
  shuffleCounter += 1;
  return shuffleInput(input, shuffleCounter * 2654435761);
}

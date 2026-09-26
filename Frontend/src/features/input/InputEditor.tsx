import { AlertTriangle, Check, Link2, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlgoDef, ParamSpec } from '../../core/algorithms/types.ts';
import {
  CANVAS_THRESHOLD,
  type FieldText,
  type GraphOptions,
  paramKeysFrom,
  parseFieldText,
  seedFieldText,
} from '../../core/input/fields.ts';
import type { AlgoInput, InputField } from '../../core/input/types.ts';
import { cn } from '../../lib/utils.ts';
import { usePlayer } from '../player/playerStore.ts';

/**
 * The custom-input editor.
 *
 * It is a renderer over `InputSpec` and nothing else. No algorithm module knows
 * this component exists, and adding one did not require editing any of the 56 —
 * which is the whole reason `InputSpec` exists and the reason this is a
 * ~200-line file rather than a per-algorithm form.
 *
 * ## What it shows and why it is trustworthy
 *
 * The boxes open pre-filled with **the input currently on screen**, not the
 * first preset's. That is the property that makes the feature safe to touch: you
 * can open the editor, change one number, and get a run that differs from what
 * you were looking at in exactly the way you asked for. The alternative — opening
 * on the default preset — makes every visit to the editor a silent reset.
 *
 * ## The graph field is a text box on purpose
 *
 * A drag-to-connect graph editor is a large amount of surface area for a feature
 * most students use once, and it cannot be made keyboard-accessible without
 * becoming a different project. An edge list is faster to type, trivially
 * keyboard- and screen-reader-navigable, and matches how people actually write a
 * graph down when they are thinking about one. `fields.ts` owns the grammar.
 */

/**
 * A fresh draft for an algorithm, seeded from the input currently on screen.
 *
 * Seeding from the *live* input rather than the first preset is the property
 * that makes the editor safe to touch: open it, change one number, and the run
 * differs from what you were looking at in exactly the way you asked for. The
 * alternative — opening on the default preset — makes every visit a silent reset.
 *
 * The graph toggles come from the input too, and for the same reason: opening the
 * editor on a directed graph must not quietly undirect it.
 */
function freshDraft(algo: AlgoDef, input: AlgoInput): Draft {
  return {
    algoId: algo.id,
    text: seedFieldText(algo.inputSpec, input),
    graphOpts: {
      directed: input.type === 'graph' ? input.directed : true,
      weighted: input.type === 'graph' ? input.weighted : true,
    },
  };
}

interface Draft {
  algoId: string;
  text: FieldText;
  graphOpts: GraphOptions;
}

export function InputEditor({ algo }: { algo: AlgoDef }) {
  const input = usePlayer((s) => s.input);
  const setInput = usePlayer((s) => s.setInput);
  const setParam = usePlayer((s) => s.setParam);
  const setOpen = usePlayer((s) => s.setInputOpen);
  const presetId = usePlayer((s) => s.presetId);

  /*
   * The draft, as one piece of state that remembers which algorithm it belongs
   * to.
   *
   * The first version of this re-seeded from a `useEffect` keyed on `algo.id`,
   * and needed five lint suppressions to express "reset when the algorithm
   * changes but not when anything else does" — because an effect has to declare
   * every value it read, and reading the input to seed from the input is exactly
   * the dependency cycle the rule is warning about.
   *
   * Adjusting state during render is the documented alternative: React discards
   * the render output and re-runs immediately, with no effect, no stale frame,
   * and no suppression. Keying on the id is also the correct *semantics* rather
   * than a convenience — switching to another preset of the same algorithm keeps
   * half-typed input, because a student who edits a field and then clicks a
   * preset has made a choice, and only an algorithm change makes the old text
   * meaningless.
   */
  const [draft, setDraft] = useState(() => freshDraft(algo, input));
  if (draft.algoId !== algo.id) setDraft(freshDraft(algo, input));

  const { text, graphOpts } = draft;
  const [copied, setCopied] = useState(false);
  const firstField = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    // Focus the first box so the keyboard shortcut lands somewhere useful. Done
    // in an effect rather than with `autoFocus` because the lint rule banning
    // `autoFocus` is right: it fires on every mount of a hidden-by-CSS control
    // and steals focus from wherever the student actually was.
    firstField.current?.focus();
  }, []);

  const setText = (key: string, value: string) =>
    setDraft((d) => ({ ...d, text: { ...d.text, [key]: value } }));

  const hasGraph = algo.inputSpec.fields.some((f) => f.kind === 'graph');
  const parsed = useMemo(
    () => parseFieldText(algo.inputSpec, text, { graph: graphOpts }),
    [algo.inputSpec, text, graphOpts],
  );

  const built = parsed.ok ? algo.inputSpec.build(parsed.values) : null;
  const size = built ? algo.inputSpec.sizeOf(built) : 0;
  const paramKeys = useMemo(
    () =>
      new Set(
        paramKeysFrom(
          algo.inputSpec,
          algo.params.map((p) => p.key),
        ),
      ),
    [algo.inputSpec, algo.params],
  );

  const preset = algo.presets.find((p) => p.id === presetId) ?? algo.presets[0];

  const run = () => {
    if (!parsed.ok || !built) return;
    /*
     * A field that is *also* a declared parameter has to be pushed at both.
     *
     * `detect-cycle` is the only one in the curriculum: its `cycleBack` field
     * changes the list's wiring rather than its values, so its `build` discards
     * the number and the generator reads it from params. Writing only the input
     * would leave a control in the editor that silently does nothing, which is
     * worse than not offering it.
     */
    for (const key of paramKeys) {
      const spec = algo.params.find((p: ParamSpec) => p.key === key);
      const value = parsed.values[key];
      if (spec && typeof value === 'number') void setParam(spec, value);
    }
    void setInput(built);
    setOpen(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A clipboard the browser will not open is not an error worth a dialog;
      // the address bar already holds a link that reproduces this exact run.
    }
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 max-h-full overflow-y-auto rounded-t-2xl border border-b-0 border-slate-700/80 bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur-md"
      role="dialog"
      aria-label="Custom input"
    >
      <div className="sticky top-0 flex items-center gap-2 border-b border-slate-800/80 bg-slate-900/95 px-3.5 py-2 backdrop-blur-md">
        <h2 className="text-[12px] font-bold tracking-wide text-slate-200 uppercase">
          Your own input
        </h2>
        {parsed.ok ? (
          <span className="font-mono text-[10px] text-slate-500 tabular-nums">
            n = {size}
            {size > CANVAS_THRESHOLD ? (
              <span className="ml-1 text-amber-400">· canvas above {CANVAS_THRESHOLD}</span>
            ) : null}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
            title="Copy a link to this exact run, including your input"
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Link2 className="size-3" />}
            {copied ? 'copied' : 'copy link'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            aria-label="Close the custom input editor"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        {algo.inputSpec.fields.map((field, i) => (
          <FieldControl
            key={field.key}
            field={field}
            value={text[field.key] ?? ''}
            error={parsed.ok ? undefined : parsed.errors[field.key]}
            inputRef={i === 0 ? firstField : undefined}
            onChange={(v) => setText(field.key, v)}
          />
        ))}

        {hasGraph ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <Toggle
              label="directed"
              checked={graphOpts.directed}
              onChange={(directed) =>
                setDraft((d) => ({ ...d, graphOpts: { ...d.graphOpts, directed } }))
              }
              help="Off stores each edge in both directions, so the algorithms can walk it either way."
            />
            <Toggle
              label="weighted"
              checked={graphOpts.weighted}
              onChange={(weighted) =>
                setDraft((d) => ({ ...d, graphOpts: { ...d.graphOpts, weighted } }))
              }
              help="On gives every edge a cost. A weight you typed always counts, whatever this says."
            />
          </div>
        ) : null}

        {!parsed.ok ? (
          <p className="flex items-start gap-1.5 text-[11px] text-rose-300">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span>Fix the highlighted field to run.</span>
          </p>
        ) : null}

        {size > CANVAS_THRESHOLD ? (
          <p className="text-[11px] text-amber-300/90">
            Past {CANVAS_THRESHOLD} elements the viewport switches to canvas, and the run may hit
            the frame cap and stop early. Smaller inputs teach more.
          </p>
        ) : null}

        <div className="flex items-center gap-2 border-t border-slate-800 pt-2.5">
          <button
            type="button"
            onClick={run}
            disabled={!parsed.ok}
            className={cn(
              'rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
              parsed.ok
                ? 'rounded-lg bg-amber-400 px-3.5 py-1.5 font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:bg-amber-300 hover:shadow-amber-500/30'
                : 'cursor-not-allowed rounded-lg bg-slate-800 text-slate-600',
            )}
          >
            Run on this
          </button>
          <button
            type="button"
            onClick={() => {
              if (!preset) return;
              void usePlayer.getState().applyPreset(preset);
              setOpen(false);
            }}
            className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
          >
            <RotateCcw className="size-3" />
            back to preset
          </button>
          <span className="ml-auto text-[10px] text-slate-600">
            your input goes in the link, so this run is shareable
          </span>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help: string;
}) {
  return (
    <label className="flex items-center gap-1.5" title={help}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3 accent-amber-400"
      />
      {label}
    </label>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  inputRef,
}: {
  field: InputField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}) {
  const id = `input-field-${field.key}`;
  const describedBy = error ? `${id}-error` : field.help ? `${id}-help` : undefined;

  const control = (() => {
    if (field.kind === 'number') {
      return (
        <input
          id={id}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={value}
          min={field.min}
          max={field.max}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-28 rounded border bg-slate-800 px-2 py-1 font-mono text-[12px] text-slate-100 tabular-nums',
            error ? 'border-rose-500' : 'border-slate-700',
          )}
        />
      );
    }

    // `words` and `graph` are genuinely multi-line — a `words` field on a grid
    // algorithm is one row per line — so they get a textarea. `numbers` and
    // `keys` are single-line in practice, and a one-line box for an array keeps
    // the sheet short enough to see the buttons without scrolling.
    const multiline = field.kind === 'words' || field.kind === 'graph';
    const rows = field.kind === 'graph' ? 5 : multiline ? 3 : 2;
    const placeholder = PLACEHOLDERS[field.kind] ?? '';

    return (
      <textarea
        id={id}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        rows={rows}
        spellCheck={false}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full resize-y rounded border bg-slate-800 px-2 py-1.5 font-mono text-[12px] leading-relaxed text-slate-100',
          error ? 'border-rose-500' : 'border-slate-700',
        )}
      />
    );
  })();

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold text-slate-300">
        {field.label}
      </label>
      {control}
      {/*
        `role="alert"` so a parse failure is announced the moment it appears.
        The message is only ever rendered once parsing has actually failed, so
        this cannot spam a screen reader on every keystroke — the region is
        absent, not empty, until there is something wrong.
      */}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-rose-300">
          {error}
        </p>
      ) : field.help ? (
        <p id={`${id}-help`} className="mt-1 text-[10px] text-slate-500">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}

const PLACEHOLDERS: Partial<Record<InputField['kind'], string>> = {
  numbers: '12, 17, 95, 4, 33',
  keys: '3, apple, 7, 1',
  words: 'one per line',
  text: 'a string',
  graph: 'nodes: 5\n0 -> 1 : 4\n1 -> 2 : 5\n2 -> 0 : 2',
};

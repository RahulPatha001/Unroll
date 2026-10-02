import { ArrowRight, ChevronUp, Code2, Info, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  LANG_LABEL,
  LANG_META,
  type Lang,
  type ParsedCode,
  parseCode,
  stripMarkers,
} from '../../core/code/anchors.ts';
import { Em } from '../../lib/richText.tsx';
import { cn } from '../../lib/utils.ts';
import { useAlgo, useCurrentAnchor, useLang, usePlayer } from '../player/playerStore.ts';
import { HighlightedLines } from './highlight.ts';

/**
 * The code panel — where the animation and the source meet.
 *
 * The contract, restated as UI:
 *
 *  - The highlighted line is *derived from the code*, via the `@anchor` marker
 *    the current frame carries. It is not a hand-maintained line number, so it
 *    cannot drift, and it is the *same step* in all four languages.
 *  - The explanation underneath is keyed by the same anchor, in the same
 *    language, so switching from Python to Java keeps the highlight and swaps
 *    the code — which is the moment a student realises `if s < target:` and
 *    `if (sum < target)` are one idea.
 *  - The panel is the reason the whole trace abstraction exists, so it gets
 *    first-class real estate rather than being tucked behind a tab.
 */
export function CodePanel({ onClose }: { onClose?: () => void }) {
  const algo = useAlgo();
  const lang = useLang();
  const anchor = useCurrentAnchor();

  // Open by default: the explanation is the reason the panel exists, and hiding
  // it behind a click would undo the product claim on first paint. Collapsing is
  // for the student who has read it and now wants the listing.
  const [explained, setExplained] = useState(true);
  const dispatch = usePlayer((st) => st.dispatch);

  const parsed: ParsedCode | null = useMemo(
    () => (algo ? parseCode(lang, algo.lesson.code[lang]) : null),
    [algo, lang],
  );

  // Every hook runs before any early return. A `useMemo` below the `if (!algo)`
  // guard compiles, passes typecheck, and then throws "rendered more hooks than
  // during the previous render" the first time the algorithm finishes loading —
  // which is to say, in front of a user, on the very first frame.
  //
  // Display the listing without the `@anchor` markers; line numbers are
  // unchanged, so `range` still points at the right line.
  const source = useMemo(() => (parsed ? stripMarkers(parsed.source) : ''), [parsed]);

  /**
   * Click a line of code -> jump the animation to the step that runs it.
   *
   * The anchor contract already knows, for every language, which line range
   * belongs to which semantic step. This walks that mapping in reverse and then
   * seeks to the first frame carrying that anchor, so the round trip
   *
   *     click a line -> find the anchor -> find the step -> seek
   *
   * turns the panel from a read-only transcript into the thing a student actually
   * wants: "what does *this line* do?", answered by watching the data structure
   * do it. It is also the only direction the contract does not already give you,
   * so it costs one reverse lookup and one seek.
   *
   * A line with no anchor is not clickable, and an anchor no frame ever emits
   * cannot happen — the contract test rejects dead anchors — but both are handled
   * rather than assumed, because a dead anchor would otherwise be a silent no-op
   * that looks broken.
   */
  const onLineClick = useCallback(
    (line: number) => {
      if (!parsed) return;
      const entry = Object.entries(parsed.anchors).find(
        ([, r]) => line >= r.start && line <= r.end,
      );
      if (!entry) return;
      const [anchorName] = entry;
      const { trace } = usePlayer.getState();
      const target = trace.find((f) => f.anchor === anchorName);
      if (target) dispatch({ type: 'seek', index: target.index });
    },
    [parsed, dispatch],
  );

  if (!algo || !parsed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-text-subtle">
        Select an algorithm to see its code.
      </div>
    );
  }

  const range = anchor ? (parsed.anchors[anchor] ?? null) : null;
  const note = anchor ? (algo.lesson.notes[lang]?.[anchor] ?? null) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface/50">
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <LanguageTabs lang={lang} />
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mr-2 shrink-0 rounded p-1 text-text-subtle hover:bg-surface-inset hover:text-text-muted xl:hidden"
            aria-label="Close the code panel"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/*
        The scroll region, and the one line that makes it work: `min-h-0` on a
        `flex-1` box is what gives it a *definite* height, and `HighlightedLines`
        fills it with `h-full`. Without the pair the scroll container is sized by
        its content, `overflow-auto` never engages on the vertical axis, and a long
        listing spills over the explanation below and off the panel.
      */}
      <div className="min-h-0 flex-1">
        <HighlightedLines
          lang={lang}
          source={source}
          startLine={range?.start ?? null}
          endLine={range?.end ?? 1}
          onLineClick={onLineClick}
        />
      </div>

      {/*
        Collapsible, because the two things in this panel compete for the same
        vertical space and both matter. Pinned open it takes up to 160px — more
        than a third of the listing on a laptop — and a student reading the code
        cannot get it back. Collapsed it is one line that still names the step, so
        nothing is more than a click away and the listing gets the room.
      */}
      <div className="shrink-0 border-t border-border/80 bg-surface-raised/70">
        {anchor ? (
          <>
            <button
              type="button"
              onClick={() => setExplained((v) => !v)}
              aria-expanded={explained}
              className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-surface-inset/40"
            >
              <Code2 className="size-3 shrink-0 text-accent" />
              <span className="text-[11px] text-text-muted">line</span>
              <span className="font-mono text-[11px] font-bold text-accent-hover tabular-nums">
                {range?.start ?? '?'}
              </span>
              <span className="text-slate-700">·</span>
              <span className="truncate font-mono text-[11px] text-text-muted">{anchor}</span>
              <ChevronUp
                className={[
                  'ml-auto size-3.5 shrink-0 text-text-subtle transition-transform duration-200',
                  explained ? '' : 'rotate-180',
                ].join(' ')}
              />
            </button>

            {/*
              `data-anchor` and `data-line` are the testable assertions: the *line
              number* legitimately differs per language, but the anchor name must
              not, because it names the step rather than the position. They stay
              on the wrapper rather than the header so they exist whether or not
              the explanation is expanded — a collapsed panel must not make the
              e2e suite blind.
            */}
            <div
              data-anchor={anchor}
              data-line={range?.start ?? undefined}
              data-explained={explained ? 'true' : 'false'}
              className={explained ? 'px-4 pb-3' : 'hidden'}
            >
              {note ? (
                <p className="text-[13px] leading-relaxed text-text">
                  <Em text={note} />
                </p>
              ) : (
                <p className="text-[13px] text-text-subtle">No explanation for this step yet.</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-text-subtle">
            <Info className="size-3.5 shrink-0" />
            Press play — the line being executed is highlighted here in all four languages.
          </div>
        )}
      </div>
    </div>
  );
}

const LANGS: Lang[] = ['javascript', 'python', 'java', 'cpp'];

export function LanguageTabs({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const algo = useAlgo();
  const setLang = usePlayer((s) => s.setLang);
  if (!algo) return null;

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-border/80 bg-surface-raised/70 px-2 py-1.5"
      role="tablist"
      aria-label="Implementation language"
    >
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${LANG_LABEL[l]} implementation`}
            onClick={() => setLang(l)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
              compact && 'px-1.5 text-[11px]',
              active
                ? 'rounded-md bg-accent text-text-inverse shadow-sm shadow-accent-deep/20'
                : 'text-text-muted hover:bg-surface-inset hover:text-text',
            )}
          >
            {compact ? LANG_META[l].short : LANG_LABEL[l]}
          </button>
        );
      })}
      <span className="ml-auto flex items-center gap-1 pr-1 text-[10px] text-text-faint">
        <ArrowRight className="size-3" />
        same step, four languages
      </span>
    </div>
  );
}

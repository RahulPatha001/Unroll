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
  /*
    Collapsed by default, which reverses what this panel used to do, and the reason
    is that the note is no longer a panel.

    Pinned at the bottom of the column it took up to 160px — over a third of a
    laptop's listing — so it defaulted to collapsed there and expanded on request.
    In the flow, under the line it explains, that trade is inverted: an expanded note
    pushes the *code* down by up to 110px, which on a short listing means the lines
    below the anchor go off-screen while the student is reading about them.

    So the default flips to collapsed and what is on screen by default is two clamped
    lines of the explanation, attached to the line — enough to know what it is for,
    with the rest one click away. That is strictly better than the old arrangement,
    where collapsed meant *nothing* but a "line 8 · base-case" label: now the gist is
    visible without spending anything.
  */
  const [explained, setExplained] = useState(false);
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
          inlineNote={
            range && anchor ? (
              <InlineNote
                anchor={anchor}
                note={note}
                line={range.start}
                explained={explained}
                onToggle={() => setExplained((v) => !v)}
              />
            ) : null
          }
        />
      </div>

      {/*
        What is left at the bottom of the panel.

        The explanation used to live here, pinned below the listing, and took up to
        160px — more than a third of the listing on a laptop. It now renders
        *inside* the listing, directly beneath the line it explains (`inlineNote`
        above), which returns all of that to the code.

        So the only thing left down here is the state this panel is in when there is
        no anchor yet, which is the state a student is in for the second between
        pressing play and the first frame arriving. Anything more would be
        permanent furniture occupying the bottom of a column whose job is the code.
      */}
      {!anchor ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border/80 bg-surface-raised/70 px-4 py-3 text-[13px] text-text-subtle">
          <Info className="size-3.5 shrink-0" />
          Press play — the line being executed is highlighted here in all four languages.
        </div>
      ) : null}
    </div>
  );
}

/**
 * The per-anchor explanation, inline beneath the line it explains.
 *
 * ## Why inline rather than pinned below the listing
 *
 * The product's claim is that the animation and the code are the same program, and
 * the note is what turns that from a caption into something you can verify: it says
 * what the *line* is for. Pinned at the bottom of the panel it was 150px from the
 * line it described, so the reader had to hold both in their head and re-match them
 * every step — which is precisely the work the layout was supposed to be doing for
 * them. Attached to the line, the sentence and the line are one object.
 *
 * It is not a duplicate of the narration, and worth being precise about why: the
 * narration is `frame.note` and this is `lesson.notes[lang][anchor]`. One is per
 * *step*, the other per *code region*. At any given step they describe the same
 * moment and often say much the same thing — which is the redundancy being
 * collapsed — but they are different lifetimes, so both are kept.
 *
 * ## `data-anchor` and `data-line` are contracts, not instrumentation
 *
 * The e2e suite asserts that the highlighted line is the *same step* in all four
 * languages, and it does that by comparing `data-anchor` across a language switch.
 * The line number legitimately differs per language; the anchor name must not,
 * because it names the step rather than the position. So both attributes have to
 * exist whether or not the note is expanded — a collapsed note must not make the
 * suite blind. `data-explained` is what tells a test which state it is in.
 */
function InlineNote({
  anchor,
  note,
  line,
  explained,
  onToggle,
}: {
  anchor: string;
  note: string | null;
  line: number;
  explained: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      data-anchor={anchor}
      data-line={line}
      data-explained={explained ? 'true' : 'false'}
      /*
        `whitespace-normal` and a definite `w-[56ch]`, and both are load-bearing.

        This sits inside a `<pre>`, which sets `white-space: pre` and is sized
        `min-w-max`. Two things go wrong at once if the note overrides neither: it
        inherits `pre`, so its prose never wraps; and as a block in a max-content
        parent, its own max-content *is* its unwrapped length, so it widens the whole
        listing. Measured before this fix: the note occupied 1312px, its full text on
        one line, inside a pre already 1563px wide.

        A definite width fixes the second: the max-content of a box with a definite
        width is that width, so the note contributes at most 56ch and the code, which
        is longer in every listing that scrolls horizontally, keeps deciding the
        listing's width. Where the code is shorter than 56ch the pre grows to fit the
        note, which is right: there is room for it and nothing is cut off.

        `border-l-2 border-accent/40` sits in the listing's gutter, where the active
        line's own accent bar is, so the note reads as belonging to the highlighted
        range rather than as an unrelated block nearby.
      */
      className="my-1.5 w-[56ch] max-w-full border-l-2 border-accent/40 pb-1 pl-3 font-sans whitespace-normal"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={explained}
        className="flex w-full items-center gap-1.5 rounded text-left transition-colors hover:text-text"
      >
        <Code2 className="size-3 shrink-0 text-accent" />
        <span className="text-[10.5px] text-text-subtle">line</span>
        <span className="font-mono text-[10.5px] font-bold text-accent-hover tabular-nums">
          {line}
        </span>
        <span className="text-text-faint">·</span>
        <span className="truncate font-mono text-[10.5px] text-text-muted">{anchor}</span>
        <ChevronUp
          className={[
            'ml-auto size-3 shrink-0 text-text-subtle transition-transform duration-200',
            explained ? '' : 'rotate-180',
          ].join(' ')}
        />
      </button>

      {/*
        Collapsed to a single clamped line rather than to nothing.

        The notes are long — several sentences for the meatier anchors — so an
        expanded note inline would push the rest of the listing down by more than a
        screen and make the panel unusable while reading the code. Clamping to two
        lines keeps the point visible and puts the rest one click away.
      */}
      {note ? (
        <p
          className={[
            'mt-1 text-[12.5px] leading-relaxed text-text',
            explained ? '' : 'line-clamp-2',
          ].join(' ')}
        >
          <Em text={note} />
        </p>
      ) : (
        <p className="mt-1 text-[12.5px] text-text-subtle">No explanation for this step yet.</p>
      )}
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

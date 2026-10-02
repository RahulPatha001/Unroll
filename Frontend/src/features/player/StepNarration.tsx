import {
  Activity,
  AlertTriangle,
  AlignLeft,
  ChevronDown,
  CircleCheck,
  Keyboard,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Em } from '../../lib/richText.tsx';
import { cn } from '../../lib/utils.ts';
import {
  useAlgo,
  useCurrentFrame,
  useOffThread,
  usePlayer,
  useRunError,
  useRunMs,
  useTruncated,
} from './playerStore.ts';
import { Transport } from './Transport.tsx';

/**
 * The step narration: what just happened, in one fixed-height card.
 *
 * **The height is fixed, and that is the whole point of this component's layout.**
 *
 * This used to be a content-sized block sitting above the viewport. Step lengths
 * vary enormously — the median note is 168 characters and the longest is 371 — so
 * the block grew and shrank on every single step, and the visualisation below it
 * resized with it. A student watching an algorithm being *reshaped* could not tell
 * a real change from the panel twitching, which is a genuinely awful thing to do to
 * the one part of the screen that is supposed to be trustworthy.
 *
 * So: a fixed height, and the note is clamped to the number of lines that height
 * affords. The clamp truncates *visually* only — the full sentence stays in the
 * DOM, so a screen reader announces all of it and `textContent` still returns it.
 * The layout cannot move because the container's height is not derived from its
 * content.
 *
 * **What the clamp costs is the sentence, and it costs more than `line-clamp-3`
 * suggests.** Measured in a browser rather than assumed: the note's box is 24px.
 * Two 24px chip rows, 12px of gaps and 20px of padding take 80px of the 104, and
 * what is left over is 1.2 lines of 14px text — so `line-clamp-3`, a three-*line*
 * limit, never gets to clamp anything. The longest notes in the curriculum (546
 * characters for `counting-sort`, 641 across all of them) need four lines at 1920
 * and ten at 390, and between 1.8 and 8.8 of those lines are below the edge.
 * Observed at the width the card actually has: *"…so the cheapest known way to
 * reach 1 costs 5. Extracting the"*, cut mid-word with no way back to the rest.
 *
 * Giving the note three real lines is a *card layout* decision — it needs 37px
 * more than a fixed 104px has to give, so it can only come out of the two chip
 * rows — and it is deliberately not taken here, because that height is the one
 * thing in this component which is not allowed to move. So the overflow is
 * measured and offered instead of hidden: when the sentence genuinely does not
 * fit, a button opens all of it in an overlay. Measured, not guessed, because a
 * character count is a lie — the same sentence needs four lines at 1920 and ten at
 * 390 — and a chevron shown on every step trains people to ignore the one step
 * where it mattered.
 *
 * The variable chips get the same treatment for the same reason: one row,
 * `flex-nowrap`, scrolling sideways if it overflows. A chip row that wraps adds a
 * line when an algorithm has six variables and removes it when it has four, which
 * is the same twitch by another route.
 */
export function StepNarration() {
  const frame = useCurrentFrame();
  const error = useRunError();
  const truncated = useTruncated();
  const runMs = useRunMs();
  const offThread = useOffThread();
  const index = usePlayer((s) => s.index);
  const length = usePlayer((s) => s.trace.length);

  const note = frame?.note ?? 'Press play to step through the algorithm.';
  const vars = frame?.vars && Object.keys(frame.vars).length > 0 ? frame.vars : null;

  const cardRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [clipped, setClipped] = useState(false);
  const [reading, setReading] = useState<Expanded | null>(null);

  /*
   * The measurement, re-taken after every render.
   *
   * No dependency list, deliberately. What needs re-measuring is the *element*,
   * and the element is a new one on every step: `key={index}` below remounts it so
   * the entry animation re-runs, which means the node measured for the previous
   * step is detached and this one has never been measured at all. Nothing in this
   * component's scope changes when that happens — the index did, but the index is
   * not the question — so "after every render" is the honest dependency, and a
   * list would only be able to approximate it.
   *
   * `useLayoutEffect` and not `useEffect`, because the button's presence is a
   * direct consequence of the answer: one frame later means a frame showing a
   * sentence cut off with no way to read it, which is the bug being measured out
   * of existence.
   *
   * The cost is two property reads per render, and a render happens at most once
   * per step. `setClipped` with an unchanged boolean re-renders nothing, so this
   * cannot spin.
   */
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (el) setClipped(isClamped(el));
  });

  /*
   * And again whenever the card's *width* changes.
   *
   * A `ResizeObserver` on the note itself would be the obvious choice and it
   * would be wrong: `key={index}` detaches that element on every step, and an
   * observer bound to a detached node never fires again — so it would report the
   * first step's geometry forever. The card is the stable ancestor and the note is
   * a block child of it, so the two have the same content width and the card is
   * where the observer belongs.
   *
   * The font is the other thing that changes the wrapping without changing any
   * box: Inter arrives after first paint, the fallback's metrics differ, and a
   * note measured against the fallback can be wrong in either direction. No
   * ResizeObserver can see that, so the measurement waits for the fonts and asks
   * again.
   */
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const el = noteRef.current;
      if (el) setClipped(isClamped(el));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    void document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reading) closeRef.current?.focus();
  }, [reading]);

  const closeNote = () => {
    setReading(null);
    /*
     * Back to the button that opened it — or, if it is gone, to the card.
     *
     * The button really can be gone: playback does not stop while the reader is
     * open, so the step it was opened on can be replaced by one whose sentence
     * fits the clamp box and therefore has no affordance to return to. Landing on
     * `document.body` instead would drop a keyboard user at the top of the
     * document, 80-odd Tab presses away from the card they were reading, which is
     * a worse place to be than the card itself. `tabIndex={-1}` makes the card a
     * focus target without making it a tab stop.
     */
    (triggerRef.current ?? cardRef.current)?.focus();
  };

  /*
   * The placeholder is a sentence with no algorithm behind it, so there is nothing
   * to "read in full" and no step to name.
   */
  const canExpand = clipped && frame !== null;

  return (
    <div className="relative shrink-0 border-b border-border/80 bg-surface-raised/50">
      {/*
        The accent thread.

        A 2px bar down the left edge of this card, in the same accent as the
        highlighted line's border in the code panel — and keyed on `index`, so it
        runs the same `line-locate` animation on the same `--step-beat` as the note
        and the line. Three things now move together when a step changes: this bar,
        the sentence, and the line it describes.

        That is the product's claim expressed as a timing and colour relationship
        rather than as a sentence in a README: the narration and the code are
        marked as the same moment, in the same colour, on the same beat. The two
        panes are 700px apart on a 1440 screen and nothing else on the page connects
        them visually.

        `aria-hidden`, because it carries no information the sentence does not.
      */}
      <span
        key={index}
        aria-hidden="true"
        className="line-locate pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-accent via-accent to-accent/15"
      />
      {/*
        A fixed `h`, not a `min-h`. A minimum still grows with the content, which
        is the bug being fixed here.

        `pl-5` rather than `px-4`: the thread occupies the first 2px, and 20px of
        padding clears it with room to breathe. `px-4`'s 16px would have put the
        sentence 2px from the bar.

        `tabIndex={-1}` is not focusability for its own sake: it is where focus
        lands when the reader is closed on a step whose note no longer overflows and
        the button that opened it has therefore been removed. See `closeNote`.
      */}
      <div ref={cardRef} tabIndex={-1} className="flex h-[104px] flex-col px-4 py-1.5 pl-5">
        {/*
          One metadata strip, not two, and the note below it in whatever is left.

          This card used to be three 24px rows inside 104px: a metadata row, the
          note, and a `vars` chip row. With `py-2.5` that is 20px of padding,
          24px, 6px, 6px and 24px — 80px of chrome, leaving the note **24px**, or
          about 1.2 lines at `text-[14px] leading-[1.45]`.

          Which meant `line-clamp-3` never clamped anything. A three-line clamp
          inside a 1.2-line box is not a truncation, it is a no-op with a fade on
          it, and up to 8.8 lines of a long note sat below the edge with nothing
          indicating it. The honest consequence was that the expand control had to
          appear on 86% of steps at 1440 and 95% at 390 — measured over 502
          step-visits — because on almost every step there really was something
          hidden. A control that is almost always visible is not a signal, it is
          furniture.

          So the `vars` chips moved *into* the metadata strip, where they take the
          flexible middle and scroll sideways, and the note gets the rest:

              104  the card
              -12  py-1.5
              -24  the strip
              -4   mt-1
              =64  the note, which is 3.15 lines

          Three real lines is the point at which the clamp starts meaning
          something. Measured note lengths run median 248 characters and p90 386;
          at roughly 110 characters a line that puts the *typical* note inside
          the card and leaves the affordance for the genuinely long tail.

          Nothing was dropped to get here. The step counter, the anchor, the
          result, the op count, the caption, the wall-clock and the variables are
          all still on screen, and `result: {value}` is still one visible text
          node because two e2e tests assert on that exact string.
        */}
        <div className="flex h-6 shrink-0 items-center gap-2">
          <span
            className="flex h-6 shrink-0 items-center gap-1 rounded-lg bg-surface-inset/90 px-1.5 font-mono text-[11px] tabular-nums"
            title="Step"
          >
            <span className="font-bold text-accent-hover">{length === 0 ? '—' : index + 1}</span>
            <span className="text-text-faint">/</span>
            <span className="text-text-subtle">{length || '—'}</span>
          </span>

          {frame?.anchor ? (
            <span
              className="h-6 max-w-[16rem] shrink-0 truncate rounded-md border border-accent/25 bg-accent/10 px-2 font-mono text-[11px] leading-6 text-accent-hover"
              title={frame.anchor}
            >
              {frame.anchor}
            </span>
          ) : null}

          {frame?.result ? (
            /*
              `result: {value}` in one text node, not an icon plus a bare value.
              The label is what makes the chip readable on its own, and the e2e
              suite asserts on this exact string when it walks a trace to the end —
              so the phrasing is a contract with the test, not decoration.
            */
            <span className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-success/15 px-2 text-[11px] font-semibold text-success-strong">
              <CircleCheck className="size-3" />
              result: {frame.result}
            </span>
          ) : null}

          {frame?.ops !== undefined ? (
            <span className="hidden h-6 shrink-0 items-center gap-1 rounded-lg bg-surface-inset/70 px-2 text-[11px] text-text-muted sm:flex">
              <Activity className="size-3" />
              <span className="tabular-nums">{frame.ops}</span> ops
            </span>
          ) : null}

          {/*
            The live variables, and the flexible middle of the strip.

            `min-w-0 flex-1` because a flex item's default `min-width: auto` is
            its content width: without it the chip row would refuse to give up any
            space and push the strip wider than the card. The chips are `w-max`
            and scroll sideways inside this box, which is the whole reason they can
            be numerous without wrapping — and `scroll-fade-x` so that scrolling
            costs no vertical space and the strip stays one line at every width.

            Below `sm` this collapses rather than overflowing, because the pinned
            chips either side already need most of a phone's width. The variables
            are then reachable through the expand control rather than lost.
          */}
          <div className="scroll-fade-x hidden h-6 min-w-0 flex-1 items-center sm:flex">
            {vars ? (
              <div className="flex h-6 w-max items-center gap-1.5">
                {Object.entries(vars).map(([k, v]) => (
                  <span
                    key={k}
                    className="flex h-6 shrink-0 items-center gap-1 rounded-lg border border-border-strong/70 bg-surface-inset/60 px-1.5 font-mono text-[11px] whitespace-nowrap"
                  >
                    <span className="text-info">{k}</span>
                    <span className="text-text-faint">=</span>
                    <span className="font-bold text-text-strong tabular-nums">{String(v)}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/*
            Caption and wall-clock, pinned to the right. `text-text-subtle` rather
            than `text-text-faint`: at 10px on the chrome, `faint` resolves to
            `slate-600` at roughly 2.4:1 and was one of the contrast failures the
            quality gates call out. This is the frame's own description, not a
            decorative mark, so it gets the readable step.
          */}
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-text-subtle">
            {frame?.caption ? (
              <span className="max-w-[14rem] truncate uppercase">{frame.caption}</span>
            ) : null}
            {runMs > 0 ? (
              <span title="Time to materialise the whole trace" className="tabular-nums">
                {runMs.toFixed(1)}ms
                {offThread ? ' · worker' : ''}
              </span>
            ) : null}
          </span>

          {/*
            The expand control, at the end of the strip.

            Its slot is always rendered. Rendering the button only when the note
            overflows would take 28px back out of the strip on exactly the steps
            that need it, and a strip that reflows because a *control appeared* is
            the twitch this card exists to prevent — just a horizontal one instead
            of a vertical one.
          */}
          <div className="flex h-6 w-7 shrink-0 items-center justify-center">
            {canExpand ? (
              <button
                ref={triggerRef}
                type="button"
                onClick={() =>
                  setReading({
                    note,
                    anchor: frame.anchor ?? null,
                    step: index + 1,
                    total: length,
                  })
                }
                onKeyDown={stopStepKeys}
                aria-haspopup="dialog"
                aria-expanded={reading !== null}
                aria-label="Read the whole step note"
                title="This note is cut off — read all of it"
                className={cn(
                  'flex size-6 items-center justify-center rounded-md text-text-subtle transition-colors',
                  'hover:bg-surface-overlay/80 hover:text-accent-strong',
                  reading !== null && 'bg-surface-overlay/80 text-accent-strong',
                )}
              >
                <ChevronDown className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Row 2 — the sentence. Clamped to three real lines; the full text stays in the DOM. */}
        <p
          // Remounting on every step is what re-runs the entry animation. A CSS
          // keyframe beats a JS animation library here: it costs no bundle, and
          // `index.css` already disables animations under `prefers-reduced-motion`.
          key={index}
          ref={noteRef}
          className="note-enter mt-1 line-clamp-3 min-h-0 flex-1 text-[14px] leading-[1.45] text-text"
          title={note}
          aria-live="polite"
          aria-atomic="true"
        >
          <Em text={note} />
        </p>
      </div>

      {error || truncated ? (
        <div className="flex items-center gap-2 border-t border-danger-deep/20 bg-danger-deep/10 px-4 py-1.5 text-[12px] text-danger-strong">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error ? `Run failed: ${error}` : null}
          {truncated ? 'Trace hit the 50,000-frame cap and was cut short.' : null}
        </div>
      ) : null}

      {/*
        The whole sentence, in an overlay.

        `fixed` and a sibling of the card rather than a child of it, which is what
        makes it free: the card's height is not derived from its content, so a
        dialog that paints over the page cannot move the visualisation below it,
        and `body` has `overflow: hidden`, so it cannot scroll it either. That is
        the same argument the input editor makes for being an overlay, and it is
        asserted in the e2e suite for both.

        `z-50` for the same reason `ShortcutHelp` uses it: above the code drawer
        and its scrim (`z-30`/`z-40`), so the click that opened this cannot land on
        the thing underneath.
      */}
      {reading ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Step narration"
          onKeyDown={(e) => {
            /*
             * Nothing pressed in here belongs to the player.
             *
             * The shortcut handler below is bound to `window`, so every key typed
             * inside this dialog would otherwise reach it: `r` would reset the
             * trace behind the overlay, `b` would open the sidebar beside it, and
             * Space on the close button would both activate the button and toggle
             * playback. Ignoring `BUTTON` in the global guard instead would be
             * worse — it would break Space-to-pause after any click on any
             * control, which is the most-used shortcut in the app.
             *
             * Stopping propagation here is reliable rather than lucky: React's
             * listener is on the app root, which is an ancestor of this element
             * and a *descendant* of `window`, so the event is stopped before the
             * window listener is ever reached.
             *
             * Escape and Tab are handled here, not in the global handler, because
             * the global one would then have to know this dialog exists.
             */
            e.stopPropagation();
            if (e.key === 'Escape') {
              closeNote();
            } else if (e.key === 'Tab') {
              // The close button is the only stop in here, so Tab wraps to itself.
              // Letting it run would walk focus into the controls this overlay is
              // covering, which is the failure `aria-modal` promises it will not.
              e.preventDefault();
              closeRef.current?.focus();
            }
          }}
        >
          {/*
            A real <button>, for the reason the same one is in `ShortcutHelp`: a
            backdrop div is unreachable by keyboard, so the only dismissal would be
            a keypress the student has to know about. `tabIndex={-1}` keeps it from
            being the first thing focus lands on when the dialog opens.

            But `aria-hidden` rather than a name, which is the newer treatment in
            `App.tsx` and the opposite of what `ShortcutHelp` does. A screen-reader
            user in browse mode meets a full-screen invisible control with the name
            "Close" and no way to know what it covers — and a name is exactly what
            the real affordances here already have: Escape dismisses, and the `esc`
            button below is visible and named. The scrim keeps its click target and
            leaves the tree. Left as-is in `ShortcutHelp` rather than fixed there,
            because that dialog is not what this change is about.
          */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={closeNote}
          />
          <div className="pop-in relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-xl border border-border-strong/80 bg-surface-raised p-5 shadow-2xl shadow-black/50">
            <div className="mb-3 flex items-center gap-2">
              <AlignLeft className="size-4 text-accent" />
              <h2 className="text-sm font-bold text-text">Step narration</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={closeNote}
                aria-label="Close the step narration"
                className="ml-auto rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted"
              >
                esc
              </button>
            </div>
            {/*
              Which sentence this is, and frozen. Playback does not stop while this
              is open — Space is deliberately inert in here — so a student who
              opened the reader mid-run would otherwise have the text change under
              their eyes halfway down, and a sentence that rewrites itself while it
              is being read is the one thing a reader cannot recover from.
            */}
            <p className="mb-2 font-mono text-[10.5px] text-text-subtle tabular-nums">
              step {reading.step}/{reading.total}
              {reading.anchor ? ` · ${reading.anchor}` : ''}
            </p>
            {/*
              `min-h-0 flex-1 overflow-y-auto` rather than `overflow-auto` on the
              panel: a percentage height does not resolve against a flex parent, and
              a scroll box with no definite height is the bug the code panel had —
              it grows to fit its content and the scroll never engages on that
              axis. The `max-h` on the panel is the definite height, and this part
              is the one that scrolls.
            */}
            <div className="min-h-0 flex-1 overflow-y-auto text-[14px] leading-relaxed text-text">
              <Em text={reading.note} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The note a reader opened, snapshotted. See the `reading` state above. */
interface Expanded {
  note: string;
  /** The semantic step, or `null` for a frame that names none. */
  anchor: string | null;
  step: number;
  total: number;
}

/**
 * Is the sentence genuinely clipped?
 *
 * `scrollHeight > clientHeight`, and nothing inferred from the text. A character
 * count cannot work — the same sentence needs four lines at 1920 and ten at 390 —
 * and neither can the clamp itself: `line-clamp-3` is a *maximum*, and the box is
 * already shorter than three lines (see the note at the top of this file), so the
 * honest question is not "is it longer than three lines" but "is there anything
 * below the edge", and only the element knows that.
 */
function isClamped(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight;
}

/**
 * The keys the global shortcut handler owns.
 *
 * A `<button>` is not in its typing guard, and it does not need to be: adding
 * `BUTTON` there would mean Space stopped pausing playback whenever a control
 * happened to hold focus, which is after every click in the app. The narrow fix is
 * for the control to keep those keys to itself — `stopPropagation`, not
 * `preventDefault`, so the browser still turns Space into a click and the button
 * activates exactly as a button should.
 *
 * `Enter` is in the list for the same reason even though nothing binds it: it is
 * the other half of "activate this control", and the rule should not depend on
 * which bindings happen to exist today.
 */
const STEP_KEYS = new Set([
  ' ',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function stopStepKeys(e: React.KeyboardEvent) {
  if (STEP_KEYS.has(e.key)) e.stopPropagation();
}

/* ------------------------------------------------------------------ *
 * Keyboard control
 * ------------------------------------------------------------------ */

/**
 * Global, because a student watching an animation should be able to step without
 * reaching for the mouse — stepping *is* the activity. Every binding is listed in
 * the help sheet so it is discoverable, which is the only reason shortcuts exist
 * at all.
 *
 * Inputs are ignored on purpose: typing "r" into the input editor must not reset
 * playback.
 */
const JUMP = 10;

export function useKeyboardShortcuts(onOpenCode?: () => void): void {
  const onOpenCodeRef = useRef(onOpenCode);
  onOpenCodeRef.current = onOpenCode;
  const dispatch = usePlayer((s) => s.dispatch);
  const setLang = usePlayer((s) => s.setLang);
  const lang = usePlayer((s) => s.lang);
  const setShortcutsOpen = usePlayer((s) => s.setShortcutsOpen);
  const togglePointerLabels = usePlayer((s) => s.togglePointerLabels);
  const setSidebarOpen = usePlayer((s) => s.setSidebarOpen);
  const sidebarOpen = usePlayer((s) => s.sidebarOpen);
  const toggleInput = usePlayer((s) => s.toggleInput);
  // Read inside the handler through a ref, so toggling does not have to
  // re-subscribe the listener on every change.
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const cycleLang = useRef(lang);
  cycleLang.current = lang;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /*
       * Escape is handled *before* the typing guard, and it has to be.
       *
       * The guard below is right for everything else: typing "r" into the custom
       * input must not rewind playback. But the editor focuses its first box the
       * moment it opens, so with Escape behind that guard the key did nothing at
       * all — open the editor with `I`, press Escape, and the sheet stayed put
       * until you clicked somewhere else first. A dismissal that only works if
       * you first give up focus is not a dismissal.
       *
       * Escape is also the one key that is never a character anyone means to
       * type, so there is no conflict to lose.
       */
      if (e.key === 'Escape') {
        setShortcutsOpen(false);
        usePlayer.getState().setInputOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
          return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          dispatch({ type: 'toggle' });
          break;
        case 'ArrowRight':
          e.preventDefault();
          dispatch({
            type: e.shiftKey ? 'jump' : 'stepForward',
            ...(e.shiftKey ? { delta: JUMP } : {}),
          } as never);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          dispatch({ type: 'stepBack' });
          break;
        case 'Home':
          e.preventDefault();
          dispatch({ type: 'first' });
          break;
        case 'End':
          e.preventDefault();
          dispatch({ type: 'last' });
          break;
        case 'r':
        case 'R':
          dispatch({ type: 'reset' });
          break;
        case 'l':
        case 'L': {
          const order = ['javascript', 'python', 'java', 'cpp'] as const;
          const i = order.indexOf(cycleLang.current);
          setLang(order[(i + 1) % order.length] ?? 'javascript');
          break;
        }
        case 'p':
        case 'P':
          togglePointerLabels();
          break;
        case 'c':
        case 'C':
          onOpenCodeRef.current?.();
          break;
        case 'b':
        case 'B':
          setSidebarOpen(!sidebarOpenRef.current);
          break;
        case 'i':
        case 'I':
          /*
           * `preventDefault` is load-bearing here, not hygiene.
           *
           * This handler opens the editor, React renders it, and the editor's own
           * effect focuses its first box — all of which happens before the browser
           * dispatches the text-insertion default action for the keypress. Without
           * this line the letter lands *in the box*: pressing `I` opened a form
           * containing `i12, 17, 95, …` with an error complaining about `"i12"`,
           * which is a thoroughly baffling way to start typing an array.
           *
           * The other letter shortcuts do not need this, because none of them move
           * focus into a text field. `Space` and `?` already had it for the same
           * class of reason.
           */
          e.preventDefault();
          toggleInput();
          break;
        case '?':
          e.preventDefault();
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, setLang, setShortcutsOpen, togglePointerLabels, setSidebarOpen, toggleInput]);
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['←  →', 'Step one frame back / forward'],
  ['Shift + ←  →', 'Jump 10 frames'],
  ['Home / End', 'First / last frame'],
  ['R', 'Reset to the start'],
  ['L', 'Cycle language'],
  ['I', 'Type your own input'],
  ['C', 'Show or hide the code panel'],
  ['P', 'Toggle pointer labels'],
  ['B', 'Toggle the sidebar'],
  ['Esc', 'Close whatever is open'],
  ['?', 'This help'],
];

export function ShortcutHelp({ onOpenCode }: { onOpenCode?: () => void } = {}) {
  const open = usePlayer((s) => s.shortcutsOpen);
  const setOpen = usePlayer((s) => s.setShortcutsOpen);
  const algo = useAlgo();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      {/*
        The backdrop is a real <button>, not a div with an onClick. A div is
        unreachable by keyboard and invisible to a screen reader, so a student who
        opened the sheet with `?` could not dismiss it without knowing to press
        Escape.
      */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <div className="pop-in relative w-full max-w-sm rounded-xl border border-border-strong/80 bg-surface-raised p-5 shadow-2xl shadow-black/50">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="size-4 text-accent" />
          <h2 className="text-sm font-bold text-text">Keyboard</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-inset hover:text-text-muted"
          >
            esc
          </button>
        </div>
        <dl className="space-y-1">
          {SHORTCUTS.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center gap-3 rounded px-1 py-0.5 text-[12px] transition-colors hover:bg-surface-inset/50"
            >
              <dt className="w-28 shrink-0">
                <kbd className="rounded border border-border-strong bg-surface-inset px-1.5 py-0.5 font-mono text-[10.5px] text-accent-hover">
                  {k}
                </kbd>
              </dt>
              <dd className="text-text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onOpenCode?.();
          }}
          className="mt-4 w-full rounded-lg border border-border-strong px-2 py-1.5 text-[11px] text-text-muted transition-colors hover:border-border-subtle hover:bg-surface-inset"
        >
          Open the code panel
        </button>
        {algo ? (
          <p className="mt-4 border-t border-border pt-3 text-[11px] text-text-subtle">
            {algo.title} · {algo.presets.length} presets · {algo.expectations.length} verified cases
            across JavaScript, Python, Java and C++.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { Transport };

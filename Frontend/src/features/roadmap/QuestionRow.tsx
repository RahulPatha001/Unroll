import { ArrowUpRight, Check } from 'lucide-react';
import type { Question } from '../../core/roadmap/index.ts';
import { cn } from '../../lib/utils.ts';
import { LevelBadge, PlatformBadge } from './badges.tsx';
import { useIsSolved, useSolved } from './progressStore.ts';

/**
 * One question: a tick box, the title, and the two badges.
 *
 * ## The link and the checkbox are separate targets, on purpose
 *
 * Making the whole row a link and putting the checkbox *inside* it is the obvious
 * compact design, and it is wrong: clicking near the tick would navigate away, which
 * is the worst possible outcome for the control the reader came to use. So the anchor
 * covers the title and the badges, and the tick is a sibling checkbox with its own hit
 * area. Both are large enough to hit on a phone.
 *
 * ## `target="_blank"` with an explicit `rel`
 *
 * These are the only outbound links in the app, and they are outward by design: the
 * whole point of the row is to leave for LeetCode. `noopener` is what stops the opened
 * page reaching back through `window.opener`, and `noreferrer` is included because a
 * practice platform has no business learning which page sent the traffic.
 *
 * ## The tick is a real `<input type="checkbox">`
 *
 * The first draft was a `<button role="checkbox">`, and Biome correctly rejected it: a
 * checkbox gets Space, the checked state, and form semantics for free, and announcing
 * a button as a ticked box is exactly the kind of ARIA override that reads as fine and
 * is worse in a screen reader. `appearance-none` restyles it into the design without
 * giving up any of that.
 *
 * The visible glyph is a sibling positioned over the box rather than a child, because
 * an `<input>` has no children by definition. It is `aria-hidden`, so it contributes
 * the mark and nothing else.
 *
 * ## Why the selector is `useIsSolved` and the writer is not a hook
 *
 * The read goes through a primitive selector so one tick re-renders one row out of
 * three hundred. The write deliberately does not: `useSolved.getState().toggleSolved`
 * is called from `onChange`, where reading the store imperatively is correct — a hook
 * cannot be called from an event handler, and a helper named `use*` that is not a hook
 * is worse than no helper at all.
 */
export function QuestionRow({ question }: { question: Question }) {
  const solved = useIsSolved(question.id);

  return (
    <li
      className={cn(
        'group/q flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors duration-150',
        solved
          ? 'border-success/25 bg-success/5'
          : 'border-transparent hover:border-border-strong/60 hover:bg-surface-inset/40',
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={solved}
          aria-label={`${question.title} — solved`}
          onChange={() => useSolved.getState().toggleSolved(question.id)}
          className={cn(
            'peer size-5 cursor-pointer appearance-none rounded-[6px] border transition-all duration-150 active:scale-90',
            'checked:border-success checked:bg-success',
            'hover:border-accent hover:bg-accent/10',
            'checked:hover:bg-success',
            'border-border-subtle',
          )}
        />
        {/*
          Keyed on `solved` so the glyph re-mounts and re-runs `tick-pop` on every tick.
          Without the key the `Check` is the same element and the animation plays once,
          on the first question ever ticked, and never again. A keyed remount is the
          only way to re-run an entrance animation with CSS.

          `peer-checked:` would be the declarative way to show it, but it cannot
          re-trigger an animation on a state change from false to true — a CSS
          transition runs once when the property changes, not again when it changes
          back. The remount is the mechanism.
        */}
        {solved ? (
          <Check
            key="on"
            aria-hidden="true"
            className="tick-pop pointer-events-none absolute size-3.5 text-text-inverse"
            strokeWidth={3}
          />
        ) : null}
      </span>

      <a
        href={question.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] leading-snug"
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate transition-colors duration-150 group-hover/q:text-text-strong',
            solved ? 'text-text-subtle line-through' : 'text-text-muted',
          )}
          title={question.title}
        >
          {question.title}
        </span>
        <LevelBadge level={question.level} />
        <PlatformBadge platform={question.platform} />
        {/*
          The arrow is decorative and only appears on hover, so it is `aria-hidden` —
          an icon that appears on focus but not on hover would otherwise be a state a
          keyboard user can perceive and a mouse user cannot.
        */}
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-text-subtle opacity-0 transition-opacity duration-150 group-hover/q:opacity-100"
        />
      </a>
    </li>
  );
}

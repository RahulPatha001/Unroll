import {
  LEVEL_LABEL,
  type Level,
  PLATFORM_HOST,
  PLATFORM_LABEL,
  type Platform,
  type Question,
} from '../../core/roadmap/index.ts';
import { cn } from '../../lib/utils.ts';

/**
 * The small vocabulary the roadmap's rows share.
 *
 * ## Why the level is expressed twice
 *
 * Once as colour and once as a word. Colour alone fails a reader who cannot
 * distinguish the three hues, which is a real accessibility requirement rather than a
 * theoretical one — and a roadmap that says "medium" as a *label* is also far more
 * scannable than three differently-tinted boxes. So the badge carries both, and the
 * colour is decorative on top of a legible word rather than carrying the meaning.
 *
 * The palette maps onto tokens rather than picking hues per platform, because
 * `index.css` documents that a token named after its colour cannot be re-themed and
 * that `tokens.test.ts` fails a token typo silently. Difficulty is the one axis here
 * with an obvious green→amber→rose ordering and three existing tokens for it.
 */

/** Token classes for a difficulty badge. */
const LEVEL_STYLE: Record<Level, { chip: string; dot: string }> = {
  easy: {
    chip: 'border-success/30 bg-success/10 text-success-strong',
    dot: 'bg-success',
  },
  medium: {
    chip: 'border-accent/35 bg-accent/10 text-accent',
    dot: 'bg-accent',
  },
  hard: {
    chip: 'border-danger/35 bg-danger/10 text-danger-strong',
    dot: 'bg-danger',
  },
};

/**
 * A platform badge.
 *
 * The label is the platform's own name rather than an initial, because an initial
 * (`L` for LeetCode, `I` for InterviewBit) is not distinguishable at 9px and the whole
 * point of the badge is to say which site to go to. The host is on the `title` so a
 * reader can confirm the destination before clicking — which matters here more than
 * elsewhere, because these are the only links in the app that leave the site.
 */
export function PlatformBadge({
  platform,
  compact = false,
}: {
  platform: Platform;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border border-border-strong/70 bg-surface-inset/60 font-medium text-text-subtle',
        compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
      )}
      title={`${PLATFORM_LABEL[platform]} — ${PLATFORM_HOST[platform]}`}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

/** A difficulty badge. The word is the message; the colour is decoration. */
export function LevelBadge({ level }: { level: Level }) {
  const style = LEVEL_STYLE[level];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-px text-[9.5px] font-bold uppercase',
        style.chip,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', style.dot)} />
      {LEVEL_LABEL[level]}
    </span>
  );
}

/** The three dots that summarise a topic's difficulty spread when collapsed. */
export function LevelSpread({ questions }: { questions: Question[] }) {
  const counts = (['easy', 'medium', 'hard'] as const).map((l) => ({
    level: l,
    n: questions.filter((q) => q.level === l).length,
  }));
  return (
    <span className="flex shrink-0 items-center gap-2" aria-hidden="true">
      {counts.map(({ level, n }) => (
        <span key={level} className="flex items-center gap-1">
          <span
            className={cn('size-1.5 rounded-full', LEVEL_STYLE[level].dot, n === 0 && 'opacity-25')}
          />
          <span className="font-mono text-[9.5px] text-text-subtle">{n}</span>
        </span>
      ))}
    </span>
  );
}

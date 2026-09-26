/**
 * `prefers-reduced-motion`.
 *
 * This app's entire purpose is motion, so the media query is not a nice-to-have:
 * for a student who gets vestibular symptoms from animation it is the difference
 * between usable and unusable. CSS transitions are already neutralised in
 * `index.css`; this module handles the half CSS cannot reach — the *playback
 * clock itself*.
 *
 * The behaviour is not "turn it off". A visualiser that refuses to animate is a
 * static picture, and the whole point is watching the data structure change. So
 * playback still advances, but at a fixed, slow, deliberate rate with no
 * interpolation, and the speed control is disabled rather than ignored — a
 * control that appears to work and does not is worse than one that explains
 * itself.
 */

/** Matches the CSS: the same rhythm, so the two cannot drift apart. */
const REDUCED_STEPS_PER_SECOND = 1;

let query: MediaQueryList | null = null;

export function reducedMotionQuery(): MediaQueryList {
  query ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return query;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return reducedMotionQuery().matches;
}

export function onReducedMotionChange(fn: (reduced: boolean) => void): () => void {
  const mq = reducedMotionQuery();
  const handler = () => fn(mq.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

export { REDUCED_STEPS_PER_SECOND };

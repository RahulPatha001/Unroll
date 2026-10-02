/**
 * `localStorage`, defensively.
 *
 * A visualiser that throws on load because a browser is in private mode is a
 * visualiser that does not work for that user at all, and the failure is invisible
 * in development because nobody tests in private mode. So every access here is
 * wrapped, and a storage failure degrades to "no saved state" rather than to an
 * exception.
 *
 * ## Why not just try/catch at each call site
 *
 * Because there are four distinct failure modes and only one of them is obvious:
 *
 *  1. **Reading a missing key** throws in some legacy browsers and returns `null`
 *     in modern ones. `getItem` handles it, but a *direct* `localStorage.x` read
 *     throws.
 *  2. **Writing** throws when the quota is exhausted — which a student can
 *     actually cause, since a custom-input share URL is base64 and the recent
 *     list stores full URLs. This is the realistic one.
 *  3. **Touching the property** throws outright when storage is disabled by
 *     policy or in Safari's private mode, and that throw happens on *access*,
 *     before any method is called. So even `try { localStorage.getItem() }` has
 *     to be inside the `try`, and so does the guard that decides whether storage
 *     is usable at all.
 *  4. **Corrupt data** — someone edited it, or a future version changed the
 *     shape. `JSON.parse` throws on both.
 *
 * The contract below is therefore: this module never throws, and it reports
 * failure to its caller as a return value so a feature can decide what to do.
 * Callers that can recover (recently viewed) ignore the failure; callers that
 * cannot (a value the user is about to rely on) surface it.
 */

/** Whether storage can be reached at all. Probed once, lazily. */
let available: boolean | null = null;

/**
 * Is `localStorage` reachable?
 *
 * The probe *writes*. A read-only check is not enough: some privacy settings
 * allow reading `localStorage` but throw on write, and a "readable" verdict would
 * then hand every caller a promise it cannot keep. The probe writes and removes a
 * throwaway key, which is the only test that actually proves the round trip.
 *
 * `typeof window` is checked first because this module is imported by unit tests
 * running in plain Node, where `localStorage` does not exist at all and where the
 * correct answer is "no".
 */
export function storageAvailable(): boolean {
  if (available !== null) return available;
  if (typeof window === 'undefined' || !window.localStorage) {
    available = false;
    return available;
  }
  try {
    const probe = '__unroll_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Read and parse a JSON value.
 *
 * Returns `null` for every failure — absent, unparseable, wrong shape — and the
 * caller supplies its own default. There is deliberately no way to distinguish
 * "nothing saved yet" from "the saved value is garbage", because nothing in this
 * app needs to: both mean the same thing to a student, which is that there is
 * nothing to restore.
 */
export function readJson<T>(key: string, validate: (v: unknown) => v is T): T | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    // `JSON.parse` on a truncated or hand-edited value.
    return null;
  }
}

/**
 * Write a JSON value.
 *
 * `false` means the write did not happen, which is a real and reachable outcome
 * (case 2 above) and not an error the user did anything wrong about. Callers that
 * show a "saved" indicator should check this; the favourite star in this app
 * does, because a star that says "saved" and then forgets is worse than no star.
 */
export function writeJson(key: string, value: unknown): boolean {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove a key. Never throws; a failure here is not actionable. */
export function removeKey(key: string): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do. The value is unreachable either way.
  }
}

/**
 * A validator for "an array of strings".
 *
 * Written as a factory rather than a shared constant because the real
 * requirement is usually narrower than "array of strings" — a recent-views list
 * wants a bounded length, and a caller that cannot express its own bound should
 * not be handed a permissive one that silently grows forever.
 */
export function stringArray(max = 200): (v: unknown) => v is string[] {
  return (v: unknown): v is string[] =>
    Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string');
}

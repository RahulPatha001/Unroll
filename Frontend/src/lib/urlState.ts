import { z } from 'zod';
import { CATALOG_BY_ID } from '../core/algorithms/catalog.ts';
import { LANGS, type Lang } from '../core/code/anchors.ts';
import type { AlgoInput } from '../core/input/types.ts';
import type { Speed } from '../core/trace/player.ts';

/**
 * URL as state (plan §5.6).
 *
 * Every visualiser state is serialisable, so share links, deep linking and
 * browser back/forward all fall out of the query string with no backend and no
 * storage layer. Note that `frame` is in here: a share link can point at a
 * *specific step*, so "look at this exact moment" is a link, not a screenshot.
 *
 * Parsed and validated with zod so a hand-edited or truncated URL degrades to
 * defaults instead of throwing inside a React render.
 */

const cell = z.union([z.number(), z.string()]);

/**
 * `params` travels as a JSON *string*, because a query parameter is a string.
 *
 * This asymmetry was a live bug for as long as the URL was read but never
 * written: `writeUrlState` has always emitted `params={"size":8}`, and the schema
 * asked for a record — an object. Every read therefore failed validation and fell
 * through to `urlStateSchema.parse({})`, which is to say *every field was reset to
 * its default*. It stayed invisible precisely because nothing called
 * `writeUrlState`, so no URL in the wild ever contained a `params` key to trip it.
 * The moment the URL started being written — which is what the custom-input
 * feature needs — every link carrying a param silently lost the algorithm, the
 * preset, the language and the input along with it.
 *
 * So the schema accepts either shape, and a string that is not JSON is dropped
 * rather than thrown, since a hand-edited `params` should cost the student their
 * parameters and nothing else.
 */
const jsonParams = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}, z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional());

/**
 * `speed` is validated against the *actual* set the player offers, not a range.
 *
 * `Speed` is the union `1 | 2 | 4 | 8 | 16 | 32 | 60` and `setSpeed` takes that
 * union, so a schema accepting any integer in 1..60 type-checks only because the
 * value was cast somewhere — and at runtime `?speed=7` would leave the transport in
 * a state the UI cannot display and `stepInterval` has no case for.
 *
 * The `preprocess` is not optional. A query parameter arrives as a *string*, so
 * `z.literal(4)` does not match `"4"`: swapping the old `z.coerce.number()` for
 * bare literals fails validation on every real link and silently resets all of it
 * to defaults, which is a spectacular way to lose a feature. Coerce first, then
 * check membership — and a hand-edited link loses its speed and nothing else.
 */
const SPEED_SET: readonly number[] = [1, 2, 4, 8, 16, 32, 60];

/**
 * `speed` is validated against the *actual* set the transport offers, not a range.
 *
 * `Speed` is the union `1 | 2 | 4 | 8 | 16 | 32 | 60` and `setSpeed` takes that
 * union, so a schema accepting any integer in 1..60 type-checks only because the
 * value was cast somewhere — and at runtime `?speed=7` would leave the transport in
 * a state the UI cannot draw and `stepInterval` has no case for.
 *
 * Two details, both of which were wrong in the first attempt and are the reason
 * this needed a test rather than a glance:
 *
 *  - **Coerce before checking.** A query parameter arrives as a *string*, so
 *    `z.literal(4)` does not match `"4"`. Validating the set with bare literals
 *    fails on every real link and silently resets all of it to defaults, which is
 *    a spectacular way to lose a feature.
 *  - **Filter to `undefined` rather than rejecting.** A speed the transport does
 *    not offer must cost the student their speed and *nothing else*. Letting the
 *    union reject fails the whole object, so `?algo=kadane&speed=7` also lost the
 *    algorithm and the preset — the same all-or-nothing trap `jsonParams` avoids.
 */
const speedSchema = z
  .preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return SPEED_SET.includes(n) ? n : undefined;
  }, z.number().optional())
  // The one cast in this file, and it is safe by construction: the preprocess
  // above has already reduced the value to a member of SPEED_SET or undefined.
  // Narrowing here is what lets `setSpeed(state.speed)` type-check with no cast at
  // the call site, which is the whole reason for validating the set at all.
  .transform((v) => v as Speed | undefined);

export const urlStateSchema = z.object({
  algo: z.string().default('bubble-sort'),
  preset: z.string().optional(),
  lang: z.enum(LANGS).default('javascript'),
  frame: z.coerce.number().int().min(0).optional(),
  speed: speedSchema,
  loop: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => v === '1'),
  params: jsonParams,
  /** The input, when the user has customised it away from the preset. */
  input: z.string().optional(),
  v: z.string().optional(),
});

export type UrlState = z.infer<typeof urlStateSchema>;

/** The `params` record, or undefined — every param is optional. */
export function paramsOf(state: UrlState): Record<string, number | string | boolean> | undefined {
  return state.params;
}

const INPUT_VERSION = '1';

export function readUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const raw: Record<string, string> = {};
  for (const [k, v] of params) raw[k] = v;
  const parsed = urlStateSchema.safeParse(raw);
  if (!parsed.success) return urlStateSchema.parse({});
  const state = parsed.data;
  // An unknown algorithm id is a stale link, not an error. Fall back rather than
  // rendering an error page for something the student cannot fix.
  if (!CATALOG_BY_ID[state.algo]) return { ...state, algo: 'bubble-sort' };
  return state;
}

export function writeUrlState(state: Partial<UrlState>, input?: AlgoInput): string {
  const params = new URLSearchParams();
  if (state.algo) params.set('algo', state.algo);
  if (state.preset) params.set('preset', state.preset);
  if (state.lang) params.set('lang', state.lang);
  if (state.frame !== undefined && state.frame > 0) params.set('frame', String(state.frame));
  if (state.speed !== undefined) params.set('speed', String(state.speed));
  if (state.loop) params.set('loop', '1');
  if (state.params && Object.keys(state.params).length > 0) {
    params.set('params', JSON.stringify(state.params));
  }
  if (input) {
    params.set('v', INPUT_VERSION);
    params.set('input', encodeInput(input));
  }
  return `?${params.toString()}`;
}

function encodeInput(input: AlgoInput): string {
  // base64 keeps the URL readable-ish and avoids every escaping question that
  // JSON-in-a-query-param invites.
  const json = JSON.stringify(input);
  return base64UrlEncode(json);
}

export function decodeInput(encoded: string): AlgoInput | null {
  try {
    const json = base64UrlDecode(encoded);
    const parsed = inputSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/* A permissive but real validator: enough to reject garbage, not so much that
 * adding a new input shape becomes a breaking change. */
const inputSchema = z.union([
  z.object({ type: z.literal('numbers'), values: z.array(z.number()) }),
  z.object({ type: z.literal('chars'), values: z.string() }),
  z.object({ type: z.literal('words'), values: z.array(z.string()) }),
  z.object({ type: z.literal('keys'), values: z.array(cell) }),
  z.object({ type: z.literal('tree'), values: z.array(cell) }),
  z.object({
    type: z.literal('matrix'),
    rows: z.array(z.number()),
    cols: z.number(),
    values: z.array(z.number()),
  }),
  z.object({
    type: z.literal('grid'),
    rows: z.number(),
    cols: z.number(),
    values: z.array(cell.nullable()),
  }),
  z.object({
    type: z.literal('graph'),
    nodes: z.array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        x: z.number(),
        y: z.number(),
      }),
    ),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        weight: z.number().optional(),
        directed: z.boolean(),
      }),
    ),
    directed: z.boolean(),
    weighted: z.boolean(),
  }),
]);

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(s: string): string {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isLang(v: string): v is Lang {
  return (LANGS as readonly string[]).includes(v);
}

/** A short, human-readable share text. */
export function shareText(algoTitle: string, frameNote: string): string {
  return `${algoTitle} — step: ${frameNote}`;
}

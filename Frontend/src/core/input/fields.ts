import type { CellValue } from '../trace/types.ts';
import { circleNodes } from './generators.ts';
import type { AlgoGraphEdge, AlgoInput, InputField, InputSpec } from './types.ts';
import { graph } from './types.ts';

/**
 * The custom-input layer: editable text in, a validated `AlgoInput` out.
 *
 * ## Why this file exists
 *
 * Every algorithm already declares the shape of its own input (`InputSpec`) and
 * every algorithm already has a way to apply one (`setInput`). What was missing
 * was the thing in between: nothing rendered `InputSpec.fields`, so there was no
 * way to *type* an input, and `writeUrlState` — which can already serialise one
 * — was dead code.
 *
 * So this is the piece that makes a declared input editable without adding a
 * form control to any of the 56 modules. Two directions:
 *
 * ```
 *   AlgoInput ──seedFieldText──► text ──parseFieldText──► values
 *                                        │
 *                                        └──inputSpec.build──► AlgoInput
 * ```
 *
 * The editor only ever holds the *text*. That is a deliberate simplification:
 * one uniform representation for all six field kinds, so there is no per-kind
 * state to keep in sync, and the thing the student sees in the box is literally
 * the thing that gets parsed.
 *
 * ## The direction that does not exist
 *
 * `InputSpec` has `build` (fields → input) but no `read` (input → fields). The
 * obvious fix is to add a `read` to the interface — and that would mean editing
 * all 56 modules to satisfy a new required member, for something the framework
 * can derive on its own from the `AlgoInput` union. `seedFieldText` does that
 * instead, which is why adding a new algorithm still needs no editor work.
 *
 * ## Round-tripping is the contract
 *
 * `seedFieldText` followed by `parseFieldText` and `build` must return the input
 * it started from. `fields.test.ts` asserts exactly that for every registered
 * algorithm on every preset, which is what makes the positional rules below
 * (a `text` field consumes the *n*th string of a `words` input, a `words` field
 * on a `grid` input consumes its rows) safe rather than clever.
 */

/** Editor state: one raw string per declared field. */
export type FieldText = Record<string, string>;

/**
 * Is `input` still the preset's own data, or has the student replaced it?
 *
 * Shared by the header badge and the URL writer, which must agree exactly: if
 * the header says "yours" while the link carries no custom input, one of the two
 * is lying, and the student has no way to tell which.
 *
 * A value comparison rather than a tracked flag, deliberately. A flag has to be
 * set by every code path that can change the input — the editor, the shuffle
 * button, a preset click, a restored link — and the one that forgets is the one
 * that misreports the state to the user.
 */
export function isPresetInput(preset: AlgoInput | undefined, input: AlgoInput): boolean {
  if (!preset) return true;
  return JSON.stringify(preset) === JSON.stringify(input);
}

/**
 * Generous ceiling on a single field's text.
 *
 * Not a correctness limit — the real one is `MAX_FRAMES` in the trace layer,
 * which truncates rather than throws. This exists so that pasting a megabyte of
 * text into a textarea cannot lock the main thread while React re-renders, and
 * so the error message can say something useful instead of silently truncating.
 */
export const MAX_FIELD_CHARS = 20_000;

/**
 * Past this, warn that a run is likely to be truncated.
 *
 * This used to be `CANVAS_THRESHOLD` and it used to promise that the viewport
 * would switch to a canvas renderer. It does not. There is no canvas in this
 * codebase — no `<canvas>`, no `getContext`, nothing — and there has not been
 * for the whole life of the project. The constant survived in three places
 * (`docs/architecture.md`, this file, and twenty algorithm `help:` strings)
 * after the feature it described was never built, which is the worst kind of
 * documentation: confidently wrong, and impossible to discover by reading the
 * source it describes.
 *
 * The threshold itself is sound, though, and so is the warning — just not
 * about rendering. The real ceiling is `MAX_FRAMES` in the trace layer, which
 * truncates rather than throws, so a large input produces a run that quietly
 * stops early. That is worth warning about, because a student who hits it sees
 * a trace that ends mid-algorithm with no indication that it was cut short.
 *
 * Above the threshold a single cell is also below the point where the viewport
 * can stay legible: cells shrink to a 12px floor, then drop to a compact grid
 * with no room for a label. So the number still means something — just not
 * what it used to claim.
 */
export const LARGE_INPUT_THRESHOLD = 150;

/* ------------------------------------------------------------------ *
 * Seeding: AlgoInput → the text the editor opens with
 * ------------------------------------------------------------------ */

export function seedFieldText(spec: InputSpec, input: AlgoInput): FieldText {
  const out: FieldText = {};
  // `text` fields consume a `words` input's strings positionally: an algorithm
  // with a `text` and a `pattern` field declares two of them and reads
  // `values[0]` and `values[1]`. Counting same-kind fields is what makes the
  // second box show the pattern rather than the text again.
  let textCursor = 0;

  for (const field of spec.fields) {
    out[field.key] = seedOne(field, input, () => textCursor++);
  }
  return out;
}

function seedOne(field: InputField, input: AlgoInput, takeTextSlot: () => number): string {
  switch (field.kind) {
    case 'graph':
      return input.type === 'graph' ? edgeListText(input) : '';

    case 'text': {
      const slot = takeTextSlot();
      if (input.type === 'chars') return input.values;
      if (input.type === 'words') return input.values[slot] ?? '';
      return typeof field.default === 'string' ? field.default : '';
    }

    case 'words': {
      if (input.type === 'words') return input.values.join('\n');
      // The one non-obvious case. `flood-fill` declares a `words` field whose
      // entries are *grid rows* — `..#..` — and rebuilds a grid from them, so
      // the editor has to hand the rows back as words. Mirrors that module's own
      // `rowsOf`, including its choice of glyph for an empty cell.
      if (input.type === 'grid') return gridRows(input).join('\n');
      return Array.isArray(field.default) ? field.default.join('\n') : '';
    }

    case 'numbers': {
      if (input.type === 'numbers' || input.type === 'keys' || input.type === 'tree') {
        return input.values.map(String).join(', ');
      }
      return Array.isArray(field.default) ? field.default.join(', ') : '';
    }

    case 'keys': {
      if (input.type === 'keys' || input.type === 'numbers' || input.type === 'tree') {
        return input.values.map(String).join(', ');
      }
      return Array.isArray(field.default) ? field.default.join(', ') : '';
    }

    case 'number': {
      /*
       * The one field kind that genuinely cannot be recovered from the input,
       * and it is worth being honest about rather than papering over.
       *
       * `detect-cycle` declares `cycleBack` ("which index the last node links
       * back to") as an input field, but its `build` throws the value away: the
       * generator reads it from `ctx.params.cycleBack`, because the cycle is a
       * property of the *list wiring*, not of the values. So the input is just
       * `[3, 2, 1]` whether or not there is a cycle, and the number is genuinely
       * not in there to be recovered.
       *
       * Falling back to the declared default is the only honest option, and it
       * is why `paramKeysFrom` exists: the editor has to push this one field at
       * the *param* as well, or setting it in the editor would do nothing at all.
       */
      return String(field.default);
    }

    default:
      return '';
  }
}

/**
 * A grid rendered as one string per row.
 *
 * The rule is "is anything here?", and it has to be one rule because the two grid
 * algorithms in the curriculum encode that differently:
 *
 *  - `flood-fill` uses `null` for a wall and a dot for open space.
 *  - `number-of-islands` uses `0` for water and `1` for land, because its four
 *    language listings take an `int[]` and `null` does not survive the trip to
 *    C++ or Java.
 *
 * Both mean the same thing — nothing here, or something here — so one predicate
 * serves both: null, zero and a hash are *absent*; anything else is *present*.
 *
 * Found by the round-trip test rather than by reading the code, and the first
 * version was wrong in a way that would have shipped: it treated only `null` as a
 * wall, so a 0/1 grid came back as solid land and the editor cheerfully showed
 * Number of Islands with every cell its own island.
 */
function gridRows(input: Extract<AlgoInput, { type: 'grid' }>): string[] {
  const out: string[] = [];
  for (let r = 0; r < input.rows; r++) {
    let line = '';
    for (let c = 0; c < input.cols; c++) {
      line += cellIsPresent(input.values[r * input.cols + c]) ? '.' : '#';
    }
    out.push(line);
  }
  return out;
}

/** "Is anything here?" — the one question both grid encodings answer. */
function cellIsPresent(v: CellValue | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  return v !== '#';
}

/* ------------------------------------------------------------------ *
 * Parsing: text → field values
 * ------------------------------------------------------------------ */

export interface GraphOptions {
  directed: boolean;
  weighted: boolean;
}

export type ParseResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

export function parseFieldText(
  spec: InputSpec,
  text: FieldText,
  opts: { graph?: GraphOptions } = {},
): ParseResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of spec.fields) {
    const raw = text[field.key] ?? '';
    if (raw.length > MAX_FIELD_CHARS) {
      errors[field.key] =
        `Too long — ${raw.length.toLocaleString()} characters, the limit is ${MAX_FIELD_CHARS.toLocaleString()}.`;
      continue;
    }

    switch (field.kind) {
      case 'numbers': {
        const parsed = parseNumbers(raw);
        if (typeof parsed === 'string') errors[field.key] = parsed;
        else values[field.key] = parsed;
        break;
      }
      case 'keys': {
        const parsed = parseKeys(raw);
        if (typeof parsed === 'string') errors[field.key] = parsed;
        else values[field.key] = parsed;
        break;
      }
      case 'words': {
        values[field.key] = splitWords(raw);
        break;
      }
      case 'text': {
        // Trimmed, because a textarea's trailing newline is an artefact of
        // pressing Enter and would otherwise become a cell in a `chars` input.
        values[field.key] = raw.trim();
        break;
      }
      case 'number': {
        const t = raw.trim();
        if (t === '') {
          values[field.key] = field.default;
        } else if (NUMERIC.test(t)) {
          values[field.key] = Number(t);
        } else {
          errors[field.key] = `“${t}” is not a number.`;
        }
        break;
      }
      case 'graph': {
        const built = buildGraphInput(raw, opts.graph ?? { directed: true, weighted: true });
        if (!built.ok) errors[field.key] = built.error;
        else values[field.key] = built.input;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values };
}

/**
 * Field keys that are *also* runtime parameters, and so have to be pushed at
 * the parameter as well as the input.
 *
 * `detect-cycle` is the only one in the curriculum, and it is the only one that
 * needs it — see the long comment in `seedOne`. The rule is stated generally
 * ("a field that is also a declared parameter") rather than special-cased by
 * name, and the type filter keeps an array-valued field such as `values` from
 * ever being written into a parameter, where it would silently do nothing or
 * something worse.
 */
export function paramKeysFrom(spec: InputSpec, paramKeys: readonly string[]): string[] {
  const params = new Set(paramKeys);
  return spec.fields.filter((f) => f.kind === 'number' && params.has(f.key)).map((f) => f.key);
}

/* ------------------------------------------------------------------ *
 * Tokenising
 * ------------------------------------------------------------------ */

/** Integers and decimals, optionally signed. Deliberately stricter than `Number()`. */
const NUMERIC = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

/**
 * Split on commas, semicolons and any whitespace.
 *
 * All three, because "what will this accept?" is unanswerable from a label and
 * a student pasting `1, 2, 3` should not have to know whether this particular
 * box wants commas.
 */
function splitTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Split into words on **newlines and commas only** — never on spaces.
 *
 * The asymmetry with `splitTokens` is not an oversight, it is a bug that was
 * caught by the round-trip test. A `words` input is not a list of atoms: `lcs`
 * ships the preset `['the quick fox', 'quick brown fox']`, and splitting that on
 * whitespace turned two sentences into six words, silently changing the
 * algorithm's input. A `words` field is really "one entry per line", which is
 * also exactly what `flood-fill` needs, since its words are grid rows.
 */
function splitWords(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function parseNumbers(raw: string): number[] | string {
  const out: number[] = [];
  for (const token of splitTokens(raw)) {
    if (!NUMERIC.test(token)) {
      return badToken(token, 'a number');
    }
    const n = Number(token);
    if (!Number.isFinite(n)) return badToken(token, 'a finite number');
    out.push(n);
  }
  return out;
}

/**
 * `keys` fields hold `Array<number | string>`, so each token becomes a number
 * when it looks like one and stays a string otherwise. `3, apple, 7` is
 * `[3, 'apple', 7]` — which is the shape a mixed-key preset actually has, and
 * coercing `apple` to `NaN` would be a silent data-loss bug rather than an error.
 */
function parseKeys(raw: string): Array<number | string> {
  return splitTokens(raw).map((t) => (NUMERIC.test(t) ? Number(t) : t));
}

function badToken(token: string, expected: string): string {
  return `“${token}” is not ${expected}. Separate values with commas or spaces.`;
}

/* ------------------------------------------------------------------ *
 * Graphs: an edge list you can type
 * ------------------------------------------------------------------ */

/**
 * Render a graph input as the edge-list text the editor shows.
 *
 * Nodes are printed as their *index*, not their id, because the index is what
 * the language listings use: `adj[0]`, `adj[1]`. Printing `n0` here while the
 * code says `0` would reintroduce by the back door the exact mismatch the anchor
 * contract exists to prevent — the animation would say one thing and the code
 * another, which is the failure this whole project is built against.
 *
 * A `nodes: N` header is emitted **only when some vertex has no edge at all**.
 * An edge list cannot mention an isolated node, so without the header the
 * editor would quietly shrink a graph the moment it was opened — and it did
 * exactly that to `topological-sort`'s nine-node preset, whose last column
 * vertex is reachable but reaches nothing. For every other graph the bare edge
 * list is the friendlier thing to edit, so it is what you get.
 */
export function edgeListText(input: AlgoInput): string {
  if (input.type !== 'graph') return '';
  const index = new Map(input.nodes.map((n, i) => [n.id, i]));
  const lines: string[] = [];
  const mentioned = new Set<number>();
  const seen = new Set<string>();
  const drawn: Array<{ u: number; v: number; weight?: number }> = [];

  for (const e of input.edges) {
    const u = index.get(e.from);
    const v = index.get(e.to);
    if (u === undefined || v === undefined) continue;
    // Undirected inputs store both directions so the algorithms can traverse
    // both ways; printing both would double every line.
    const key = input.directed ? `${u}>${v}` : `${Math.min(u, v)}~${Math.max(u, v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentioned.add(u);
    mentioned.add(v);
    drawn.push({ u, v, weight: e.weight });
  }

  if (input.nodes.length > mentioned.size) lines.push(`nodes: ${input.nodes.length}`);

  for (const { u, v, weight } of drawn) {
    const sep = input.directed ? '->' : '-';
    const w = weight === undefined ? '' : `: ${weight}`;
    lines.push(`${u} ${sep} ${v}${w}`);
  }
  return lines.join('\n');
}

/**
 * Parse an edge list into a graph input.
 *
 * Grammar, one edge per line (or separated by commas/semicolons):
 *
 * ```
 *   nodes: 5            optional. This graph has 5 nodes, 0..4, even if isolated
 *   from - to            an edge; `-`, `--`, `->` and `-->` are all accepted
 *   from -> to : 4       the same edge with a cost
 *   from - to 4          weight may follow by whitespace instead of a colon
 * ```
 *
 * The arrow style is **purely cosmetic**. It makes an edge list read the way the
 * student wrote it, but direction is decided by the Directed toggle, because
 * direction is a property of the whole graph here — the viewport and every
 * algorithm take one `directed` flag, not one per edge.
 *
 * ## How nodes get their numbers
 *
 * **A numeric name is that node's number.** Writing `3 -> 5` really does mean
 * nodes 3 and 5, which is what makes this a lossless round-trip of a preset and
 * what lets `0 -> 4` mean what it looks like it means. A non-numeric name is
 * assigned the lowest free number, in the order it is first mentioned, so
 * `B-A` gives B=0 and A=1. Names that are already numbers and names that are not
 * can be mixed freely; the named ones step around the fixed ones.
 *
 * This is worth spelling out because the alternative — always numbering by
 * mention order — is simpler and wrong in a way that is hard to see. It
 * renumbers a preset's graph into a different numbering of the same graph, so
 * the topology survives and the node labels silently do not.
 *
 * Layout comes from the shared `circleNodes`, so a hand-typed graph is laid out
 * exactly like a generated one and a student switching between their own input
 * and a preset does not have to re-learn where anything is.
 */
export function buildGraphInput(
  raw: string,
  opts: GraphOptions,
): { ok: true; input: AlgoInput } | { ok: false; error: string } {
  const chunks = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Pass 0: an explicit node count, so isolated vertices are expressible.
  let declared: number | null = null;
  const body: string[] = [];
  for (const chunk of chunks) {
    const header = /^nodes?\s*:?\s*(\d+)$/i.exec(chunk);
    if (header) {
      const n = Number(header[1]);
      if (n > MAX_GRAPH_NODES) {
        return {
          ok: false,
          error: `${n} nodes is more than the ${MAX_GRAPH_NODES} this editor allows.`,
        };
      }
      declared = n;
    } else {
      body.push(chunk);
    }
  }

  const parsed: Array<{ a: string; b: string; w?: number }> = [];
  for (const chunk of body) {
    // `A-B:4` / `A -> B : 4` / `A-B 4`
    const m =
      /^([A-Za-z0-9_]+)\s*(?:-->|->|--|—|–|-)\s*([A-Za-z0-9_]+)\s*(?::|\s)?\s*(-?\d+(?:\.\d+)?)?\s*$/.exec(
        chunk,
      );
    if (!m) {
      return {
        ok: false,
        error: `“${chunk}” is not an edge. Write one as \`from - to\` or \`from -> to : weight\`.`,
      };
    }
    const w = m[3] === undefined ? undefined : Number(m[3]);
    parsed.push(
      w === undefined
        ? { a: m[1] as string, b: m[2] as string }
        : { a: m[1] as string, b: m[2] as string, w },
    );
  }

  // Pass 1: pin every numeric name to its own number.
  const fixed = new Map<string, number>();
  for (const { a, b } of parsed) {
    for (const name of [a, b]) {
      if (!/^\d+$/.test(name)) continue;
      const n = Number(name);
      if (n > MAX_GRAPH_NODES) {
        return {
          ok: false,
          error: `Node ${n} is more than the ${MAX_GRAPH_NODES} this editor allows.`,
        };
      }
      fixed.set(name, n);
    }
  }

  // Pass 2: give every named node the lowest number the fixed ones did not take.
  const taken = new Set(fixed.values());
  const indexOf = new Map<string, number>(fixed);
  let nextFree = 0;
  const assign = (name: string): number => {
    const at = indexOf.get(name);
    if (at !== undefined) return at;
    while (taken.has(nextFree)) nextFree += 1;
    indexOf.set(name, nextFree);
    taken.add(nextFree);
    return nextFree;
  };

  const resolved: Array<{ u: number; v: number; w?: number }> = [];
  for (const { a, b, w } of parsed) {
    const u = assign(a);
    const v = assign(b);
    if (u === v) {
      return {
        ok: false,
        error: `“${a}” and “${b}” are both node ${u}. An edge from a node to itself is a self-loop, and these algorithms do not handle one.`,
      };
    }
    resolved.push(w === undefined ? { u, v } : { u, v, w });
  }

  const highest = resolved.length ? Math.max(...resolved.map((e) => Math.max(e.u, e.v))) : -1;
  const size = Math.max(declared ?? 0, highest + 1);
  if (size > MAX_GRAPH_NODES) {
    return {
      ok: false,
      error: `${size} nodes is more than the ${MAX_GRAPH_NODES} this editor allows.`,
    };
  }

  const anyWeight = resolved.some((e) => e.w !== undefined);
  const weighted = opts.weighted || anyWeight;
  const nodes = circleNodes(size);
  const edges: AlgoGraphEdge[] = [];

  for (const { u, v, w } of resolved) {
    edges.push({
      from: `n${u}`,
      to: `n${v}`,
      directed: opts.directed,
      ...(weighted ? { weight: w ?? 1 } : {}),
    });
    /*
     * An undirected graph in this codebase is stored as *both* directions.
     *
     * That is not a quirk of this file — `dijkstra.ts` builds its traversal
     * adjacency with one entry per edge in the list, so a single `A-B` row would
     * make the edge walkable one way only, and its own presets double their edge
     * lists for exactly this reason. The viewport de-duplicates when drawing, so
     * the extra row costs nothing on screen.
     */
    if (!opts.directed) {
      edges.push({
        from: `n${v}`,
        to: `n${u}`,
        directed: false,
        ...(weighted ? { weight: w ?? 1 } : {}),
      });
    }
  }

  return { ok: true, input: graph({ nodes, edges, directed: opts.directed, weighted }) };
}

/** Enough for a hand-typed graph; beyond this the circle layout is unreadable. */
const MAX_GRAPH_NODES = 60;

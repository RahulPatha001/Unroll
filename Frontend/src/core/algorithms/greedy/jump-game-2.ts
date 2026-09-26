import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Jump Game II — a greedy that is really a breadth-first search, drawn flat.
 *
 * The textbook O(n^2) answer is "for every index, the fewest jumps to reach it
 * is one more than the fewest jumps to reach anywhere in its backward reach".
 * That is a DP over a graph, and it is quadratic. But the structure of the
 * problem says something stronger: the positions you can reach in exactly k
 * jumps always form one *contiguous* range, so there is only ever one frontier
 * to think about, and it is a range. Two numbers describe it — the last index
 * of the current layer and the furthest index the next layer reaches — and the
 * greedy is nothing more than sweeping `farthest` forward and counting how many
 * times the sweep has to be committed.
 *
 * The trace names the two numbers `current` and `next` rather than the code's
 * `currentEnd` and `farthest`, because that is what they mean: the boundary of
 * the layer you are standing in, and the boundary of the layer one jump further.
 * The `stuck` preset is the one worth watching — a zero on the first cell means
 * the frontier never expands, and a version that does not test for that either
 * loops forever or reports a jump count that means nothing.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1301;

const PRESETS: Preset[] = [
  {
    id: 'small-steps',
    label: 'Steps of one to three',
    blurb:
      'Short jumps, so the layers are thin and there are many of them: four jumps to cross a 12-cell array. The frontier advances a couple of cells at a time and the answer is the number of commits, not the number of cells.',
    input: { type: 'numbers', values: randomArray(SEED, 12, 1, 3) },
  },
  {
    id: 'long-jumps',
    label: 'Steps of one to six',
    blurb:
      'Long jumps, so a single layer swallows half the array and the answer drops to three. Watch `farthest` shoot past the end of the array — reaching beyond the last index is not an error, it is how "the last cell is in this layer" is recognised.',
    input: { type: 'numbers', values: randomArray(SEED + 4, 12, 1, 6) },
  },
  {
    id: 'stuck',
    label: 'A zero on the first cell',
    blurb:
      'The very first cell offers a jump of zero, so the frontier never expands. The answer is -1, and it is the `-1` rather than an exception: the algorithm detects the dead end on the first commit and returns a value the caller can compare.',
    input: {
      type: 'numbers',
      values: randomArray(SEED + 8, 10, 1, 4).map((v, i) => (i === 0 ? 0 : v)),
    },
  },
  {
    id: 'already-there',
    label: 'One cell',
    blurb:
      'A single cell is the last cell, so the answer is zero and the loop never runs. The degenerate case matters here because `n - 1` is the loop bound and a one-cell array would otherwise ask for jumps backwards.',
    input: { type: 'numbers', values: randomArray(SEED + 12, 1, 1, 4) },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* jumpGame2(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  /** Last index reachable in exactly `jumps` jumps. */
  let currentEnd = 0;
  /** Last index reachable in `jumps + 1` jumps, as far as the scan has seen. */
  let farthest = 0;
  let jumps = 0;

  /** `farthest` is allowed to run past the array; a pointer is not. */
  const cursors = (): Record<string, number> => ({
    current: Math.min(currentEnd, n),
    next: Math.min(farthest, n),
  });

  /** Every cell already known to be within `jumps` jumps of the start. */
  const reached = (end: number): number[] => range(0, Math.min(end, n - 1) + 1);
  /** The cells that `to` adds beyond `from` — the next layer, in progress. */
  const nextLayer = (from: number, to: number): number[] =>
    range(from + 1, Math.min(to, n - 1) + 1);

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n <= 1
        ? 'One cell or none, and the last cell is where you already are. The answer is 0 jumps, and the loop below never runs.'
        : `One BFS layer, containing only index 0. \`current\` is the far edge of the layer you can reach in ${jumps} jumps and \`next\` is the far edge of the layer one jump further; both start at 0 because you begin on index 0.`,
    values: [...values],
    pointers: cursors(),
    highlight: { reached: reached(currentEnd) },
    vars: { n, current: currentEnd, next: farthest, jumps },
  };

  for (let i = 0; i < n - 1; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const hop = i + (values[i] as number);
    const was = farthest;
    farthest = Math.max(farthest, hop);

    yield {
      kind: 'array',
      index: 0,
      anchor: 'reach',
      caption: `Jump ${jumps}`,
      note:
        farthest === was
          ? `From index ${i} a jump of ${values[i] as number} lands on ${hop}, which is inside the layer already reached. \`next\` stays at ${farthest}: scanning a cell you are already in can only ever confirm what you knew.`
          : `From index ${i} a jump of ${values[i] as number} lands on ${hop}, so \`next\` extends to ${hop}. This is the only line that grows the frontier — sweeping \`next\` forward is what the whole greedy reduces to.`,
      values: [...values],
      pointers: { ...cursors(), i },
      highlight: {
        current: [i],
        reached: reached(currentEnd),
        frontier: nextLayer(currentEnd, farthest),
      },
      ops,
      vars: { i, hop, current: currentEnd, next: farthest, jumps },
    };

    if (i !== currentEnd) continue;

    if (farthest <= currentEnd) {
      yield {
        kind: 'array',
        index: 0,
        anchor: 'stuck',
        caption: `Jump ${jumps}`,
        note: `The whole of layer ${jumps} has been scanned and \`next\` never moved past ${farthest}, which is not even beyond index ${currentEnd}. Nothing in this layer jumps anywhere new, so no further layer exists and the last cell is unreachable. Return -1 rather than looping: this test is what makes the greedy terminate.`,
        values: [...values],
        pointers: { ...cursors(), i },
        highlight: {
          current: [i],
          reached: reached(currentEnd),
          outOfPlace: range(currentEnd + 1, n),
        },
        result: 'unreachable',
        ops,
        vars: { i, current: currentEnd, next: farthest, jumps, reachable: false },
      };
      return;
    }

    const layerWas = currentEnd;
    currentEnd = farthest;
    jumps = jumps + 1;
    yield {
      kind: 'array',
      index: 0,
      anchor: 'advance',
      caption: `Jump ${jumps}`,
      note: `Layer ${jumps - 1} is fully scanned, so commit: \`current\` moves to ${currentEnd} and that costs one jump. Everything up to index ${currentEnd} is now reachable in ${jumps} jump${jumps === 1 ? '' : 's'}${currentEnd >= n - 1 ? `, and ${currentEnd} is at or past the last index ${n - 1}, so the answer is final` : ''}.`,
      values: [...values],
      pointers: cursors(),
      highlight: {
        reached: reached(layerWas),
        frontier: nextLayer(layerWas, currentEnd),
        answer: currentEnd >= n - 1 && n > 0 ? [n - 1] : [],
      },
      ops,
      vars: { current: currentEnd, next: farthest, jumps, committed: layerWas },
    };
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note:
      n <= 1
        ? 'Already at the last cell. Return 0.'
        : `The scan ended with the last cell inside layer ${jumps}, so the minimum is ${jumps} jump${jumps === 1 ? '' : 's'}. Each cell was examined exactly once, and ${ops} examination${ops === 1 ? '' : 's'} bought the answer that a dynamic program would have needed O(n^2) for.`,
    values: [...values],
    pointers: cursors(),
    highlight: n > 0 ? { answer: [n - 1], reached: range(0, n) } : {},
    result: 'found',
    ops,
    vars: { jumps, current: currentEnd, next: farthest, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Jump length at each index',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'numbers',
    values: Array.isArray(values.values) ? (values.values as number[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'numbers' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `function jumpGame2(a) {
  const n = a.length;
  if (n <= 1) return 0;
  let jumps = 0, currentEnd = 0, farthest = 0;      // @anchor start
  for (let i = 0; i < n - 1; i++) {                // @anchor reach
    farthest = Math.max(farthest, i + a[i]);
    if (i === currentEnd) {                        // @anchor advance
      if (farthest <= currentEnd) return -1;       // @anchor stuck
      jumps++;
      currentEnd = farthest;
    }
  }
  return jumps;                                    // @anchor done
}`;

const PY = `def jump_game_2(a):
    n = len(a)
    if n <= 1:
        return 0
    jumps = current_end = farthest = 0             # @anchor start
    for i in range(n - 1):                         # @anchor reach
        farthest = max(farthest, i + a[i])
        if i == current_end:                       # @anchor advance
            if farthest <= current_end:
                return -1                          # @anchor stuck
            jumps += 1
            current_end = farthest
    return jumps                                   # @anchor done`;

const JAVA = `class JumpGame2 {
    static int jumpGame2(int[] a) {
        int n = a.length;
        if (n <= 1) return 0;
        int jumps = 0, currentEnd = 0, farthest = 0;  // @anchor start
        for (int i = 0; i < n - 1; i++) {             // @anchor reach
            farthest = Math.max(farthest, i + a[i]);
            if (i == currentEnd) {                    // @anchor advance
                if (farthest <= currentEnd) return -1;   // @anchor stuck
                jumps++;
                currentEnd = farthest;
            }
        }
        return jumps;                                // @anchor done
    }
}`;

const CPP = `#include <algorithm>
#include <vector>
using std::vector;

int jump_game_2(const vector<int>& a) {
    int n = (int)a.size();
    if (n <= 1) return 0;
    int jumps = 0, currentEnd = 0, farthest = 0;    // @anchor start
    for (int i = 0; i < n - 1; i++) {              // @anchor reach
        farthest = std::max(farthest, i + a[i]);
        if (i == currentEnd) {                      // @anchor advance
            if (farthest <= currentEnd) return -1;  // @anchor stuck
            jumps++;
            currentEnd = farthest;
        }
    }
    return jumps;                                  // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Three numbers, and the array is only ever read. `currentEnd` is the last index reachable in `jumps` jumps and `farthest` is the last index reachable in one more, so the pair is a BFS queue of width two — which is the entire reason the greedy works: the reachable set is always one contiguous range, so two numbers describe it completely.',
    python:
      "Three names chained to 0 in one statement, which is Python's tuple assignment: every right-hand side is evaluated first, then all three names are bound. The other three languages need either separate statements or comma-separated declarators, and the shape is kept identical so the listings can be read side by side.",
    java: 'Three `int`s declared in one statement. Nothing is allocated per call, so the space claim is O(1) regardless of the array length, and `a` is read-only throughout — the method would be safe to run concurrently on a shared array.',
    cpp: "The parameter is a `const vector<int>&`: no copy of the caller's data, and the compiler will reject any write. `std::max` is used rather than a hand-written comparison because it is a function template and cannot be inlined textually into a header without a definition — which is why the include is not optional.",
  },
  reach: {
    javascript:
      'The only line that grows the frontier: one addition, one max. Scanning index `i` asks "can anything already in this layer reach `i + a[i]`", and taking the max over every `i` in the layer gives the next layer\'s boundary. A cell you have already passed can still extend the frontier, which is why this line cannot be hoisted out of the loop.',
    python:
      'The only line that grows the frontier. `max` is a builtin here, where the C++ listing needs `std::max` from `<algorithm>` and the Java listing needs `Math.max` from a class — the same three-way split in the lesson you will meet in every other module. Note the loop stops one short of the last index: there is nothing to jump *from* there.',
    java: 'The only line that grows the frontier. `i + a[i]` can overflow `int` on a large jump length, which would make `farthest` negative and quietly break the "does the frontier advance" test; a production version would clamp the hop to `n - 1` first, which is free and removes the hazard.',
    cpp: 'The only line that grows the frontier, and `farthest` is an `int` that is *allowed* to exceed `n - 1`. That is not sloppiness: "the last index is inside this layer" is exactly the test `farthest >= n - 1`, and clamping it first would destroy the test. A wider hop value would overflow, though, and the C++ standard says signed overflow is undefined rather than wrapping.',
  },
  advance: {
    javascript:
      'Committing the layer, and this is the only place the answer grows. The test `i === currentEnd` is "I have just scanned the last cell of the current layer", which is the same event a BFS queue going empty would signal — the two-pointer version and the queue version are the same algorithm with the queue flattened into a range.',
    python:
      'Committing the layer: one jump spent, the frontier moved to where the sweep reached. Three chained statements rather than a `jumps, current_end = jumps + 1, farthest` tuple, because the other three languages cannot express that and the parity of the listings is worth more here than the brevity.',
    java: 'Committing the layer. The equality test is on the index rather than a counter, so the loop visits every cell exactly once and the commit happens exactly once per layer — there is no inner loop and no queue, which is where the linear time comes from.',
    cpp: 'Committing the layer. `currentEnd = farthest` rather than `farthest = currentEnd` is the direction that matters: the frontier is swept forwards and the layer boundary is dragged along behind it, never the other way round, because the sweep must never be able to retreat.',
  },
  stuck: {
    javascript:
      'The termination test, and the reason a naive version of this greedy hangs. A whole layer was scanned and `farthest` never got past the boundary it started from, so there is no layer two, no layer three, and no path to the end. Returning -1 gives the caller something to compare; the alternative — letting the loop run again with the same boundary — never ends.',
    python:
      'The termination test. `<=` rather than `<` is what makes it fire: `farthest` equals `current_end` exactly when the sweep failed to move, and `farthest` can never be less than `current_end` because the sweep only ever takes a max. Python spells the early return over two lines where Java and C++ put it on one, purely because of the brace-free block syntax.',
    java: 'The termination test, and the only `return -1` in the method. Note that the sentinel travels back through the harness as a plain integer, so a caller in any of the four languages can test `result < 0` the same way — no null, no exception, no empty array to interpret.',
    cpp: 'The termination test. The comparison is on `int`s rather than `size_t`, which is deliberate: `farthest <= currentEnd` on unsigned types would still work here, but the moment someone replaces these with `size_t` the `-1` return value becomes 2^64 - 1 and every sentinel check in the caller breaks silently.',
  },
  done: {
    javascript:
      'The last cell turned out to be inside the final layer, so the number of commits is the answer. Note the loop stopped at `n - 1` without a special "did I reach the end" test: the last cell is not scanned, and if `currentEnd` had not reached it the answer would be the count of layers that did — which is the BFS depth, arrived at without a queue.',
    python:
      'The last cell turned out to be inside the final layer, so the number of commits is the answer. The whole function is O(n) time and O(1) space, against the O(n^2) dynamic program that computes the same number of layers by comparing every index with every earlier index.',
    java: 'The last cell turned out to be inside the final layer. Nothing in the method allocates, so the O(1) space is structural rather than incidental, and the method could be `static` in a utility class and reused verbatim for any array of jump lengths.',
    cpp: 'The last cell turned out to be inside the final layer. A C++ caller who also wants the *path* would have to reconstruct it here, and would need the array as a `vector` of indices rather than a single `int` — the return type is deliberately the smallest thing the four languages can agree on.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'jumpGame2',
    python: 'jump_game_2',
    java: 'JumpGame2.jumpGame2',
    cpp: 'jump_game_2',
  },
  glue: {
    javascript: 'auto' as const,
    python: 'auto' as const,
    java: 'auto' as const,
    cpp: 'auto' as const,
  },
};

/* ------------------------------------------------------------------ *
 * 5. Expectations — one machine-checked claim per preset
 * ------------------------------------------------------------------ */

const valuesOf = (p: Preset): number[] => (p.input.type === 'numbers' ? p.input.values : []);

/**
 * The claim, computed by an actual breadth-first search over the jump graph:
 * expand index 0, then everything one jump away, and so on, counting levels.
 * Genuinely a different algorithm from the greedy sweep in the listings, so
 * agreeing with it is real evidence rather than a restatement.
 */
const minJumpsOf = (a: number[]): number => {
  const n = a.length;
  if (n <= 1) return 0;
  const distance = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  distance[0] = 0;
  const queue: number[] = [0];
  let head = 0;
  while (head < queue.length) {
    const at = queue[head] as number;
    head = head + 1;
    const far = Math.min(n - 1, at + (a[at] as number));
    for (let k = at + 1; k <= far; k++) {
      if (distance[k] === Number.POSITIVE_INFINITY) {
        distance[k] = (distance[at] as number) + 1;
        queue.push(k);
      }
    }
  }
  const last = distance[n - 1] as number;
  return last === Number.POSITIVE_INFINITY ? -1 : last;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: minJumpsOf(values) };
});

export const jumpGame2Algo: AlgoDef<ArrayFrame> = {
  id: 'jump-game-2',
  title: 'Jump Game II',
  category: 'greedy',
  summary:
    'Sweep a single "farthest reachable" boundary forwards across the array, and count how many times it has to be committed before the last cell is inside it — a breadth-first search with the queue flattened into two integers.',
  intuition:
    'Reach for this whenever the question is "fewest moves to the end" and the moves are all available at once from wherever you stand — skipping files, choosing servers in a chain, picking the next cache to fill, or routing through a series of relays. The insight that makes it linear rather than quadratic is that the reachable set is always one contiguous range, so there is never more than one frontier to track and no queue to maintain. Compare with the single-source shortest path problem on a general graph, which genuinely does need a queue and a priority queue: the reason this one does not is that the graph is an interval, and that structural fact is worth recognising in the wild.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'Linear because each index is examined once and the frontier is two integers rather than a queue; the inner-looking structure is not nested because a layer commit and an index scan are the same loop. The best case is O(1) for an array of one element, and there is no separate best case for a large array — every reachable input costs the same O(n) scan, which is unusual and worth knowing.',
  },
  traits: {
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['read-only', 'no extra space', 'returns -1 for unreachable', 'BFS layer greedy'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Positions',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 12,
      regeneratesInput: true,
      help: 'Beyond 150 the viewport switches to canvas.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: jumpGame2,
  lesson,
  expectations,
  formatResult: (r) => ((r as number) < 0 ? 'unreachable' : `${r as number} jumps`),
  anchors: ['start', 'reach', 'advance', 'stuck', 'done'],
};

export default jumpGame2Algo;

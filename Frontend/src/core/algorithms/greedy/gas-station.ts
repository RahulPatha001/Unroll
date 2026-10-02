import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { ArrayFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Gas Station — the greedy whose correctness is entirely in the last line.
 *
 * Given `gas[i] - cost[i]` at each station, find a start from which the tank
 * never goes negative. The naive proof of existence is a DP over "best subarray
 * starting at i" and it is O(n^2). The greedy version keeps two running sums and
 * is O(n), and the reason it works is a structural fact: if the total of all
 * deltas is non-negative, then the *lowest prefix sum* is a valid start, and the
 * wrap-around half can never fail because its total is at least the total of the
 * first half. One pass, no prefix-sum array, and the only branch that ever
 * matters is "did the tank go negative".
 *
 * The presets are picked so each one fails a different belief. `one-short` is
 * the sharp one: the deltas add up to -1, so *no* start works even though the
 * tank is positive for most of the route, and the trace shows `tank` and `total`
 * disagreeing for the whole run. `reset-hard` puts a -20 on the first cell so the
 * very first hop fails and `start` has to walk all the way round.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

const SEED = 1409;

const PRESETS: Preset[] = [
  {
    id: 'round-trip',
    label: 'A feasible round trip',
    blurb:
      'The deltas add up to 19, so a start exists. The tank never dips below zero from index 0, `start` is never reset, and the answer is 0 — the easy case, where the interesting branch never fires.',
    input: { type: 'numbers', values: randomArray(SEED, 9, -6, 8) },
  },
  {
    id: 'one-short',
    label: 'Exactly one unit short',
    blurb:
      'The deltas add up to -1. The tank looks healthy for most of the route and `start` is reset twice along the way, but the total is what decides existence: with a negative total there is no start anywhere, and the answer is -1.',
    input: { type: 'numbers', values: randomArray(SEED + 8, 9, -6, 8) },
  },
  {
    id: 'net-negative',
    label: 'Never enough fuel',
    blurb:
      'Every delta is negative, so the tank fails at every single hop and `start` is reset eight times. The loop is the same length as always — the impossibility shows up in one comparison at the end, not in the work.',
    input: { type: 'numbers', values: randomArray(SEED + 4, 8, -7, -1) },
  },
  {
    id: 'reset-hard',
    label: 'A huge deficit first',
    blurb:
      'The first station costs twenty more than it gives, so the very first hop fails and `start` jumps to index 1 immediately. The rest of the route is comfortable, which is why the answer is not 0: a start only has to survive the whole lap, and a bad first station disqualifies it forever.',
    input: {
      type: 'numbers',
      values: randomArray(SEED + 12, 10, 1, 5).map((v, i) => (i === 0 ? -20 : v)),
    },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const range = (from: number, to: number): number[] =>
  to <= from ? [] : Array.from({ length: to - from }, (_, i) => from + i);

export function* gasStation(ctx: RunContext): Generator<ArrayFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const size = Number(ctx.params.size ?? source.length);
  const values = [...source].slice(0, Math.max(0, size));
  const n = values.length;

  let ops = 0;
  /** Fuel in the tank, measured from the current `start`. */
  let tank = 0;
  /** Fuel summed over the whole lap, independent of where the start is. */
  let total = 0;
  let start = 0;

  yield {
    kind: 'array',
    index: 0,
    anchor: 'start',
    note:
      n === 0
        ? 'No stations, so there is no lap to complete and no start to name. The answer is -1.'
        : `Each cell is one station's surplus: gas minus cost. Two sums are kept — \`tank\`, the fuel from the current candidate start, and \`total\`, the fuel over the whole lap. \`total\` decides whether a solution exists; \`tank\` decides where it starts.`,
    values: [...values],
    pointers: { i: 0, start },
    highlight: { unvisited: range(0, n) },
    vars: { n, start, tank, total },
  };

  for (let i = 0; i < n; i++) {
    if (ctx.shouldStop()) return;
    ops++;
    const delta = values[i] as number;
    const wasTank = tank;
    tank = tank + delta;
    total = total + delta;

    yield {
      kind: 'array',
      index: 0,
      anchor: 'fuel',
      caption: `Station ${i + 1} of ${n}`,
      note: `Take ${delta >= 0 ? `+${delta}` : String(delta)} at this station: \`tank\` goes ${wasTank} to ${tank} and \`total\` to ${total}. ${tank >= 0 ? `The tank survives, so the candidate start at index ${start} is still in the running.` : `The tank goes negative, so the candidate start at index ${start} is disqualified.`}`,
      values: [...values],
      pointers: { i, start },
      highlight: { window: range(start, i + 1), unvisited: range(i + 1, n) },
      ops,
      vars: { i, start, delta, tank, total },
    };

    if (tank < 0) {
      const was = start;
      start = i + 1;
      tank = 0;
      yield {
        kind: 'array',
        index: 0,
        anchor: 'reset',
        caption: `Station ${i + 1} of ${n}`,
        note: `Running dry between index ${was} and index ${i}. Any start at or before ${was} shares this same prefix and therefore runs dry at the same place, so all of them are disqualified at once. Move \`start\` to ${start} — the next untried station — and empty the tank. This is the only place \`start\` ever moves, and it only ever moves forwards.`,
        values: [...values],
        pointers: { i, start },
        highlight: { outOfPlace: range(0, i + 1), unvisited: range(i + 1, n) },
        ops,
        vars: { start, previous: was, tank, total, disqualified: i + 1 },
      };
    }
  }

  if (n === 0 || total < 0) {
    yield {
      kind: 'array',
      index: 0,
      anchor: 'no-solution',
      note:
        n === 0
          ? 'No stations, so there is no lap to complete and no start to name. Return -1 for the same reason as an impossible route: the caller asked for a station and there is none.'
          : `The lap needs ${-total} more fuel than the stations can supply, so no start works: summing any rotation of the same deltas always gives ${total}. The tank readings along the way were local, and that is the trap — a start can look fine for most of the route and still be impossible. Return -1.`,
      values: [...values],
      highlight: { outOfPlace: range(0, n) },
      result: 'no-solution',
      ops,
      vars: { start, tank, total, ops },
    };
    return;
  }

  yield {
    kind: 'array',
    index: 0,
    anchor: 'done',
    note: `The total is ${total} >= 0, so a start exists — and index ${start} is the one the tank kept. ${ops} hop${ops === 1 ? '' : 's'} in one pass, and the wrap-around from the last station back to index 0 is safe because the second half of the lap can only ever hold more fuel than the first half did.`,
    values: [...values],
    pointers: { i: n > 0 ? n - 1 : 0, start },
    highlight: n > 0 ? { answer: [start], sorted: range(0, n) } : {},
    result: 'found',
    ops,
    vars: { start, total, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Fuel delta per station',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
      help: 'gas[i] - cost[i]: positive means you can afford the next hop.',
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

const JS = `function gasStation(d) {
  let total = 0, tank = 0, start = 0;               // @anchor start
  if (d.length === 0) return -1;
  for (let i = 0; i < d.length; i++) {              // @anchor fuel
    const delta = d[i];
    total = total + delta;
    tank = tank + delta;
    if (tank < 0) {                                 // @anchor reset
      start = i + 1;
      tank = 0;
    }
  }
  if (total < 0) return -1;                         // @anchor no-solution
  return start;                                     // @anchor done
}`;

const PY = `def gas_station(d):
    total = tank = start = 0                         # @anchor start
    if not d:
        return -1
    for i in range(len(d)):                         # @anchor fuel
        delta = d[i]
        total = total + delta
        tank = tank + delta
        if tank < 0:                                # @anchor reset
            start = i + 1
            tank = 0
    if total < 0:                                   # @anchor no-solution
        return -1
    return start                                    # @anchor done`;

const JAVA = `class GasStation {
    static int gasStation(int[] d) {
        int total = 0, tank = 0, start = 0;          // @anchor start
        if (d.length == 0) return -1;
        for (int i = 0; i < d.length; i++) {         // @anchor fuel
            int delta = d[i];
            total = total + delta;
            tank = tank + delta;
            if (tank < 0) {                          // @anchor reset
                start = i + 1;
                tank = 0;
            }
        }
        if (total < 0) return -1;                   // @anchor no-solution
        return start;                                // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

int gas_station(const vector<int>& d) {
    int total = 0, tank = 0, start = 0;              // @anchor start
    if (d.empty()) return -1;
    for (int i = 0; i < (int)d.size(); i++) {        // @anchor fuel
        int delta = d[i];
        total = total + delta;
        tank = tank + delta;
        if (tank < 0) {                             // @anchor reset
            start = i + 1;
            tank = 0;
        }
    }
    if (total < 0) return -1;                       // @anchor no-solution
    return start;                                   // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Three integers and no allocation. `start` is allowed to reach `d.length` at the end of the loop when the tank fails on the final station, which is a valid answer to report as a non-negative number only because the `total` test below has already ruled that case out.',
    python:
      "Three names chained to 0 in one statement — Python's tuple assignment evaluates every right-hand side first and then binds all three. The other three languages need comma-separated declarators or three separate statements, and keeping the shape identical is what lets the four listings be read as one algorithm.",
    java: 'Three `int`s in one statement, no allocation, and the input array is only ever read. The `int` type is worth a moment: fuel totals are sums, and a route long enough to overflow `int` would silently produce a wrong sign on `total` and therefore a wrong answer.',
    cpp: "The parameter is a `const vector<int>&`, so the caller's data is neither copied nor modified and the compiler enforces both. `(int)d.size()` on the loop bound is a narrowing cast that a `size_t` loop would avoid — at the cost of then having to make sure every index stays unsigned, which is where the `-1` sentinel below would stop being a sentinel.",
  },
  fuel: {
    javascript:
      'Both sums are updated with the same delta, and the difference between them is the whole algorithm. `tank` is measured from the current candidate start, so it restarts whenever that start moves; `total` is measured from index 0 and never resets, which is why it is the one that answers "does a solution exist at all".',
    python:
      'Both sums take the same delta, and the loop variable `i` is the only thing that walks the array. Note the asymmetry that makes this linear: nothing is ever recomputed after a reset, because a reset only ever discards a prefix — the discarded stations are never looked at again.',
    java: 'Both sums take the same delta, and the array is read twice per iteration from two locals rather than re-indexing it. A production version would cache `d.length` in a local, because `d.length` is a field read the JIT will hoist anyway but a reader should not have to assume.',
    cpp: 'Both sums take the same delta. Note the order: `total` is updated before `tank`, which matters not at all here but would matter in a variant that compared the two — another reason the two sums are named rather than both called `sum`.',
  },
  reset: {
    javascript:
      'The only line that moves the start, and the argument for it is an elimination rather than a construction. If the tank is negative at index `i`, then every start between the current one and `i` shares the same prefix and fails identically, so all of them go at once — which is what turns "try every start" into one pass.',
    python:
      "The elimination. Note `start = i + 1` rather than `start = i`: station `i` itself is what emptied the tank, so it is disqualified too, and starting there would loop forever in the traveller's imagination rather than in the code.",
    java: 'The elimination, and the assignment that encodes it. Because `start` only ever moves forwards and the loop only ever moves forwards, the two together partition the array into consecutive blocks, each of which was a failed candidate start — a partition, not a rescan, which is the linear-time argument in one sentence.',
    cpp: 'The elimination. The tank is zeroed rather than set to the delta that caused the failure, which is the detail that is easy to get wrong: the station at index `i` has already been paid for, so its contribution must not be counted again for the new candidate.',
  },
  'no-solution': {
    javascript:
      'One comparison, and it is the only place impossibility is detected. Every rotation of the array sums to the same total, so a negative total rules out all n starts at once — and it does so *after* the loop, which is why this algorithm never needs to revisit anything.',
    python:
      'One comparison, and the only place impossibility is detected. The early return over two lines is pure syntax: Python has no braces, so an early return inside an `if` needs its own line, where Java and C++ keep it on the same line as the test.',
    java: 'One comparison, and the only place impossibility is detected. The `-1` travels back as a plain integer, so a caller in any of the four languages writes the same `result < 0` test — the sentinel is chosen so the failure case has exactly the same shape as the success case.',
    cpp: 'One comparison, and the only place impossibility is detected. Returning -1 from a function whose success value is an index means the caller must check for -1 before using the result as an index, and forgetting that check is the classic bug in every implementation of this function.',
  },
  done: {
    javascript:
      'The index of a station, or -1. What the loop has actually proved is stronger than "this index works": it is the index just after the lowest prefix sum, and for a non-negative total that is the *only* valid start — so the answer is unique whenever the total is positive, and a tie is impossible to observe.',
    python:
      "The index of a station, or -1. The proof of the wrap-around half is worth stating because it is the part that is not local: the second half of the lap is the first half's deltas with a total at least as large, so it can never run dry where the first half did not.",
    java: 'The index of a station, or -1, and nothing is allocated on the way. The class-and-static-method shape is only so the verification harness has something to call: in real code this would be a static method on a routing utility, and the array would arrive from a fare table rather than from an input editor.',
    cpp: 'The index of a station, or -1, with a `const` reference and no allocation anywhere. A C++ caller who wanted the whole itinerary would run the same loop a second time from `start` to accumulate fuel per hop; the greedy deliberately does not, because doing so would double the work for a question the caller did not ask.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'gasStation',
    python: 'gas_station',
    java: 'GasStation.gasStation',
    cpp: 'gas_station',
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
 * The claim, checked by definition: try every start, simulate the lap, and see
 * which ones survive. O(n^2) on ten stations, and completely independent of the
 * greedy's elimination argument — so if the greedy returned a start that the
 * simulation rejects, the test would catch it.
 */
const stationOf = (values: number[]): number => {
  const n = values.length;
  if (n === 0) return -1;
  for (let s = 0; s < n; s++) {
    let tank = 0;
    let ok = true;
    for (let k = 0; k < n; k++) {
      tank += values[(s + k) % n] as number;
      if (tank < 0) {
        ok = false;
        break;
      }
    }
    if (ok) return s;
  }
  return -1;
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: stationOf(values) };
});

export const gasStationAlgo: AlgoDef<ArrayFrame> = {
  id: 'gas-station',
  title: 'Gas Station',
  category: 'greedy',
  summary:
    'One pass with two running sums: a tank that restarts whenever it goes negative, and a total that never does — and only the total decides whether a start exists at all.',
  intuition:
    'Reach for this whenever a circuit has a supply and a demand at each stop and you need to know where to begin so the trip never runs dry — fuel routing, a delivery loop with loading costs, a battery schedule with per-station losses, a cash float carried around a set of tills. The insight is that a failing start can be *eliminated in bulk* rather than disproved one at a time, which collapses "try n starts" into one pass, and the corollary that surprises people is that a solution exists if and only if the deltas sum to non-negative: there is no configuration where every start fails for a reason other than the total. That corollary is what lets this answer "is it even possible" for free.',
  complexity: {
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'Linear in every case with no early exit, which is the point: the answer depends on the total over the whole loop, so there is nothing to stop early for. The space is three integers regardless of the number of stations, and the O(n^2) alternative is not merely slower but a different kind of object — it enumerates candidates, this one eliminates them.',
  },
  traits: {
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['read-only', 'no extra space', 'returns -1 when impossible', 'bulk elimination'],
  },
  viewport: 'array',
  level: 'intermediate',
  params: [
    {
      key: 'size',
      label: 'Stations',
      kind: 'number',
      min: 1,
      max: 150,
      step: 1,
      default: 10,
      regeneratesInput: true,
      help: 'Past 150 elements the cells get too small to read, and a long run can hit the frame cap and stop early.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: gasStation,
  lesson,
  expectations,
  formatResult: (r) => {
    const v = r as number;
    return v < 0 ? 'no start works' : `start at station ${v}`;
  },
  anchors: ['start', 'fuel', 'reset', 'no-solution', 'done'],
};

export default gasStationAlgo;

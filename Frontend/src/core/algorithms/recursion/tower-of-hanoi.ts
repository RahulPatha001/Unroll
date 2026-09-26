import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { LinearFrame } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Tower of Hanoi — a call stack you can watch grow and shrink.
 *
 * This is the one algorithm in the curriculum whose subject *is* the recursion
 * rather than the data it recurses over, so the viewport is a stack and every
 * frame is one pending call. Watch the pattern: the stack grows to depth n, one
 * frame at a time, the deepest frame finds nothing to do and returns, its caller
 * performs its single move and recurses again to the same depth, and the whole
 * thing unwinds. The exponential move count is not a property of the puzzle; it
 * falls out of a depth-n recursion that calls itself twice.
 *
 * The four listings count moves rather than print them, because a lesson in
 * `main` would be a lesson in I/O. `2^n - 1` is still the answer they all agree
 * on, and it is the number worth knowing: moving the largest disk requires
 * moving the n-1 smaller ones out of the way, moving those requires the same
 * again, and there is no way to be cleverer.
 *
 * Unlike every other module here this one has no random input to seed: the only
 * thing a preset can vary is how many disks there are, so the presets walk up
 * the sequence 1, 3, 7, 31 and let the doubling be the story.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/** Disk sizes, largest first. Only the *count* matters; the sizes are for the rods. */
const diskList = (n: number): number[] => Array.from({ length: n }, (_, i) => n - i);

const PRESETS: Preset[] = [
  {
    id: 'one-disk',
    label: 'One disk',
    blurb:
      'The smallest case that still recurses: one frame pushed, its base case fires immediately, the single move happens, and the frame returns. Two moves of the stack and one disk — the base case is not an edge case here, it is half the work.',
    input: { type: 'numbers', values: diskList(1) },
    params: { disks: 1 },
  },
  {
    id: 'two-disks',
    label: 'Two disks',
    blurb:
      'Three moves, and the stack reaches depth two. This is the smallest case where the two recursive calls are visibly different: the first moves the small disk to the spare, the second moves it back off the target.',
    input: { type: 'numbers', values: diskList(2) },
    params: { disks: 2 },
  },
  {
    id: 'three-disks',
    label: 'Three disks',
    blurb:
      'Seven moves, which is the first number in the sequence 1, 3, 7, 15, 31 that does not look like a coincidence. Two peaks of the stack to depth three, with a move in the middle of each — the doubling you can see on every frame.',
    input: { type: 'numbers', values: diskList(3) },
    params: { disks: 3 },
  },
  {
    id: 'five-disks',
    label: 'Five disks',
    blurb:
      'Thirty-one moves and a stack that only ever gets five deep. The call stack is tiny and the work is enormous, which is the most useful thing this algorithm has to teach: recursion depth and total work are different quantities and only one of them grows dangerously.',
    input: { type: 'numbers', values: diskList(5) },
    params: { disks: 5 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/** One stack cell per pending call: the disk count and the two rods involved. */
const label = (n: number, from: string, to: string): string => `${n}:${from}->${to}`;

export function* towerOfHanoi(ctx: RunContext): Generator<LinearFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const disks = Math.max(0, Math.trunc(Number(ctx.params.disks ?? source.length)));

  /** Bottom to top. A disk is identified by its size, which is all Hanoi needs. */
  const rods: Record<string, number[]> = {
    A: diskList(disks),
    B: [],
    C: [],
  };

  /** The call stack, rendered. One cell per frame that has not returned yet. */
  const stack: string[] = [];
  let moves = 0;

  const rodText = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [name, peg] of Object.entries(rods)) {
      out[name] = peg.length === 0 ? '-' : peg.join(' ');
    }
    return out;
  };

  /** `active` is the frame currently executing — the top of the stack. */
  const active = (): number[] => (stack.length === 0 ? [] : [stack.length - 1]);

  const frame = (
    anchor: string,
    note: string,
    extra: Record<string, number | string | boolean> = {},
  ): LinearFrame => ({
    kind: 'linear',
    flavour: 'stack',
    index: 0,
    anchor,
    caption: `Depth ${stack.length} · ${moves} move${moves === 1 ? '' : 's'}`,
    note,
    items: [...stack],
    mode: 'string',
    edges: { top: stack.length },
    highlight: { active: active() },
    vars: { disks, depth: stack.length, moves, ...rodText(), ...extra },
  });

  yield frame(
    'call',
    disks === 0
      ? 'Nothing to move. The very first call is already the base case, it returns 0 immediately, and the whole problem is over before a stack exists.'
      : `One frame on the stack: move ${disks} disk${disks === 1 ? '' : 's'} from A to C using B. Every disk is on A, and the call is the only thing alive.`,
    { from: 'A', to: 'C', via: 'B', pushed: 0 },
  );

  /** The recursion, written out as an explicit stack so it can be watched. */
  function* solve(n: number, from: string, to: string, via: string): Generator<LinearFrame> {
    if (ctx.shouldStop()) return;

    const pushed = stack.length;
    stack.push(label(n, from, to));
    yield frame(
      'call',
      n === 0
        ? `Push a frame for move 0 disks from ${from} to ${to}. Nothing to move — but the frame still exists, and the stack is one deeper because the call happened. This is what a base case looks like on a call stack.`
        : `Push a frame for move ${n} disk${n === 1 ? '' : 's'} from ${from} to ${to} using ${via}. Depth ${pushed + 1}: the first thing this frame does is recurse on ${n - 1} disk${n - 1 === 1 ? '' : 's'}, swapping the roles of ${to} and ${via}.`,
      { n, from, to, via, pushed },
    );

    if (n === 0) {
      stack.pop();
      yield frame(
        'base-case',
        `Zero disks: there is nothing between ${from} and ${to}, so the call returns 0 and its frame is popped. The stack drops back to depth ${stack.length}. Note that no disk moved — the base case is a no-op, and it fires for every single leaf of this recursion tree.`,
        { n, from, to, via, popped: pushed },
      );
      return;
    }

    yield* solve(n - 1, from, via, to);

    if (ctx.shouldStop()) return;
    const disk = rods[from]?.pop() as number;
    rods[to]?.push(disk);
    moves = moves + 1;
    yield frame(
      'move',
      n === 1
        ? `The deepest frame has no smaller disks to wait for, so its one job is already unblocked: move the disk of size ${disk} from ${from} to ${to}. Move ${moves} of ${2 ** disks - 1}.`
        : `The frame for ${n} disk${n === 2 ? '' : 's'} gets to do its one job: move the largest remaining disk, size ${disk}, from ${from} to ${to}. The ${n - 1} smaller disk${n - 1 === 1 ? '' : 's'} are all on ${via} thanks to the call that just returned, so the move is legal. Move ${moves} of ${2 ** disks - 1}.`,
      { n, moved: disk, from, to, via },
    );

    yield* solve(n - 1, via, to, from);

    stack.pop();
    yield frame(
      'descend-again',
      `That second call returns too, so the frame for ${n} disk${n === 1 ? '' : 's'} is finished: ${moves} move${moves === 1 ? '' : 's'} so far in total. Popping it hands control back to the caller, and the stack is now ${stack.length} deep — back to the depth it had before the first descent.`,
      { n, from, to, via, popped: pushed, done: moves },
    );
  }

  yield* solve(disks, 'A', 'C', 'B');

  yield frame(
    'unwind',
    moves === 0
      ? 'The stack is empty and no move was made. The answer is 0.'
      : `The stack is empty and the last frame has returned. ${moves} move${moves === 1 ? '' : 's'} for ${disks} disk${disks === 1 ? '' : 's'}, which is 2^${disks} - 1, and the stack was never more than ${disks} deep. Exponential work, linear memory: the two are independent, and only one of them will ever hurt you.`,
    { from: 'A', to: 'C', via: 'B', answer: moves },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Disk sizes (largest first)',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
      help: 'Only the number of disks matters; the sizes are what the rods display.',
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

const JS = `function hanoi(n, source, target, spare) {
  if (n === 0) return 0;                                            // @anchor base-case
  const left = hanoi(n - 1, source, spare, target);                 // @anchor call
  const moved = left + 1;                                           // @anchor move
  const right = hanoi(n - 1, spare, target, source);                // @anchor descend-again
  return moved + right;                                             // @anchor unwind
}`;

const PY = `def hanoi(n, source, target, spare):
    if n == 0:                                              # @anchor base-case
        return 0
    left = hanoi(n - 1, source, spare, target)              # @anchor call
    moved = left + 1                                        # @anchor move
    right = hanoi(n - 1, spare, target, source)             # @anchor descend-again
    return moved + right                                    # @anchor unwind`;

const JAVA = `class TowerOfHanoi {
    static long hanoi(int n, char from, char to, char via) {
        if (n == 0) return 0;                                      // @anchor base-case
        long left = hanoi(n - 1, from, via, to);                    // @anchor call
        long moved = left + 1;                                     // @anchor move
        long right = hanoi(n - 1, via, to, from);                  // @anchor descend-again
        return moved + right;                                      // @anchor unwind
    }
}`;

const CPP = `#include <string>
using std::string;

long hanoi(int n, char from, char to, char via) {
    if (n == 0) return 0;                                        // @anchor base-case
    long left = hanoi(n - 1, from, via, to);                      // @anchor call
    long moved = left + 1;                                       // @anchor move
    long right = hanoi(n - 1, via, to, from);                    // @anchor descend-again
    return moved + right;                                         // @anchor unwind
}`;

const NOTES = {
  'base-case': {
    javascript:
      'The one line that stops the recursion, and it is a *return* rather than a break or a flag: a base case has to produce a value, because every frame returns the number of moves its own subtree needed. This version counts instead of printing so it can be tested, and it still has to be a real recursive function to do it.',
    python:
      'The base case, and Python reaches it with a single `==` and no type ceremony. What every language needs here and nothing supplies for free is a *value*: the recursion is a sum, so a base case that returned nothing would make the addition above it meaningless.',
    java: 'The base case, and `n == 0` rather than `n <= 0` because the callers already guarantee `n >= 0` — a recursive function that can be called with a negative count is a function whose base case should be `n <= 0`, and choosing the looser test costs nothing and removes a class of bug.',
    cpp: 'The base case. `long` rather than `int` for the return type is the practical concern here: 2^n - 1 overflows `int` at n = 31, so a 31-disk tower — a genuinely small amount of work for a modern machine — would silently return a negative number.',
  },
  call: {
    javascript:
      'The first descent, and note that the arguments are *rotated*: the smaller disks go to the spare rod using the target rod as their stepping stone. Every other rod arrangement in this puzzle is wrong for exactly this reason, and getting the rotation right is the whole content of the algorithm. JavaScript is the only one of the four where the call stack can actually be inspected at runtime, which is why debugging recursion here is unusually pleasant.',
    python:
      "The first descent, with the rods rotated: source stays, target and spare swap roles. Python's recursion limit (1000 by default) is the one hard constraint this algorithm has, and it is why nobody writes a 20-disk tower in Python without either raising it or rewriting the recursion as an explicit stack — which is precisely what the animation on screen is.",
    java: 'The first descent, with the rods rotated. Note `char` parameters: the rods are single characters, so passing them is two bytes each and the rotation is a permutation of three values — cheap enough that the compiler does not bother, which is the right answer for a parameter that exists only to be swapped.',
    cpp: 'The first descent, with the rods rotated. The `char` parameters are the C++ counterpart of the Java ones, and the same note applies: the rotation is the algorithm, and it costs nothing, so the only thing to be careful of is that `(unsigned char)` casts are not needed here — unlike a character *table* index, these values are only ever compared and passed on.',
  },
  move: {
    javascript:
      'The `+ 1` is the single physical disk move this frame is responsible for, and it is legal for a reason the previous line guaranteed: after the first descent, all n-1 smaller disks are on the spare rod, so the largest disk is exposed. One move per frame is why the total is 2^n - 1 rather than something smaller, and it is also the proof that the arrangement is achievable rather than merely counted.',
    python:
      'The `+ 1`, which is the only thing in the whole function that corresponds to actually moving a disk. A version that printed the moves instead of counting them would put the print here, and the argument order would come straight from these three parameters — the recursion and the I/O are the same three lines with one line changed.',
    java: 'The `+ 1`, and the frame that contains it is the only one that ever performs a move. That is the structural reason the move count is 2^n - 1 and not something else: there are 2^n - 1 non-base-case frames, and each of them does exactly one move between two recursions.',
    cpp: 'The `+ 1`, in `long` arithmetic inherited from the return type. This is the line a real Hanoi would replace with an actual disk transfer, and the reason the counting version is still worth reading is that the swap of arguments on the next line is identical either way — the I/O never leaks into the recursion.',
  },
  'descend-again': {
    javascript:
      'The second descent, and it is not a copy of the first: the disks that were parked on the spare rod now have to come off the target rod, so the roles are rotated the *other* way round. The symmetry is what makes the trace readable — the same three steps at every depth, with the rods permuted, is the entire algorithm.',
    python:
      'The second descent, with the rods rotated the other way. Python evaluates the arguments left to right and binds them after, exactly as it does for tuple assignment, so the `n - 1` here and the `n - 1` on the previous line are two independent evaluations with no aliasing to worry about.',
    java: 'The second descent, with the rods rotated the other way. A real implementation would likely take a `Peg` object or an int index rather than three `char`s; three `char`s is chosen here so the argument rotation is visible in the source instead of hidden behind an enum, which is the more useful thing for a first reading.',
    cpp: 'The second descent, with the rods rotated the other way. Because the function is not overloaded, the C++ harness can take its address with a plain `&hanoi` and deduce the argument types — adding an overload for a version that moves an actual stack would break that, which is a small but real reason the counting version keeps this shape.',
  },
  unwind: {
    javascript:
      'The frame returns: `moved` plus whatever the second descent needed. Adding rather than multiplying is the arithmetic of the sequence — `f(n) = 2 f(n-1) + 1` solves to `2^n - 1` — and the two calls are the two halves of the "move everything else out of the way, move it back" plan. Note there is no explicit `pop`: the call stack does that on its own, which is the one thing recursion gives you for free.',
    python:
      'The frame returns, and the addition is the recurrence in code. Python unwinds the call stack by itself when the function returns, which is why the version on screen can render the stack without a single data structure of its own — the interpreter already keeps one.',
    java: 'The frame returns. The JVM keeps the call stack for you, unwinding one frame per `return`, which is why a Java recursion that goes too deep throws `StackOverflowError` rather than silently corrupting anything — a hard, loud failure at a depth of a few thousand frames.',
    cpp: 'The frame returns. A C++ recursion that goes too deep is undefined behaviour, not an exception: the stack is a real region of memory with a real guard page, so overflowing it is a segmentation fault rather than a catchable error. That difference is the single most important practical reason to prefer an explicit stack in production code.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'hanoi',
    python: 'hanoi',
    java: 'TowerOfHanoi.hanoi',
    cpp: 'hanoi',
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

const disksOf = (p: Preset): number => Number(p.params?.disks ?? 0);

/** The claim: 2^n - 1 moves, the same closed form the recurrence produces. */
const movesOf = (n: number): number => 2 ** n - 1;

const expectations: Expectation[] = PRESETS.map((p) => {
  const n = disksOf(p);
  return { presetId: p.id, args: [n, 'A', 'C', 'B'], result: movesOf(n) };
});

export const towerOfHanoiAlgo: AlgoDef<LinearFrame> = {
  id: 'tower-of-hanoi',
  title: 'Tower of Hanoi',
  category: 'recursion',
  summary:
    'Move a tower of n disks from one rod to another using a third, by moving the n-1 smaller disks out of the way, moving the big one, and moving the smaller ones back — which is 2^n - 1 moves.',
  intuition:
    'Reach for this not for the puzzle but for the shape: it is the smallest problem where a recursive plan is both correct and *forced*, so it is the place to learn what a call stack does. Three things transfer directly. The call stack is a data structure you did not have to build. The exponential cost comes from calling yourself twice, not from doing twice the work — which is the insight behind a whole family of divide-and-conquer algorithms. And stack depth is not stack traffic: five disks take 31 moves at a maximum depth of five, so if your language has a recursion limit, the limit is on the depth and not on the time.',
  complexity: {
    best: 'O(2^n)',
    average: 'O(2^n)',
    worst: 'O(2^n)',
    space: 'O(n)',
    note: 'Exponential in the number of disks, and the number is not a lower bound of cleverness — it is forced. Moving the largest disk needs the n-1 smaller ones on the spare rod, which needs the largest among *those* moved, and so on, so 2^n - 1 is optimal. The space is O(n) because the call stack never holds more than n frames, which is the pleasant surprise: the work is exponential and the memory is linear.',
  },
  traits: {
    inPlace: false,
    offline: true,
    allowsDuplicates: false,
    tags: ['recursive', 'exponential work', 'linear stack depth', 'optimal move count'],
  },
  viewport: 'linear',
  level: 'intermediate',
  params: [
    {
      key: 'disks',
      label: 'Disks',
      kind: 'number',
      min: 1,
      max: 7,
      step: 1,
      default: 3,
      help: '7 disks is 127 moves; beyond that the animation is unreadable anyway.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: towerOfHanoi,
  lesson,
  expectations,
  formatResult: (r) => `${r as number} moves`,
  anchors: ['base-case', 'call', 'move', 'descend-again', 'unwind'],
};

export default towerOfHanoiAlgo;

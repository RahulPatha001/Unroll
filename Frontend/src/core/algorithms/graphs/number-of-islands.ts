import { byLanguage } from '../../code/anchors.ts';
import { randomArray } from '../../input/generators.ts';
import type { AlgoInput, InputSpec } from '../../input/types.ts';
import { grid } from '../../input/types.ts';
import type { CellValue, GridFrame, Highlight } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Number of Islands — counting connected components on a grid.
 *
 * The code is four lines of idea wrapped around a flood fill: walk every cell,
 * and whenever you meet land that nobody has reached, count one island and flood
 * the whole region it belongs to. The count is the number of times the outer scan
 * *starts* a flood, which is why the flood needs no return value at all.
 *
 * ## The whole lesson is one line: which cells are neighbours?
 *
 * This is 4-connected, and 4-connected is stricter than almost anybody expects.
 * Two land cells that share only a *corner* are two islands, because a corner is
 * not a side. The `diagonal-touch` preset exists to make that undeniable: it is
 * three islands here and one island under 8-connectivity, and the only
 * difference between the two answers is four extra entries in a delta table.
 * The `done` frame computes the 8-connected count as well and tells you both
 * numbers, because "how many islands" is genuinely ambiguous and a student
 * deserves to know which convention they were just shown.
 *
 * The listings are 4-connected in all four languages, deliberately. The
 * alternative — a connectivity `ParamSpec` — would have to change the *answer*,
 * and the `expectations` table below is a claim about one specific answer.
 *
 * ## Why an explicit stack rather than recursion
 *
 * The recursive version is the one everyone writes first, and the reason it is
 * hard is that the interesting state is invisible: the call stack. `stack.length`
 * is the recursion depth, so the frames can show it, and `size` — the running
 * cell count of the island being flooded — is on screen for the whole flood. A
 * recursive version would also overflow the machine stack on a large open
 * region, because the depth tracks the island's diameter and not its area.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 *
 * Every grid here is hand-written, and the reason is worth stating: this
 * algorithm's behaviour is entirely a function of the grid's *topology*, so the
 * interesting inputs are named shapes rather than random noise. A seeded grid
 * gives you a count you cannot predict, which teaches nothing; the `diagonal`
 * preset gives you a count of 3 against 1 that you can predict the moment you
 * see the picture. The one seeded preset (`scattered`) is there for the shape a
 * real map has — irregular, no symmetry, several islands of unequal size — which
 * no hand-drawn grid is honest about.
 * ------------------------------------------------------------------ */

/** One string per row: `.` is land, `#` is water. */
function landGrid(lines: string[]): AlgoInput {
  if (lines.length === 0) return grid(0, 0, []);
  const width = Math.max(...lines.map((l) => l.length));
  const values: Array<number | string | null> = [];
  for (const line of lines) {
    for (let c = 0; c < width; c++) values.push(line[c] === '#' ? 0 : 1);
  }
  return grid(lines.length, width, values);
}

/**
 * A seeded map, from the one generator the rest of the app uses.
 *
 * `randomArray` over 0..9, thresholded at 4: roughly two cells in five come out
 * land, which is about the density a coastline has and reliably yields four or
 * five islands of unequal size — a shape no hand-drawn grid is honest about.
 * The seed is the only input, so the preset is reproducible from a shared URL
 * like every other one in the app.
 */
function scatteredGrid(seed: number, rows: number, cols: number): AlgoInput {
  const cells = randomArray(seed, rows * cols, 0, 9).map((v) => (v >= 4 ? 1 : 0));
  return grid(rows, cols, cells);
}

const PRESETS: Preset[] = [
  {
    id: 'scattered',
    label: 'Seeded coastline, 6×5',
    blurb:
      'Eighteen land cells in no arrangement anyone would draw on purpose: one sprawling 15-cell region and three singletons. The count is 4, and it is 4 only because 4-connectivity is the rule — all three singletons touch the big region at a corner, so 8-connectivity would call this a single island. The peak stack depth is 4, which is the most the flood ever owes at once.',
    input: scatteredGrid(4021, 6, 5),
  },
  {
    id: 'four-islands',
    label: 'Four islands, 6×6',
    blurb:
      'Four land regions of four different sizes — 2, 5, 2 and 4 cells — separated by solid water rows and columns, and none of them touching another at a corner. The answer is 4, and every one of them is found by the scan reaching the top-left corner of a region. Worth watching how little the flood does: the deepest stack in the whole run is 2, so this is almost entirely the scan stepping over water.',
    input: landGrid(['.##...', '.##..#', '######', '#.##..', '#.##..', '######']),
  },
  {
    id: 'one-landmass',
    label: 'One landmass, 4×5',
    blurb:
      'A single connected blob of 14 cells with a 2×2 bite out of the middle. The best case for the outer loop and the worst case for the flood: the scan finds the region at cell 0 and then spends nineteen cells confirming there is nothing else. The bite is what makes the flood interesting — the region is not a rectangle, so the stack has to go round it.',
    input: landGrid(['.....', '.###.', '.###.', '.....']),
  },
  {
    id: 'diagonal-touch',
    label: 'Diagonal touch, 4×4',
    blurb:
      'The trap. A 2×3 block of land with one cell standing alone at the top-left and one at the bottom-left, and each of those two touches the block only at a corner. Four-connected, that is THREE islands of sizes 1, 6 and 1. Add the four diagonals to the delta table and it is ONE. The input does not decide between those answers — a convention does — which is why the closing frame reports both counts.',
    input: landGrid(['.###', '#...', '#...', '.###']),
  },
  {
    id: 'all-land',
    label: 'All land, 3×3',
    blurb:
      'Nine cells, every one land, so the answer is 1. The flood still does real work: a depth-first walk of an open grid pushes its whole frontier before it pops anything, and the stack reaches depth 3 on a 3×3. The count is trivial; the traversal is not.',
    input: landGrid(['...', '...', '...']),
  },
  {
    id: 'all-water',
    label: 'All water, 3×3',
    blurb:
      'No land at all, so the answer is 0 and the flood never runs. Every one of the nine cells takes the `sinks` path, which is worth watching once: the "do nothing" branch is the common branch on a sparse map, and an implementation that counted candidates before filtering them would report 9 here.',
    input: landGrid(['###', '###', '###']),
  },
  {
    id: 'one-cell',
    label: 'One cell of land, 1×1',
    blurb:
      'A 1×1 grid with one land cell. The degenerate case, and the one that catches the two most common bugs in this family: a flood that assumes a neighbour exists, and a count that starts at 1 instead of 0. Here the answer is 1, obtained by counting the single flood and never entering the neighbour loop at all.',
    input: landGrid(['.']),
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/**
 * The neighbourhood rule, stated once. This four-element list *is* the
 * connectivity rule; everything downstream is a walk over the cells it produces.
 *
 * Adding `[-1, -1]`, `[-1, 1]`, `[1, -1]`, `[1, 1]` makes the 8-connected
 * variant, in which a corner touch merges two islands into one. That is the
 * entire change — and it is the change that makes `diagonal-touch` read 1
 * instead of 3.
 */
const FOUR_WAY: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
];

/** Drop empty groups. A legend entry reading "unvisited 0" is noise, and an
 * empty group is not on screen, so it must not be counted as a colour either. */
function visible(groups: Highlight): Highlight {
  const out: Highlight = {};
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 0) out[key] = list;
  }
  return out;
}

export function* numberOfIslands(ctx: RunContext): Generator<GridFrame> {
  const input = ctx.input as {
    type: 'grid';
    rows: number;
    cols: number;
    values: Array<number | string | null>;
  };
  const rows = Math.max(0, Number(input.rows) || 0);
  const cols = Math.max(0, Number(input.cols) || 0);
  const total = rows * cols;

  // The grid is never mutated, and `total` is authoritative: a hand-edited input
  // with the wrong number of cells must not produce a trace whose `cells` length
  // disagrees with `rows * cols`, because the viewport indexes it that way.
  const raw = (input.values ?? []) as CellValue[];
  const cells: CellValue[] = [];
  for (let i = 0; i < total; i++) cells.push(raw[i] ?? 0);

  /** Land is exactly 1 — the same convention the four listings are handed. */
  const isLand = (i: number): boolean => cells[i] === 1;
  const rowOf = (i: number): number => Math.floor(i / Math.max(1, cols));
  const colOf = (i: number): number => i % Math.max(1, cols);
  const at = (r: number, c: number): string => `row ${r}, col ${c}`;

  let land = 0;
  for (let i = 0; i < total; i++) if (isLand(i)) land++;

  /** Permanent per-island claim. Never cleared: this is the whole termination argument. */
  const claimed: boolean[] = new Array<boolean>(total).fill(false);
  /** Which island claimed each cell, so a note can name it. 0 means unclaimed. */
  const owner: number[] = new Array<number>(total).fill(0);
  /** Land claimed by a *finished* island — the `filled` field's whole job. */
  const finished: number[] = [];
  /** Land claimed by the island currently being flooded. */
  const working: number[] = [];
  /** The call stack, as a list. `stack.length` is the recursion depth. */
  const stack: number[] = [];

  let islands = 0;
  /*
   * `ops` counts *checks*: one per cell the outer scan examines, plus one per
   * neighbour a flood looks at. So the running total is
   * `rows * cols + 4 * (land cells claimed)`, which is the O(R·C) argument
   * written as arithmetic rather than as a Big-O. It is a count of work, not a
   * count of islands, and the two differ on every preset — which is the whole
   * reason both are on screen.
   */
  let ops = 0;
  let peakDepth = 0;

  /** Land nobody has reached yet: the cells that could still start an island. */
  const unclaimed = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < total; i++) if (isLand(i) && !claimed[i]) out.push(i);
    return out;
  };

  const snap = (
    anchor: string,
    note: string,
    o: {
      caption?: string;
      ops?: number;
      vars?: Record<string, CellValue | boolean>;
      highlight?: Highlight;
      cursor?: { row: number; col: number };
      result?: string;
    } = {},
  ): GridFrame => ({
    kind: 'grid',
    index: 0, // the materialiser owns this one
    anchor,
    note,
    rows,
    cols,
    cells: [...cells],
    mode: 'number',
    ...(o.cursor === undefined ? {} : { cursor: o.cursor }),
    filled: [...finished],
    ...(o.caption === undefined ? {} : { caption: o.caption }),
    ...(o.ops === undefined ? {} : { ops: o.ops }),
    ...(o.vars === undefined ? {} : { vars: o.vars }),
    ...(o.highlight === undefined ? {} : { highlight: visible(o.highlight) }),
    ...(o.result === undefined ? {} : { result: o.result }),
  });

  yield snap(
    'start',
    total === 0
      ? 'This grid has no cells at all, so there is nothing to scan. The count is 0 without the loops ever running, and the empty claim array is legal rather than merely lucky.'
      : `${total} cell${total === 1 ? '' : 's'} in a ${rows}×${cols} grid, ${land} of them land. Nothing is claimed yet, and the answer will be the number of times the scan meets land nobody has reached. A flood can only step to a cell that shares a *side*, so a corner touch is not a connection: adding the four diagonals to the delta table would make this the 8-connected version and merge every pair of corner-touching islands.`,
    {
      caption: `${rows}×${cols} · ${land} land`,
      ops,
      highlight: { unvisited: unclaimed() },
      vars: { rows, cols, land, islands, depth: 0 },
    },
  );

  for (let i = 0; i < total; i++) {
    if (ctx.shouldStop()) return;
    const r = rowOf(i);
    const c = colOf(i);
    const fresh = isLand(i) && !claimed[i];
    const left = unclaimed().length;
    ops++;

    yield snap(
      'scan',
      fresh
        ? `The scan reaches ${at(r, c)} — cell ${i} of ${total}. It is land and nobody has claimed it, so it is about to start island ${islands + 1}. ${left} unclaimed land cell${left === 1 ? '' : 's'} remain, and every one of them is a candidate for the count, so this is the line that decides the answer.`
        : isLand(i)
          ? `The scan reaches ${at(r, c)} — cell ${i} of ${total}. It is land, but island ${owner[i]} already claimed it during an earlier flood, so it is a candidate that has already been counted. ${left} unclaimed land cell${left === 1 ? '' : 's'} remain.`
          : `The scan reaches ${at(r, c)} — cell ${i} of ${total}. Water, so no island can start here. ${left} unclaimed land cell${left === 1 ? '' : 's'} remain, and the scan is only looking for the next of them.`,
      {
        caption: `scan ${i + 1} of ${total} · ${islands} island${islands === 1 ? '' : 's'}`,
        ops,
        highlight: { unvisited: unclaimed() },
        cursor: { row: r, col: c },
        vars: { row: r, col: c, land: left, islands, depth: 0 },
      },
    );

    if (!fresh) {
      yield snap(
        'sinks',
        isLand(i)
          ? `${at(r, c)} belongs to island ${owner[i]} already, so the scan steps over it. Skipping claimed cells is the entire reason the answer is the number of *islands* and not the number of land cells: without this line every land cell would start its own flood and the all-land preset would report 9 instead of 1.`
          : `${at(r, c)} is water, so there is nothing to start and nothing to claim. This is the common case on a sparse map, and it is why the useful statistic is the count of floods started rather than the number of cells examined.`,
        {
          caption: `scan ${i + 1} of ${total} · ${islands} island${islands === 1 ? '' : 's'}`,
          ops,
          highlight: { unvisited: unclaimed() },
          cursor: { row: r, col: c },
          vars: { row: r, col: c, islands, depth: 0 },
        },
      );
      continue;
    }

    islands++;
    claimed[i] = true;
    owner[i] = islands;
    working.push(i);
    stack.push(i);
    if (stack.length > peakDepth) peakDepth = stack.length;

    yield snap(
      'new-island',
      `${at(r, c)} is unclaimed land, so island ${islands} starts here and the count goes from ${islands - 1} to ${islands}. The cell is marked and pushed in the same breath: claiming *before* flooding rather than after is the one decision that keeps this terminating, because a cell can then be on the stack at most once.`,
      {
        caption: `island ${islands}`,
        ops,
        highlight: { picked: [i], unvisited: unclaimed() },
        cursor: { row: r, col: c },
        vars: { row: r, col: c, islands, size: 1, depth: stack.length },
      },
    );

    yield snap(
      'flood',
      `Cell ${i} goes on the stack and the flood starts. Stack depth ${stack.length} — that is the call depth a recursive \`floodFill(r, c)\` calling itself four times would be at right now, which is the number a recursive version hides completely. ${working.length} land cell${working.length === 1 ? '' : 's'} claimed so far in this island.`,
      {
        caption: `island ${islands} · ${working.length} cells · depth ${stack.length}`,
        ops,
        highlight: { visited: [...working], unvisited: unclaimed() },
        cursor: { row: r, col: c },
        vars: { row: r, col: c, islands, size: working.length, depth: stack.length },
      },
    );

    while (stack.length > 0) {
      if (ctx.shouldStop()) return;
      const p = stack.pop() as number;
      const pr = rowOf(p);
      const pc = colOf(p);
      const rest = stack.length;

      yield snap(
        'mark',
        `Pop ${at(pr, pc)} off the stack and look at its four side-neighbours. Depth drops to ${rest}, and this island now has ${working.length} cell${working.length === 1 ? '' : 's'}. The four *diagonal* neighbours are not examined at all: they are not generated, so nothing rejects them — which is the honest description of 4-connectivity, and the reason a diagonal wall is a genuine barrier rather than a thin one.`,
        {
          caption: `island ${islands} · ${working.length} cells · depth ${rest}`,
          ops,
          highlight: { current: [p], visited: [...working], unvisited: unclaimed() },
          cursor: { row: pr, col: pc },
          vars: { row: pr, col: pc, islands, size: working.length, depth: rest },
        },
      );

      for (const [dr, dc] of FOUR_WAY) {
        if (ctx.shouldStop()) return;
        const nr = pr + dr;
        const nc = pc + dc;

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          ops++;
          const where =
            nr < 0
              ? 'above the top row'
              : nr >= rows
                ? 'below the bottom row'
                : nc < 0
                  ? 'left of column 0'
                  : `right of column ${cols - 1}`;
          yield snap(
            'sinks',
            `${at(nr, nc)} falls ${where}, so the bounds guard drops it before any array read. This is the algorithm rather than defensive coding: a flat index of row * cols + col does not know where a row ends, so column ${cols} is *arithmetically* the first cell of the next row, and column -1 the last cell of this one. Skip the guard and the flood leaks across row boundaries, reporting too few islands, with no out-of-range access to catch it.`,
            {
              caption: `island ${islands} · ${working.length} cells · depth ${rest}`,
              ops,
              highlight: { current: [p], visited: [...working], unvisited: unclaimed() },
              cursor: { row: pr, col: pc },
              vars: { row: pr, col: pc, islands, size: working.length, depth: rest },
            },
          );
          continue;
        }

        const j = nr * cols + nc;
        ops++;

        if (!isLand(j)) {
          yield snap(
            'sinks',
            `${at(nr, nc)} is water, so there is nothing to claim on that side. ${at(pr, pc)} is the only land cell in this direction, and a flood cannot cross water — which is the whole reason a grid needs a *region* count rather than a parity or area argument.`,
            {
              caption: `island ${islands} · ${working.length} cells · depth ${rest}`,
              ops,
              highlight: { current: [p], visited: [...working], unvisited: unclaimed() },
              cursor: { row: pr, col: pc },
              vars: { row: nr, col: nc, from: `${pr},${pc}`, islands, size: working.length },
            },
          );
          continue;
        }

        if (claimed[j]) {
          yield snap(
            'sinks',
            `${at(nr, nc)} was already claimed by island ${owner[j]}, so this flood cannot reach through it. The claim is a *permanent* mark rather than a per-flood one, and that is what makes the finished islands pairwise disjoint — no cell can ever be counted into two of them, which is the classic way this algorithm is got wrong.`,
            {
              caption: `island ${islands} · ${working.length} cells · depth ${rest}`,
              ops,
              highlight: { current: [p], visited: [...working], unvisited: unclaimed() },
              cursor: { row: pr, col: pc },
              vars: { row: nr, col: nc, from: `${pr},${pc}`, islands, size: working.length },
            },
          );
          continue;
        }

        yield snap(
          'land',
          `${at(nr, nc)} shares a side with ${at(pr, pc)}, is land, and nobody has claimed it — so it joins island ${islands}, which now reaches ${working.length + 1} cells. Claim it and then push it, in that order: pushing first would let a second path reach the same cell and claim it twice. This is the only line where the connectivity rule lives, and the delta table it walks has four entries.`,
          {
            caption: `island ${islands} · ${working.length + 1} cells · depth ${rest + 1}`,
            ops,
            highlight: { current: [p], visited: [...working], unvisited: unclaimed() },
            cursor: { row: nr, col: nc },
            vars: {
              row: nr,
              col: nc,
              from: `${pr},${pc}`,
              islands,
              size: working.length + 1,
              depth: rest + 1,
            },
          },
        );

        claimed[j] = true;
        owner[j] = islands;
        working.push(j);
        stack.push(j);
        if (stack.length > peakDepth) peakDepth = stack.length;

        yield snap(
          'flood',
          `Push ${at(nr, nc)}. Depth goes from ${rest} to ${stack.length}, and the island has ${working.length} of its cells. The stack, not the grid, is the working set: nothing about the flood is stored in the cells themselves beyond the one-bit claim.`,
          {
            caption: `island ${islands} · ${working.length} cells · depth ${stack.length}`,
            ops,
            highlight: { visited: [...working], unvisited: unclaimed() },
            cursor: { row: nr, col: nc },
            vars: { row: nr, col: nc, islands, size: working.length, depth: stack.length },
          },
        );
      }
    }

    for (const cell of working) finished.push(cell);
    const claimedHere = working.length;
    working.length = 0;

    yield snap(
      'island',
      `Island ${islands} is complete: ${claimedHere} cell${claimedHere === 1 ? '' : 's'}, and they leave the working set for good. An empty stack is the proof that it is complete — no claimed cell has an unclaimed side-neighbour left, which is exactly what "this island is finished" means, so the count never had to guess. Deepest stack in this run so far: ${peakDepth}.`,
      {
        caption: `${islands} island${islands === 1 ? '' : 's'} · ${finished.length} land claimed`,
        ops,
        highlight: { unvisited: unclaimed() },
        vars: { islands, size: claimedHere, depth: 0, peak: peakDepth, land: finished.length },
      },
    );
  }

  /*
   * The 8-connected count, for the closing note ONLY. It is never the result and
   * never feeds a highlight — it exists so the final frame can say "this grid is
   * 3 islands under the rule you just watched and 1 under the other rule", which
   * is the only way a student finds out that the rule was a choice.
   *
   * Written as a repeated sweep rather than a second flood: no stack, no delta
   * table, just "absorb every unclaimed cell that has an 8-neighbour already
   * claimed, until a sweep changes nothing". Deliberately unlike the generator.
   */
  const eightWay = (): number => {
    const take: boolean[] = new Array<boolean>(total).fill(false);
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (!isLand(i) || take[i] === true) continue;
      count++;
      take[i] = true;
      for (let again = true; again; ) {
        again = false;
        for (let j = 0; j < total; j++) {
          if (!isLand(j) || take[j] === true) continue;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = rowOf(j) + dr;
              const nc = colOf(j) + dc;
              if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
              if (take[nr * cols + nc] === true) {
                take[j] = true;
                again = true;
              }
            }
          }
        }
      }
    }
    return count;
  };

  const eight = eightWay();

  yield snap(
    'done',
    total === 0
      ? 'An empty grid has 0 islands, and the scan never ran. Nothing to report beyond the fact that the degenerate case does not throw.'
      : `The scan looked at all ${total} cell${total === 1 ? '' : 's'} in ${ops} check${ops === 1 ? '' : 's'} and started ${islands} flood${islands === 1 ? '' : 's'}, so the answer is ${islands} island${islands === 1 ? '' : 's'} over ${finished.length} of ${land} land cell${land === 1 ? '' : 's'}.${eight === islands ? '' : ` Under 8-connectivity — the same code with four diagonals added to the delta table — this grid is ${eight} island${eight === 1 ? '' : 's'}, because the corner touches would merge.`} The peak stack depth was ${peakDepth}, which is the number a recursive version would have spent silently.`,
    {
      caption: `${islands} island${islands === 1 ? '' : 's'} · 4-connected`,
      ops,
      highlight: { unvisited: unclaimed() },
      result: String(islands),
      vars: { islands, land: finished.length, ops, peak: peakDepth, eight: eight },
    },
  );
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec: InputSpec = {
  fields: [
    {
      key: 'rows',
      label: 'Rows (. land, # water)',
      kind: 'words',
      default: (PRESETS[0]?.input.type === 'grid' ? rowsOf(PRESETS[0].input) : []) as string[],
    },
  ],
  build: (v: Record<string, unknown>): AlgoInput => toGrid(v.rows),
  sizeOf: (i: AlgoInput): number => (i.type === 'grid' ? i.rows * i.cols : 0),
};

/** Recover the editable row strings from a built grid input. */
function rowsOf(input: Extract<AlgoInput, { type: 'grid' }>): string[] {
  const out: string[] = [];
  for (let r = 0; r < input.rows; r++) {
    let line = '';
    for (let c = 0; c < input.cols; c++) {
      line += input.values[r * input.cols + c] === 1 ? '.' : '#';
    }
    out.push(line);
  }
  return out;
}

function toGrid(rows: unknown): AlgoInput {
  if (!Array.isArray(rows) || rows.length === 0) return grid(0, 0, []);
  const lines = rows.map((r) => String(r));
  const width = Math.max(...lines.map((l) => l.length));
  const values: Array<number | string | null> = [];
  for (const line of lines) {
    for (let c = 0; c < width; c++) values.push(line[c] === '#' ? 0 : 1);
  }
  return grid(lines.length, width, values);
}

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 * ------------------------------------------------------------------ */

const JS = `// The connectivity rule, stated once: these four deltas are the ONLY
// neighbours a flood may reach. Adding [-1,-1], [-1,1], [1,-1], [1,1] makes
// this the 8-connected version, in which a corner touch merges two islands.
const FOUR_WAY = [[-1, 0], [0, -1], [0, 1], [1, 0]];

function numberOfIslands(rows, cols, cells) {
  // cells is row-major: 1 is land, 0 is water. 0 is water, not "off the grid" —
  // the bounds check is a separate concern, and conflating the two is how a
  // wrap-around bug starts.
  const seen = new Array(rows * cols).fill(false);   // @anchor start
  const stack = [];
  let islands = 0;
  let size = 0;                                      // cells in the island being flooded
  for (let r = 0; r < rows; r++) {                   // @anchor scan
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (cells[i] !== 1 || seen[i]) continue;       // @anchor sinks
      islands++;                                     // @anchor new-island
      seen[i] = true;
      stack.push(i);
      while (stack.length > 0) {                     // @anchor flood
        const p = stack.pop();
        size++;                                      // @anchor mark
        const pr = (p / cols) | 0;
        const pc = p % cols;
        for (const [dr, dc] of FOUR_WAY) {
          const nr = pr + dr;
          const nc = pc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const j = nr * cols + nc;
          if (cells[j] !== 1 || seen[j]) continue;   // @anchor sinks
          seen[j] = true;
          stack.push(j);                             // @anchor land
        }
      }
      size = 0;                                      // @anchor island
    }
  }
  return islands;                                    // @anchor done
}`;

const PY = `# The connectivity rule, stated once: these four deltas are the ONLY
# neighbours a flood may reach. Adding (-1,-1), (-1,1), (1,-1), (1,1) makes
# this the 8-connected version, in which a corner touch merges two islands.
FOUR_WAY = ((-1, 0), (0, -1), (0, 1), (1, 0))


def number_of_islands(rows, cols, cells):
    # cells is row-major: 1 is land, 0 is water. 0 is water, not "off the grid";
    # the bounds check is a separate concern, and conflating the two is how a
    # wrap-around bug starts.
    seen = [False] * (rows * cols)                    # @anchor start
    stack = []
    islands = 0
    size = 0                                          # cells in the island being flooded
    for r in range(rows):                             # @anchor scan
        for c in range(cols):
            i = r * cols + c
            if cells[i] != 1 or seen[i]:              # @anchor sinks
                continue
            islands += 1                              # @anchor new-island
            seen[i] = True
            stack.append(i)
            while stack:                              # @anchor flood
                p = stack.pop()
                size += 1                             # @anchor mark
                pr, pc = divmod(p, cols)
                for dr, dc in FOUR_WAY:
                    nr = pr + dr
                    nc = pc + dc
                    if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                        continue
                    j = nr * cols + nc
                    if cells[j] != 1 or seen[j]:      # @anchor sinks
                        continue
                    seen[j] = True
                    stack.append(j)                   # @anchor land
            size = 0                                  # @anchor island
    return islands                                    # @anchor done`;

const JAVA = `import java.util.ArrayDeque;
import java.util.Deque;

class NumberOfIslands {
    // The connectivity rule, stated once: these four deltas are the ONLY
    // neighbours a flood may reach. Adding {-1,-1}, {-1,1}, {1,-1}, {1,1}
    // makes this the 8-connected version, where a corner touch merges islands.
    private static final int[][] FOUR_WAY = { {-1, 0}, {0, -1}, {0, 1}, {1, 0} };

    static int numberOfIslands(int rows, int cols, int[] cells) {
        // cells is row-major: 1 is land, 0 is water. 0 is water, not "off the
        // grid" -- the bounds check is separate, and conflating them is how a
        // wrap-around bug starts.
        boolean[] seen = new boolean[rows * cols];    // @anchor start
        Deque<Integer> stack = new ArrayDeque<>();
        int islands = 0;
        int size = 0;                                  // cells in the island being flooded
        for (int r = 0; r < rows; r++) {               // @anchor scan
            for (int c = 0; c < cols; c++) {
                int i = r * cols + c;
                if (cells[i] != 1 || seen[i]) continue;  // @anchor sinks
                islands++;                             // @anchor new-island
                seen[i] = true;
                stack.push(i);
                while (!stack.isEmpty()) {             // @anchor flood
                    int p = stack.pop();
                    size++;                            // @anchor mark
                    int pr = p / cols;
                    int pc = p % cols;
                    for (int[] d : FOUR_WAY) {
                        int nr = pr + d[0];
                        int nc = pc + d[1];
                        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                        int j = nr * cols + nc;
                        if (cells[j] != 1 || seen[j]) continue;  // @anchor sinks
                        seen[j] = true;
                        stack.push(j);                 // @anchor land
                    }
                }
                size = 0;                              // @anchor island
            }
        }
        return islands;                                // @anchor done
    }
}`;

const CPP = `#include <vector>
using std::vector;

// The connectivity rule, stated once: these four deltas are the ONLY
// neighbours a flood may reach. Adding {-1,-1}, {-1,1}, {1,-1}, {1,1} makes
// this the 8-connected version, in which a corner touch merges two islands.
static const int DR[4] = { -1, 0, 0, 1 };
static const int DC[4] = { 0, -1, 1, 0 };

int number_of_islands(int rows, int cols, const vector<int>& cells) {
    // cells is row-major: 1 is land, 0 is water. 0 is water, not "off the grid";
    // the bounds check is a separate concern, and conflating the two is how a
    // wrap-around bug starts. cells arrives by const reference and is never
    // modified, so the caller's map is untouched.
    vector<bool> seen((size_t)rows * (size_t)cols, false);   // @anchor start
    vector<int> stack;
    stack.reserve((size_t)rows * (size_t)cols);
    int islands = 0;
    int size = 0;                                         // cells in the island being flooded
    for (int r = 0; r < rows; r++) {                      // @anchor scan
        for (int c = 0; c < cols; c++) {
            int i = r * cols + c;
            if (cells[i] != 1 || seen[i]) continue;        // @anchor sinks
            islands++;                                     // @anchor new-island
            seen[i] = true;
            stack.push_back(i);
            while (!stack.empty()) {                       // @anchor flood
                int p = stack.back();
                stack.pop_back();
                size++;                                    // @anchor mark
                int pr = p / cols;
                int pc = p % cols;
                for (int k = 0; k < 4; k++) {
                    int nr = pr + DR[k];
                    int nc = pc + DC[k];
                    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                    int j = nr * cols + nc;
                    if (cells[j] != 1 || seen[j]) continue;  // @anchor sinks
                    seen[j] = true;
                    stack.push_back(j);                   // @anchor land
                }
            }
            size = 0;                                     // @anchor island
        }
    }
    return islands;                                       // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'One boolean per cell, all false. The grid itself is never written to, so the caller still has the original map when the count comes back — and the `new Array(n).fill(false)` is a genuine snapshot, not a shared default, which is the same aliasing trap the trace layer has to avoid on every frame.',
    python:
      'A list of `rows * cols` booleans, and `[False] * n` builds the whole thing in one allocation because the elements are immutable — a list of mutable counters could not be written that way, and that is a real constraint of using Python here rather than a stylistic choice.',
    java: 'A primitive `boolean[]`, so one byte per cell and no boxing, and the default element is already `false` so there is no fill to write. The flat index `r * cols + c` is the only addressing scheme, which is why every later line recomputes it rather than carrying a second counter that could drift.',
    cpp: 'A `vector<bool>`, which is bit-packed rather than one byte per cell, so a million-cell grid costs 125 KB of claimed flags. It is a `vector<bool>` specialisation and not a real vector — `auto& b = seen[i]` does not compile, which is the only thing anyone has ever wanted from it.',
  },
  scan: {
    javascript:
      'The outer double loop, in row-major order, and the answer is simply the number of times a flood starts from here. Row-major is only there for the animation: because a finished island leaves every one of its cells claimed, *any* scan order returns the same count, which is the reassuring half of this algorithm.',
    python:
      '`range(rows)` over `range(cols)`, with the flat index recomputed as `r * cols + c` on every cell rather than kept in a counter — there is no second variable that can drift out of step with the first, which is the cheapest possible way to avoid an off-by-one that only shows up on the last row.',
    java: 'The two `for` loops are the entire outer structure, and the per-cell "is this unclaimed land" decision is made on the next line because Java has no way to test a whole row at once. Note the `continue`: there is no `else`, and the loop body below simply does not run for water.',
    cpp: 'A plain nested loop, and the flat index is recomputed inside rather than carried across the inner loop, so there is no state to keep in step. `int` is the right width for an index here; a grid large enough to overflow it is a grid whose cells will not fit in memory anyway.',
  },
  sinks: {
    javascript:
      'This guard fires twice per flood as well as once per scan, and on a 4-connected grid the overwhelming majority of all work is the flood-side copy: four neighbour checks per claimed cell, nearly all of which land here. In the scan it is the line that makes the answer a count of *regions* — without it every land cell would start its own flood.',
    python:
      '`continue` rather than an `if` block, because nothing follows it in the loop body. The second occurrence is the flood-side guard, and it is worth being precise about what it does *not* do: it never rejects a diagonal cell, because a diagonal is never generated. The four-way rule is a property of the delta table, not of this test.',
    java: 'Two copies of the same guard, and the bounds test has to come before the array read on both. Getting that order wrong is the bug that makes an island count silently too high: for a cell in the last column, `nc == cols` gives `nr * cols + cols`, a perfectly valid index into the *next* row, so no exception is thrown and no edge case is reported.',
    cpp: 'The first of the two guards is the load-bearing one, and the reason is arithmetic rather than memory safety: `nr * cols + nc` with `nc == -1` is `nr * cols - 1`, which for `nr > 0` is a valid index into the *previous* row. Skipping the bounds test does not crash here, it silently fuses two islands — so the test is the algorithm, not defensive coding.',
  },
  'new-island': {
    javascript:
      'The counter moves and the claim is written before the flood begins, which is why the intermediate frames can report an island that is not finished yet. Marking *before* pushing is the decision that separates this from an infinite loop: a cell can then be on the stack at most once, however many paths reach it.',
    python:
      'The increment and the claim happen together, so there is never a moment when the count is right but the mark is not. A recursive version would read identically with `islands += 1` on the line before the recursive call; the explicit stack keeps the same order because it is the loop, not the call, that is being counted.',
    java: '`islands++` on an `int`, and the two writes that follow are the same invariant as everywhere else in the listing: claim, then push. Swapping them is a bug that only manifests on a region with a hole in it, where two different paths can reach the same cell and claim it into two islands.',
    cpp: 'The counter moves before any of the work, so the count shown during a flood is the count that island will have when it is finished. `seen` is a `vector<bool>` so the claim is one bit, which is why a 1×1 grid of land and a 10,000-cell blob cost the same kind of write.',
  },
  flood: {
    javascript:
      'The `while` that walks the whole region. An explicit stack rather than recursion, so the depth the recursive version would spend is a number you can read: `stack.length` here is the call depth of `floodFill(r, c)` calling itself four times. The island is finished when the stack empties, not when this loop is escaped.',
    python:
      '`while stack:` is truthy-while-non-empty, and `append`/`pop` on the end of a list are amortised O(1), which is what makes a list the right stack. A recursive version would be four lines shorter and would run out of machine stack on one large open region, because the depth tracks the island size rather than its diameter.',
    java: '`ArrayDeque` driven by `push`/`pop` — an O(1) head insert, not `add`/`remove(0)`, which is the O(n) mistake people make when they reach for `ArrayList` as a stack. `isEmpty()` is the island-completion test: an empty stack means no claimed cell has an unclaimed side-neighbour left.',
    cpp: 'A `std::vector<int>` used as a stack, with `reserve` so a large island never reallocates mid-flood — which matters more than it looks, because a reallocation invalidates every pointer and iterator into the vector. `std::stack<int>` would be more idiomatic and would also hide the `reserve`; the raw vector is here so the capacity is visible.',
  },
  mark: {
    javascript:
      "Pop the newest cell rather than the oldest, which is what makes this depth-first: on an open 3×3 the stack ends up holding a whole row rather than a ring. The `size++` is the island's cell count, which is the number the frames report for the whole flood and the one a reader actually wants to watch climb.",
    python:
      '`pop()` with no argument, and the contrast with `pop(0)` is the whole difference between a flood that pours into one corner and a flood that sweeps outwards in rings. `divmod(p, cols)` then recovers the coordinates, which is the price of storing a flat index on the stack — cheaper than storing a tuple per cell.',
    java: "`int p = stack.pop()` unboxes an `Integer`, and the two divisions recover the coordinates from the flat index. Java truncates towards zero, which is correct here only because the next line's bounds guard rejects anything negative — that ordering is the entire reason the guard has to precede the array read.",
    cpp: '`back()` then `pop_back()`, read before removal because the two-step is the only interface `std::vector` offers and there is no combined operation. Storing a flat `int` and dividing it back into `pr`/`pc` is why the stack is `vector<int>` and not `vector<pair<int, int>>`.',
  },
  land: {
    javascript:
      'Two writes, and the order is the invariant: claim, then push. Pushing first would let a second path reach the same cell and claim it twice, which on a region with a hole in it inflates the working set and makes the "island complete" proof at the end of the flood a lie. This is also the only line where the connectivity rule shows up, and `FOUR_WAY` has four entries.',
    python:
      'The same two writes, in the same order, for the same reason. Note carefully what is *absent*: the four diagonals are not tested and rejected here, they are never computed, because the loop iterates a four-entry tuple. That is the honest description of 4-connectivity — a corner touch is a wall, not a thin wall.',
    java: "A `for (int[] d : FOUR_WAY)` over a two-element array per direction, the idiomatic Java spelling of a delta table and the direct analogue of Python's tuple of pairs. The outer array boxes its `int[]` rows once, statically; a `record Point(int dr, int dc)` would read better and would allocate per cell.",
    cpp: 'Two parallel `int` arrays indexed in lockstep, rather than an array of pairs: it stays in cache, and it makes the "add four diagonals" edit obviously a two-array edit. The claim still precedes the push, which is the invariant that bounds the stack by the island size rather than by the number of paths through it.',
  },
  island: {
    javascript:
      'The stack is empty, which is the *proof* that the island is finished rather than an assumption: no claimed cell has an unclaimed side-neighbour left, which is precisely the definition of the island boundary. `size` resets for the next island, and the claimed cells do not become unclaimed — they become the answer.',
    python:
      'Control fell out of the `while` rather than out of a `break`, because there is nothing to break out of: the loop condition alone ends the flood. The claimed cells stay claimed for the rest of the run, so a later flood can never wander back into this island — which is why the outer scan only ever has to *start* floods.',
    java: 'The same fall-through, and `size = 0` resets the per-island tally that `mark` has been incrementing. It is the only bookkeeping the listing keeps besides the count itself, and it is worth keeping: a run of equal sizes means a run of equal blobs, which is information the count throws away.',
    cpp: 'The stack empties, `size` resets, and the loop over `r` and `c` resumes. Note there is no early `return` anywhere in the body — every exit is a `continue` or a loop condition, so the single `return` at the bottom is the only way out and there is exactly one place where the answer is produced.',
  },
  done: {
    javascript:
      'One number: how many times the outer scan started a flood. The claim array is discarded and the grid is unchanged, so nothing is handed back except the count — which is the right shape for the question. An empty input returns 0 without ever entering the loops, because the counters start at zero and not at one.',
    python:
      'A bare `int`, and no `return` inside either loop, so control always reaches this one line. Returning the claim set as well would be more informative and would give the caller a second thing to unpick; the count is what "number of islands" means, and the shapes are what the animation is for.',
    java: 'A single `int` by value, so there is no array-aliasing hazard in the result and no defensive copy to forget. Returning `boolean[]` instead would hand back the machinery rather than the answer, and would let a caller mutate the evidence for the next caller.',
    cpp: 'A single `int`; `seen` and `stack` are destroyed on return and `cells` was never modified. Returning `std::vector<bool>` would be the machinery, not the answer, and for a large grid it would be the larger of the two by a factor of eight.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'numberOfIslands',
    python: 'number_of_islands',
    java: 'NumberOfIslands.numberOfIslands',
    cpp: 'number_of_islands',
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

/**
 * The independent reference, written naively on purpose.
 *
 * No stack, no delta table, no `seen` array: for each unclaimed land cell it
 * counts an island and then grows the region by *repeated sweeps* — scan every
 * cell, absorb every unclaimed land cell that has any 4-way neighbour already in
 * the region, and go round again until a sweep absorbs nothing. It is
 * O((R·C)²) and would be a terrible way to do the job, which is exactly why it
 * is a useful reference: it is hard to write wrong, and it shares no structure
 * whatsoever with the generator above. The generator never calls it.
 */
export function naiveIslandCount(
  rows: number,
  cols: number,
  cells: Array<number | string | null>,
): number {
  const r0 = Math.max(0, Number(rows) || 0);
  const c0 = Math.max(0, Number(cols) || 0);
  const total = r0 * c0;
  if (total === 0) return 0;
  const land = (i: number): boolean => cells[i] === 1;
  const claimed: boolean[] = new Array<boolean>(total).fill(false);

  let islands = 0;
  for (let start = 0; start < total; start++) {
    if (!land(start) || claimed[start] === true) continue;
    islands++;
    claimed[start] = true;
    for (let grew = true; grew; ) {
      grew = false;
      for (let j = 0; j < total; j++) {
        if (!land(j) || claimed[j] === true) continue;
        // Brute-force adjacency: ask every already-claimed cell whether it is a
        // side-neighbour of j. `dr + dc === 1` is exactly "shares a side".
        for (let k = 0; k < total; k++) {
          if (claimed[k] !== true) continue;
          const dr = Math.abs(Math.floor(j / c0) - Math.floor(k / c0));
          const dc = Math.abs((j % c0) - (k % c0));
          if (dr + dc === 1) {
            claimed[j] = true;
            grew = true;
            break;
          }
        }
      }
    }
  }
  return islands;
}

/** The three arguments the four listings receive, in that order. */
const claimOf = (p: Preset): [number, number, number[]] => {
  const input = p.input;
  if (input.type !== 'grid') return [0, 0, []];
  const cells = (input.values ?? []).map((v) => (v === 1 ? 1 : 0));
  return [input.rows, input.cols, cells];
};

const expectations: Expectation[] = PRESETS.map((p) => {
  const [rows, cols, cells] = claimOf(p);
  return { presetId: p.id, args: [rows, cols, cells], result: naiveIslandCount(rows, cols, cells) };
});

export const numberOfIslandsAlgo: AlgoDef<GridFrame> = {
  id: 'number-of-islands',
  title: 'Number of Islands',
  category: 'graphs',
  summary:
    'Sweep the grid, and every time the sweep meets land no flood has reached, count one island and flood the whole four-way region so it can never be counted again.',
  intuition:
    'Reach for this whenever the question is "how many separate things are in this picture" and the things are defined by *touching* rather than by a label: coastline length, connected components in an image, territories on a risk map, rooms in a floor plan, islands in an archive of scanned pages. The two things to take away are that the count is a by-product of the traversal rather than a separate computation, and that the answer is only as well defined as the neighbourhood rule. If you need the regions themselves and not just the number, `flood-fill` from a chosen start cell is the same flood with one seed instead of a sweep.',
  complexity: {
    best: 'O(R · C)',
    average: 'O(R · C)',
    worst: 'O(R · C)',
    space: 'O(R · C)',
    note: "Every cell is examined once by the scan and claimed at most once by a flood, and each claim looks at exactly four neighbours, so there is no input that makes this slower — 4-connected versus 8-connected is a constant factor, not a complexity. The one caveat is the stack: it is bounded by the island, not by the grid, so a recursive version recurses to the island's diameter and overflows the machine stack on one large open region while the iterative version is unaffected.",
  },
  traits: {
    // No `stable`: that is a sorting claim and there is no ordering here. The
    // honest flags are the two that change how it must be written — it needs an
    // extra array, and it needs the whole grid before it can answer.
    inPlace: false,
    online: false,
    offline: true,
    tags: ['grid', 'traversal', 'flood fill', 'counting', 'four-way', 'connected components'],
  },
  viewport: 'grid',
  level: 'intermediate',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: numberOfIslands,
  lesson,
  expectations,
  formatResult: (r) => `${r} island${r === 1 ? '' : 's'}`,
  anchors: ['start', 'scan', 'sinks', 'new-island', 'flood', 'mark', 'land', 'island', 'done'],
};

export default numberOfIslandsAlgo;

import type { Article } from '../types.ts';

/**
 * Graph traversal in practice.
 *
 * ## Why this is a second article rather than more of the first
 *
 * `bfs-and-dfs` answers "what is the difference between these two, and which do I
 * reach for". This one answers "what do I actually write when a problem says
 * *reachable*". They are different skills, and the first article is already long
 * enough that adding four worked problems to it would bury the idea it exists to
 * isolate — which is that the whole difference is one container.
 *
 * The split also matches how the subject is normally taught. The traversal is a
 * mechanism; the four patterns below are the mechanism's uses, and they are the four
 * that come up in essentially every graph interview. Learn the mechanism once
 * ([two traversals, one visited set](/learn/bfs-and-dfs)) and this page becomes a list
 * of things to recognise.
 *
 * ## The one thing all four share
 *
 * There is exactly one loop in all of them, and it is the loop from that article:
 * take a node off the container, mark and enqueue its unclaimed neighbours. Every
 * difference between the four is a decision made *around* that loop, and the table
 * below is the whole of it. The container is not even one of the decisions — it is
 * fixed by the problem, which is precisely the point `bfs-and-dfs` exists to make.
 */
export const TRAVERSAL_IN_PRACTICE: Article = {
  slug: 'traversal-in-practice',
  title: 'Traversal in practice',
  dek: 'Four problems that are one loop, plus the two things wrapped around it — where you start, and what you keep.',
  category: 'graphs',
  tags: ['bfs', 'dfs', 'connected components', 'islands', 'shortest path', 'grid'],
  readMinutes: 16,
  algoId: 'number-of-islands',
  body: [
    {
      kind: 'p',
      text: 'Every pattern on this page is the same traversal you have already met, with a different answer to two questions: **where do you start**, and **what do you write down about each node you reach**. The container is not one of the questions — it is fixed by the problem, and the [previous article](/learn/bfs-and-dfs) is about why.',
    },
    {
      kind: 'table',
      head: ['Pattern', 'Where you start', 'What you keep per node', 'The extra idea'],
      rows: [
        ['Has path', 'one node', 'a boolean', 'stop early'],
        ['Shortest path', 'one node', 'a distance **and a parent**', 'read the parents back'],
        ['Connected components', '**every unclaimed node**', 'a boolean', 'count the floods'],
        ['Island count', '**every unclaimed cell**', 'a boolean', 'count the floods'],
      ],
    },
    {
      kind: 'p',
      text: 'The last two rows are the ones people miss, and they are the reason this page exists. A traversal started from one node only ever finds one component, so "how many components are there" is not a traversal at all — it is a traversal wrapped in a loop over all the nodes, and the count is the number of times that loop managed to start one.',
    },
    {
      kind: 'video',
      url: 'https://www.youtube.com/watch?v=tWVWeAqZ0WU',
      title: 'Graph Algorithms for Technical Interviews — Full Course',
      source: 'William Fiset, on the freeCodeCamp channel · about 2 hours',
      note: 'The second half of this course works through these exact four patterns in this order, with a Java implementation of each. Watch it after this page rather than instead of it: you will recognise every line, and the value is seeing them solved start to finish rather than in isolation.',
    },

    { kind: 'h2', text: '1. Is there a path at all?' },
    {
      kind: 'p',
      text: 'The simplest question, and the one that makes the rest feel easy, because it needs no extra state at all: a boolean per node, and you are done. Either traversal works. BFS is the better default because it answers the harder question too, and DFS is the better one when you are also looking for a route.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `function hasPath(adj: number[][], s: number, f: number): boolean {
  const seen = new Array<boolean>(adj.length).fill(false);
  const stack: number[] = [s];
  seen[s] = true;

  while (stack.length > 0) {
    const u = stack.pop()!;
    if (u === f) return true;     // early exit: no reason to finish the walk
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      stack.push(v);
    }
  }
  return false;                   // the container emptied without meeting f
}`,
      caption:
        'Stack or queue, this is the pattern to recognise first. The early exit is also why the recursive form is usable here: the depth is bounded by how far f is, not by the size of the graph, in the cases people actually ask.',
    },
    {
      kind: 'p',
      text: 'Two questions get asked alongside it, and both are the same traversal. **Is the path from `s` to `f` the same in both directions** is the undirected-graph question. **Is the graph a tree** is the other: a graph is a tree exactly when a DFS from any node finds every other node **and** every node was reached by exactly one parent. A cycle in an undirected graph shows up as a node that would otherwise have been claimed twice.',
    },
    {
      kind: 'stepper',
      algoId: 'dfs',
      caption:
        'The undirected preset: every node has a way back, so the "already seen" check is doing real work on the way out and not just guarding against a forward edge.',
      preset: 'undirected',
    },

    { kind: 'h2', text: '2. The shortest path, and the route to it' },
    {
      kind: 'p',
      text: 'Now the container is not a choice. Shortest-by-hops means breadth-first, and the reason is the order: nodes leave the queue in non-decreasing distance, so the first time a node is claimed it is by a route with the fewest edges. No relaxation, no comparing against a best-so-far — BFS gets the answer for free by being in the right order.',
    },
    {
      kind: 'p',
      text: 'The extra state is a **parent**: one more array and one more assignment, and the route is available afterwards. The full listing is in [the previous article](/learn/bfs-and-dfs), because "a distance is not a path" belongs there. What is worth repeating here is that the parent has to be written **inside** the same branch that sets the distance, since that branch is the only moment you know the arrival was shortest.',
    },
    {
      kind: 'stepper',
      algoId: 'bfs',
      caption:
        'The DAG preset: four columns, edges only rightwards. The L-badges are hop counts and they never decrease, which is the whole guarantee in one picture.',
      preset: 'dag',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Unweighted only, and the failure is a plausible number',
      text: 'BFS optimises hop count, so on a weighted graph it will confidently return a short-but-expensive route and call it shortest. There is no error and no NaN — the answer is simply about a different thing. If the graph has weights, you wanted [Dijkstra](/learn/shortest-paths), and the only cost of finding that out is one careful read of the input format.',
    },

    { kind: 'h2', text: '3. How many pieces is this?' },
    {
      kind: 'p',
      text: 'This is the pattern that catches people, because the hard part is not the traversal — it is noticing that a traversal started from one node finds exactly one component and never tells you about the rest. The fix is a loop around the traversal, and the count then falls out of it for free.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `function countComponents(adj: number[][]): number {
  const seen = new Array<boolean>(adj.length).fill(false);
  let components = 0;

  for (let v = 0; v < adj.length; v++) {
    if (seen[v]) continue;     // already claimed by an earlier flood
    components++;              // an unclaimed node IS a new component
    dfs(v, adj, seen);          // flood everything it can reach
  }
  return components;
}

// The same loop, when you want the biggest piece rather than how many.
function largestComponent(adj: number[][], n: number): number {
  const seen = new Array<boolean>(n).fill(false);
  let best = 0;

  for (let v = 0; v < n; v++) {
    if (seen[v]) continue;
    let size = 0;
    const stack: number[] = [v];
    seen[v] = true;
    while (stack.length > 0) {
      const u = stack.pop()!;
      size++;                  // count on POP: every node is popped exactly once
      for (const w of adj[u]) {
        if (seen[w]) continue;
        seen[w] = true;
        stack.push(w);
      }
    }
    best = Math.max(best, size);
  }
  return best;
}`,
      caption:
        'Count on pop, mark on push. Counting on push would tally a node once per incoming edge — a number nobody can sanity-check by eye.',
    },
    {
      kind: 'stepper',
      algoId: 'bfs',
      caption:
        'The islands preset again, and this time as the shape of the pattern rather than as a warning: the untouched badge is not a failure, it is the second component waiting for the outer loop to start it.',
      preset: 'islands',
    },
    {
      kind: 'p',
      text: 'The reason the outer loop works at all is the same mark-on-push rule from before, now doing double duty. When the inner flood returns, everything reachable from `v` is marked, so the outer loop skips all of it on its way past — and the next unmarked node it finds is necessarily the seed of a **new** component, because if it were reachable from the previous one it would already be marked. The counting needs no extra bookkeeping; it needs the visited set to be complete when the flood returns.',
    },

    { kind: 'h2', text: '4. The same thing on a grid' },
    {
      kind: 'p',
      text: 'A grid is a graph. A cell is a node and its neighbours are its edges, which is the reframing that turns a pile of coordinate juggling into the traversal you already know. The only new thing is that you build the edges as you go instead of storing them, and the one decision is which cells count as neighbours.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `// Four-way. Diagonals are NOT neighbours, and the problem decides that
// for you — see the note under this listing.
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function numIslands(grid: string[][]): number {
  if (grid.length === 0) return 0;
  const rows = grid.length;
  const cols = grid[0].length;
  let islands = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 'L') continue;

      islands++;                    // an unclaimed land cell STARTS one island
      const queue: Array<[number, number]> = [[r, c]];
      grid[r][c] = 'W';             // claim on PUSH, mutating as we go

      for (let head = 0; head < queue.length; head++) {
        const [y, x] = queue[head];
        for (const [dy, dx] of DIRS) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
          if (grid[ny][nx] !== 'L') continue;
          grid[ny][nx] = 'W';
          queue.push([ny, nx]);
        }
      }
    }
  }
  return islands;
}`,
      caption:
        'The bounds check comes before the value check on purpose: indexing off the end throws, and a throw inside a loop over a million cells is a crash rather than a wrong answer.',
    },
    {
      kind: 'p',
      text: 'This mutates the input, which is the usual competitive-programming style and is worth understanding rather than copying. Writing `W` over the land you have claimed is exactly what the `if (grid[r][c] !== "L") continue` guard is testing: it is a visited set you are holding in the input, and that is why "which cells did the flood start from" is unrecoverable afterwards. The visualiser here keeps the claims in a **separate** array instead, so you can watch a cell be claimed without the map changing. Worth knowing, because the same choice in your own code decides whether you can still answer a follow-up question about the input you were given.',
    },
    {
      kind: 'stepper',
      algoId: 'number-of-islands',
      caption:
        'The four-islands preset. The count is a by-product of the outer loop: each unclaimed land cell starts exactly one flood, so counting islands is counting floods.',
      preset: 'four-islands',
    },
    {
      kind: 'stepper',
      algoId: 'flood-fill',
      caption:
        'The same traversal with a colour instead of a count. Flood fill is the recursion-friendly shape, which is why it is usually written recursively while island counting is not.',
      preset: 'barrier',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Four-way or eight-way is a convention, and it is not yours',
      text: 'The staircase preset has a diagonal wall, and a four-way fill correctly refuses to cross it: a corner is not a side. Number of islands then turns the same choice into a count, and the same diagonal-touch grid is **three** islands under four-way and **one** under eight-way. Neither answer is the wrong one. The problem statement decides, and when it does not say, the platform convention is the answer — so read the statement before you write the `DIRS` array.',
    },

    { kind: 'h2', text: 'Recognising which one you have been given' },
    {
      kind: 'ul',
      items: [
        '**"Can you get from A to B", "does a path exist":** either traversal, boolean, stop early.',
        '**"Shortest number of steps", "fewest moves":** BFS, plus a parent array if it wants the route.',
        '**"How many groups / regions / islands":** the outer loop. Look for the words **connected**, **component**, **cluster** and **region** — they all mean the same thing here.',
        '**"The biggest group":** the same loop, counting the nodes each flood popped.',
        '**"Replace a region, or change its colour":** flood fill, and recursion is fine because the depth is bounded by the grid.',
        '**Anything with weights:** none of these. [Dijkstra or Bellman-Ford](/learn/shortest-paths).',
        '**"An order that respects prerequisites":** not a traversal at all. [Kahn and the topological sort](/learn/bfs-and-dfs).',
      ],
    },
    {
      kind: 'p',
      text: 'Two questions to ask before you write a line, because they decide the container and nothing else will tell you. **Does the order of arrival matter** — if yes, BFS. **Am I being asked about one component or all of them** — if all, you need the outer loop. Everything after those two answers is the loop you already have.',
    },
    {
      kind: 'p',
      text: 'Practice order matters too, and it is not alphabetical: has-path, then connected components, then island counting, then shortest path last. The first three are reachability with a twist and can be solved with nothing but a boolean; shortest path is the first one where the container choice changes the answer. When you want these same ideas as interview questions across six sites, they are collected in [the practice roadmap](/roadmap).',
    },
  ],
};

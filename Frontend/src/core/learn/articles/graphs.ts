import type { Article } from '../types.ts';

/**
 * Graphs.
 *
 * Four articles, because ten algorithms are four conversations:
 *
 *  - `bfs-and-dfs` — how a graph is stored, reachability, and what changes when
 *    you swap the container. The mechanism, in isolation.
 *  - `traversal-in-practice` (in `traversal.ts`) — the four interview problems
 *    that mechanism solves, and the two questions that pick between them.
 *  - `shortest-paths` — the moment an edge stops being a step and starts being a
 *    cost, and the three different prices of that.
 *  - `minimum-spanning-trees` — two greedy algorithms that provably agree on the
 *    total and, on a disconnected graph, answer two different questions.
 *
 * Two facts below recur, and both are deliberate rather than accidental:
 *
 *  - **`layer` is not a hop count in every module.** BFS badges nodes with their hop
 *    count, DFS with their recursion depth, and topological sort with their position
 *    in the output. They look like the same badge and are three different numbers.
 *  - **Four-way connectivity is hard-wired** in flood fill and number of islands, and
 *    the staircase preset exists to show what that costs.
 */
export const BFS_AND_DFS: Article = {
  slug: 'bfs-and-dfs',
  title: 'Two traversals, one visited set',
  dek: 'Breadth-first and depth-first differ by exactly one data structure — and that is why they answer different questions.',
  category: 'graphs',
  tags: ['traversal', 'queue', 'stack', 'reachability', 'connected components'],
  readMinutes: 20,
  algoId: 'bfs',
  body: [
    {
      kind: 'p',
      text: 'Breadth-first search and depth-first search are usually taught as two algorithms, which is why they get taught as two ideas. They are one algorithm with one line different: BFS takes the next node off the **front** of a queue, DFS takes it off the **top** of a stack. Everything else — the adjacency list, the visited set, the marking rule, the `O(V + E)` bound — is shared.',
    },
    {
      kind: 'p',
      text: 'That sounds like a small difference, and it is not. It changes what the traversal **means**, and it is the difference between "is this reachable" and "how many steps away is this".',
    },

    {
      kind: 'video',
      url: 'https://www.youtube.com/watch?v=tWVWeAqZ0WU',
      title: 'Graph Algorithms for Technical Interviews — Full Course',
      source: 'William Fiset, on the freeCodeCamp channel · about 2 hours',
      note: 'The clearest free treatment of the whole topic, and it is worth an evening rather than a skim. Watch the **graph basics** and **adjacency list** sections first, because they are the part this app cannot show you: the visualisers below already hand you a graph, so the representation is the part you would otherwise take on trust. Its second half then works through the interview applications — has-path, shortest path, connected components, island count — which are collected in [traversal in practice](/learn/traversal-in-practice).',
    },

    { kind: 'h2', text: 'How a graph is stored, which is not a detail' },
    {
      kind: 'p',
      text: 'Before any of this runs, the graph has to be a data structure. The choice is not cosmetic: it decides the cost of `for (const v of adj[u])`, and that loop is what every traversal is made of.',
    },
    {
      kind: 'table',
      head: ['Representation', 'Space', 'Cost of listing neighbours', 'Worth it when'],
      rows: [
        [
          '**Adjacency list**',
          '`O(V + E)`',
          'proportional to the number of edges at that node',
          'almost always — the cost tracks the work you actually do',
        ],
        [
          '**Adjacency matrix**',
          '`O(V²)`',
          '`O(V)` — you scan a whole row whether or not the edges exist',
          'the graph is dense, **or** you need "is there an edge u to v" in `O(1)`',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'An adjacency list is a **dictionary or array from a node to its neighbours**: the entry for `a` holds exactly the nodes with an edge to `a`. Every traversal below is a loop over that entry, which is what makes the `O(V + E)` bound true. Each node is expanded once, and expanding a node costs its own degree.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `// Adjacency list: adj[u] holds every node that u has an edge to.
const adj: number[][] = Array.from({ length: n }, () => []);

// Undirected: write the edge BOTH ways. Each node has to be a neighbour of
// the other in both directions, and forgetting the second line is the most
// common bug in graph code — the traversal still runs, it just quietly
// becomes a directed search and misses half of the graph.
function addUndirected(a: number, b: number): void {
  adj[a].push(b);
  adj[b].push(a);
}

// Directed: one entry only, and the traversal must obey the arrows — the
// whole difference between a road network and a web of links.
function addDirected(a: number, b: number): void {
  adj[a].push(b);
}`,
      caption:
        'The matrix alternative is a table of booleans, `edge[u][v]`, which costs `O(V²)` writes to fill before you read a single neighbour. On a sparse graph that is more expensive than the entire traversal.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Why the visualisers can hide this from you',
      text: 'Every graph on this page was already stored as an adjacency list before you saw it, so the construction cost never appears. That is a genuine blind spot while learning: an interview problem includes building the structure, and on a large sparse input that build is often a bigger share of the runtime than the search. Count the edges as you read them, and remember both directions on an undirected problem.',
    },

    {
      kind: 'p',
      text: 'Both do this:',
    },
    {
      kind: 'ol',
      items: [
        'Put the start node in the container, and **mark it seen immediately**.',
        'Take the next node out.',
        'For each neighbour that is not marked, mark it **now** and put it in the container.',
        'Repeat until the container is empty.',
      ],
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Marking at push time is the whole termination argument',
      text: 'Mark a node when it goes **into** the container, not when it comes out. Mark it on the way out and a node with two neighbours in the queue gets queued twice, then processed twice, and a graph with a cycle never terminates. The mark on push is also what makes the cost `O(V + E)` rather than `O(V · E)`: every node is queued once, every edge is read once, and neither is ever done twice.',
    },
    {
      kind: 'p',
      text: 'This is the same one-line correctness argument that binary search has, in a different costume: each step permanently eliminates part of the search space. Here the eliminated part is "everything reachable from a node we have finished with".',
    },

    {
      kind: 'code',
      lang: 'typescript',
      code: `function bfs(adj: number[][], start: number) {
  const dist = new Array<number>(adj.length).fill(-1);
  dist[start] = 0;

  // A queue with a moving head, not queue.shift(). shift() is O(n), because
  // every remaining element has to slide down one place — so using it here
  // quietly turns an O(V + E) traversal into O(V squared), and still passes
  // every test you would write at interview scale.
  const queue: number[] = [start];
  let head = 0;

  while (head < queue.length) {
    const u = queue[head++];              // dequeue: the OLDEST node
    for (const v of adj[u]) {
      if (dist[v] !== -1) continue;        // already seen, skip
      dist[v] = dist[u] + 1;               // first arrival is by a shortest path
      queue.push(v);                       // mark ON PUSH, never on pop
    }
  }
  return dist;
}

function dfs(adj: number[][], start: number) {
  const seen = new Array<boolean>(adj.length).fill(false);
  seen[start] = true;                      // marked BEFORE it goes on the stack

  const stack: number[] = [start];
  while (stack.length > 0) {
    const u = stack.pop()!;                // LIFO: the NEWEST node comes off first
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = true;                      // again: on push, not on pop
      stack.push(v);
    }
  }
}`,
      caption:
        'Ten lines each. Read them side by side and the only differences are the container — queue[head++] against stack.pop() — and what you store on the node: a distance against a boolean.',
    },
    {
      kind: 'p',
      text: 'Notice that BFS stores a **distance** where DFS stores a **boolean**, and that is not cosmetic either. A boolean is all DFS needs, because the traversal does not care how far away anything is. BFS must record the distance, because "the first time I reach you is by a shortest path" is a property of the **order** — and if you do not write it down at the moment it happens, you cannot recover it afterwards.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `// The recursive DFS. Shorter than the loop version, and the one you will
// be asked to write, because it reads as a definition of the problem.
function dfs(u: number, adj: number[][], seen: boolean[]): void {
  seen[u] = true;
  for (const v of adj[u]) {
    if (!seen[v]) dfs(v, adj, seen);
  }
}

// The recursive call IS the stack. One frame per node of depth is why the
// loop version above is not a stylistic preference: on a 100,000-node path
// the recursive form exhausts the call stack before it exhausts memory.
function findPath(
  u: number,
  goal: number,
  adj: number[][],
  seen: boolean[],
): number[] | null {
  if (u === goal) return [u];
  seen[u] = true;
  for (const v of adj[u]) {
    if (seen[v]) continue;
    const rest = findPath(v, goal, adj, seen);
    if (rest !== null) return [u, ...rest];  // v is on the path: splice u in front
  }
  return null;                               // nothing below u reaches the goal
}`,
      caption:
        'Recursive DFS does one thing the loop version cannot: it hands the partial path back up the stack, so findPath costs nothing extra to return an actual route instead of a yes.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The one-line bug that makes the loop version look wrong',
      text: 'Move the `seen[v] = true` to after the `stack.push(v)` and DFS still works on an acyclic graph — then goes into an infinite loop the moment anyone adds a cycle back. Worth breaking on purpose once, with two nodes pointing at each other, and watching it hang.',
    },

    {
      kind: 'p',
      text: 'Both visualisers here are **iterative on purpose**. DFS in particular would be completely natural to write recursively, and the app does not: the stack is drawn as a visible `frontier` array, which is the point. In the iterative form the `frontier` field **is** the container — the right-hand entry is the next node out, and in DFS you can watch it shrink as backtracks happen.',
    },
    {
      kind: 'p',
      text: 'The two `ring` presets are the same directed graph with the same start node, which is what makes them comparable frame for frame. BFS peels the ring off one ring at a time. DFS dives down the long chord to node 5, finds a dead end, and comes back.',
    },
    {
      kind: 'stepper',
      algoId: 'bfs',
      caption:
        'BFS on the directed ring. The L-badges are hop counts, and they are non-decreasing: that is the entire guarantee.',
      preset: 'ring',
    },
    {
      kind: 'stepper',
      algoId: 'dfs',
      caption:
        'DFS on the same graph. The L-badges are recursion depth now, and they go up and back down — and the nodes come out in a completely different order.',
      preset: 'ring',
    },
    {
      kind: 'p',
      text: 'Note what did **not** change: the set of nodes visited is identical, and so is the number of operations. BFS reports `[0,1,2,3,5,4,6,7]`; DFS reports `[0,2,5,6,7,3,4,1]`. Two algorithms, same graph, same cost, different sequence. If you have ever stored "visited" in the wrong order and got a subtly wrong answer, this is the reason.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Reachability is order-independent',
      text: 'Both traversers visit exactly the set of nodes reachable from the start. So for "can I get there at all", BFS and DFS are interchangeable — number of islands, flood fill and cycle detection could use either. The order only becomes load-bearing when something about the **path** matters.',
    },

    { kind: 'h2', text: 'What the order buys you' },
    {
      kind: 'table',
      head: ['Question', 'Use', 'Why the container decides it'],
      rows: [
        [
          'Is `v` reachable from `s`?',
          'either',
          'the visited set is the same, so the answer is the same',
        ],
        [
          'What is the fewest **hops** from `s` to `v`?',
          'BFS',
          'nodes leave in hop order, so the first time `v` is reached it is by a shortest path',
        ],
        [
          'What is the cheapest path by **weight**?',
          'neither — use Dijkstra',
          'hop count ignores weights entirely; BFS with weights is just wrong',
        ],
        [
          'Is there a cycle?',
          'either',
          'a node reachable twice would mean a cycle, and the mark-on-push makes that impossible to observe',
        ],
        [
          'What order respects these dependencies?',
          "Kahn's algorithm, not DFS",
          'it needs nodes whose prerequisites are all **already emitted**, which is a set, not a path',
        ],
        [
          'Find a path that is long and winding',
          'DFS',
          'it keeps going until it hits a wall, which is often what you want for a maze or a puzzle',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The row that catches people is the third. **BFS ignores edge weights completely.** Its narration says so out loud — "BFS counts hops, not cost" — and the presets pass weight 1 to every listing regardless of what the graph says. On a weighted graph, breadth-first is not an approximation of shortest path; it is a different quantity, and if you wanted cost you wanted [Dijkstra](/learn/shortest-paths).',
    },

    { kind: 'h2', text: 'A distance is not a path' },
    {
      kind: 'p',
      text: 'This is the gap that makes "I ran BFS and it did not work" the most common graph bug there is. BFS gives you the number of hops and **nothing about which edges got you there**. If the problem asks for the route, a distance array is not a partial answer — it is the wrong shape.',
    },
    {
      kind: 'p',
      text: 'The fix costs one more array and one more line inside the loop: record which node you came from. Because a node is marked the instant it is first reached, and its parent was marked before it, the chain of parents is a valid route by construction — and it is **a** shortest route, because the parent was recorded on the shortest arrival.',
    },
    {
      kind: 'code',
      lang: 'typescript',
      code: `function bfsWithParents(adj: number[][], start: number) {
  const dist = new Array<number>(adj.length).fill(-1);
  const parent = new Array<number>(adj.length).fill(-1);
  dist[start] = 0;

  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of adj[u]) {
      if (dist[v] !== -1) continue;
      dist[v] = dist[u] + 1;
      parent[v] = u;          // the only extra line. Everything above is identical.
      queue.push(v);
    }
  }
  return { dist, parent };
}

// Walk the parents back from the goal, then flip. parent[goal] is -1 exactly
// when the goal was never reached — which is the whole "is there a path" test,
// for free, with no second traversal.
function pathTo(parent: number[], start: number, goal: number): number[] {
  if (goal !== start && parent[goal] === -1) return [];

  const path = [goal];
  let cur = goal;
  while (cur !== start) {
    cur = parent[cur];
    path.push(cur);
  }
  return path.reverse();
}`,
      caption:
        'On a graph with a cycle, an unguarded walk of the parent pointers loops forever — the mark-on-push rule is what guarantees the chain is finite.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The edge direction has to agree with your route',
      text: 'Parents are written from `u` to `v` in the direction the traversal travelled. Walking them from the goal back to the start means the list reads in reverse, so reversing is not optional — and on a directed graph, forgetting it does not error, it produces a route that does not exist.',
    },
    {
      kind: 'p',
      text: 'All four of these patterns, written out in full, are collected in [traversal in practice](/learn/traversal-in-practice) — reachability, shortest path, connected components, and the grid version that shows up as island counting.',
    },

    {
      kind: 'p',
      text: 'When the container empties, whatever was never marked was unreachable. Neither traversal throws, and neither reports a failure — they report a partial result, and the untouched nodes are the answer to a question you did not ask.',
    },
    {
      kind: 'stepper',
      algoId: 'bfs',
      caption:
        'The islands preset: one component of three nodes, and a second component nothing ever points at. Its badge stays ∞ for the entire run.',
      preset: 'islands',
    },
    {
      kind: 'p',
      text: 'This is worth sitting with, because it is the shape of a whole class of bug. Code that assumes a traversal reaches everything — a flood fill that assumes one region, a graph walk that indexes into an array of visited nodes — has no error to catch when it is wrong. It has a plausible answer.',
    },

    { kind: 'h2', text: 'The grid version, and the decision nobody makes for you' },
    {
      kind: 'p',
      text: 'Flood fill and number of islands are the same traversal on a grid, and both hard-wire **four-way** connectivity: up, left, right, down. Not eight. The diagonals are not neighbours, and a diagonal chain of blocked cells is an impassable wall rather than a thin one.',
    },
    {
      kind: 'stepper',
      algoId: 'flood-fill',
      caption:
        'The staircase preset: a diagonal wall, and nine of the twenty open cells that never get filled. That is correct, not broken.',
      preset: 'staircase',
    },
    {
      kind: 'p',
      text: 'This surprises everybody exactly once. A four-way fill leaks around a diagonal wall only if it can pass through a corner, and it cannot — a corner is not a side. Number of islands then draws the consequence as a count: the same diagonal-touch grid is **three** islands under the four-way rule and **one** under eight-way, and the app says so in the final frame. The input does not decide between those answers. A convention does.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Why this is not a parameter',
      text: 'Connectivity could obviously be a toggle, and it deliberately is not. It changes the answer, and an app that offers a toggle has to offer tests for both answers. Hard-wiring four-way makes the claim "this grid is three islands" mean one specific thing, which is the only way to assert it.',
    },
    {
      kind: 'stepper',
      algoId: 'number-of-islands',
      caption:
        'Number of islands, four-way. The count is a by-product: each unclaimed land cell starts exactly one flood, so counting islands is counting floods.',
      preset: 'diagonal-touch',
    },
    {
      kind: 'p',
      text: 'And there is a second surprise in the implementation, which is worth knowing before you write your own: the flood fill is **not** in place. A recursive flood fill and most competitive-programming versions paint a 2 or a `true` into the grid as they go, which destroys the input and makes "which cells did the fill start from" unrecoverable. This app keeps the grid untouched and tracks claims in separate arrays, so the caller still has their original map when the count comes back — and so the recursion depth is a visible number rather than a stack overflow.',
    },

    { kind: 'h2', text: 'The ordering problem, which is not a traversal' },
    {
      kind: 'p',
      text: "Given a directed acyclic graph — build dependencies, task prerequisites, course prerequisites — you want an order where everything comes before the things that need it. This is **topological sort**, and the app implements Kahn's algorithm rather than the DFS version, which is the better choice for a reason worth stating: Kahn's needs no recursion, no reverse adjacency list, and no finish times.",
    },
    {
      kind: 'p',
      text: "The whole algorithm is one integer. Count each node's in-edges, put everything at zero into a frontier, and drain it — every time you emit a node you decrement its successors, and any successor that reaches zero joins the back of the queue.",
    },
    {
      kind: 'stepper',
      algoId: 'topological-sort',
      caption:
        'The wide preset: the frontier peaks at six simultaneously valid next moves. A topological order is a choice, not a fact about the graph.',
      preset: 'wide',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The cycle detector is the empty frontier',
      text: 'If the frontier empties and nodes remain, every one of those nodes still has an unemitted node pointing at it — so the graph has a cycle. The algorithm doubles as its own cycle detector with no extra code, which is why the app can report `cycle` without a second pass. Note that no preset shows this: they are all generated with edges pointing only rightwards, so you would have to hand-edit an input to see it.',
    },

    { kind: 'h2', text: 'Choosing' },
    {
      kind: 'ul',
      items: [
        '**Reachability, or a shortest hop count:** BFS. It is `O(V + E)` with no bad case, and no other traversal is faster on an unweighted graph.',
        '**Reachability only, and you want the recursion visible:** DFS. The stack is the whole state, so an iterative DFS **is** the recursive one with the frames printed.',
        '**Anything involving weights:** neither. [Dijkstra, Bellman-Ford and A*](/learn/shortest-paths).',
        '**Connecting everything as cheaply as possible:** neither. [Prim and Kruskal](/learn/minimum-spanning-trees).',
        "**A dependency order:** Kahn's algorithm. Deterministic given a fixed tie-break, which is unusual for a graph algorithm and is exactly what makes it testable.",
      ],
    },
    {
      kind: 'p',
      text: 'Every one of those choices is really a choice about the container, and the container is the part that fits on one line of the code. The rest — the visited set, the mark-on-push, the `O(V + E)` — you already know, and you know it from [binary search](/learn/binary-search): halve the space that is left.',
    },
  ],
};

export const SHORTEST_PATHS: Article = {
  slug: 'shortest-paths',
  title: 'When an edge stops being a step',
  dek: 'Dijkstra, Bellman-Ford and A* are one idea with three different tolerances for what an edge weight may be.',
  category: 'graphs',
  tags: ['dijkstra', 'bellman-ford', 'a-star', 'relaxation', 'negative weights'],
  readMinutes: 13,
  algoId: 'dijkstra',
  body: [
    {
      kind: 'p',
      text: 'An unweighted graph has one sensible question — how many edges — and breadth-first answers it. The moment each edge carries a cost, that question splits into two, and the split is not symmetric: **how far** and **at what price**. Dijkstra and Bellman-Ford answer both; A* answers them with an opinion about which direction to try first.',
    },
    {
      kind: 'p',
      text: 'All three run on one operation. **Relaxation**: for every edge `u → v` of weight `w`, if `dist[u] + w < dist[v]` then `dist[v] = dist[u] + w` and remember where it came from. The algorithms differ only in **the order they relax edges in**, and the order is the entire difference between a correct answer and a wrong one.',
    },

    { kind: 'h2', text: 'Dijkstra: settle the cheapest, and never look back' },
    {
      kind: 'p',
      text: 'Dijkstra keeps a priority queue of candidates keyed on their current best distance, repeatedly extracts the minimum, and **settles** it — meaning it is removed from consideration permanently. Then it relaxes every edge out of that node.',
    },
    {
      kind: 'p',
      text: 'The justification is a single sentence, and it is the best one-line proof in this app: **because every edge weight is non-negative, no path through a node we have not reached yet can come in under the cheapest distance we have already settled.** Every further route to that node goes through something at least as expensive as what we just fixed, and then adds a non-negative weight on top. So the settled value cannot be improved, ever, and no future work needs to revisit it.',
    },
    {
      kind: 'stepper',
      algoId: 'dijkstra',
      caption:
        'The trap preset: two routes from 0 to 3, one edge of cost 20 or two of cost 1. Dijkstra settles 1 first, so 3 arrives at 2 and the expensive edge is never even relaxed.',
      preset: 'trap',
    },
    {
      kind: 'p',
      text: 'The `trap` preset is the whole reason BFS is not a substitute. A breadth-first search takes the direct 0 → 3 edge and calls it done, because one hop beats two. Dijkstra takes the detour and gets the right answer for the reason above — the queue ordering **is** the algorithm, exactly as it is in [the eight sorts](/learn/sorting-landscape) where the partition order decides the tree shape.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The precondition is not checked, and the failure is silent',
      text: 'Dijkstra requires **non-negative weights**. A single negative edge breaks the proof above — the sentence "no path through an unreached node can come in cheaper" becomes false — and the algorithm then returns a wrong distance with no exception, no warning and no NaN. A rebate, a credit, a refund, a loss-making trade, an adjustment that can go either way: any of those on a graph means Dijkstra is the wrong tool, and the failure mode is a plausible number.',
    },
    {
      kind: 'p',
      text: 'That is worth internalising as a habit rather than a fact about one algorithm. **The correctness of a greedy step rests on a property of the input, and the property is usually an assumption in a comment rather than a check.** [Greedy](/learn/greedy) is about that whole class.',
    },

    { kind: 'h2', text: 'Bellman-Ford: stop assuming, and pay for it' },
    {
      kind: 'p',
      text: 'Bellman-Ford throws away the argument. Instead of settling anything, it relaxes **every edge**, over and over, for `V - 1` passes. Each pass costs `O(E)` and the total is `O(V · E)` — dramatically worse than Dijkstra, and it buys exactly one thing: it does not care what the weights are.',
    },
    {
      kind: 'p',
      text: 'Why `V - 1` passes is enough is the shortest-path theorem: a shortest path with no repeated vertex uses at most `V - 1` edges. Pass `k` propagates every path of up to `k` edges, so after `V - 1` passes every shortest path has been considered. There is no ordering argument and no priority queue — just repetition, which is why it is also the algorithm that most obviously does not need to be clever.',
    },
    {
      kind: 'stepper',
      algoId: 'bellman-ford',
      caption:
        'The rebate preset: one edge of weight −8, and node 2 is reachable for −4 through it rather than +5 directly. One negative edge rewrites the answer.',
      preset: 'rebate',
    },
    {
      kind: 'p',
      text: 'Two details in that run are the whole design. The relaxation happens **in place**, so the next edge in the same pass already sees the new value — which is why it frequently finishes in two or three passes rather than `V - 1`. And there is an **early exit**: if a whole pass changes nothing, no longer path can help either, so it stops. On an all-positive graph that early exit fires almost immediately, which is the honest admission that Bellman-Ford on non-negative weights is Dijkstra with the cleverness removed.',
    },
    {
      kind: 'h2',
      text: 'The pass that exists to catch the impossible',
    },
    {
      kind: 'p',
      text: 'After `V - 1` passes, the algorithm does one more unguarded sweep. If anything still relaxes, there is a **negative cycle** — a loop you can go round repeatedly to make the cost drop without limit. In that case a shortest path does not exist, for those nodes or anything reachable from them, and there is no number to return.',
    },
    {
      kind: 'stepper',
      algoId: 'bellman-ford',
      caption:
        'The loss-loop preset: 1 → 2 → 3 → 1 sums to −2. Watch the same three badges fall on every single pass, for ever. That is the signature, and it is why the extra pass exists.',
      preset: 'loss-loop',
    },
    {
      kind: 'p',
      text: 'That the **same** three nodes keep improving is the diagnostic. A slow convergence looks like progress; a negative cycle looks like three numbers ticking down in lockstep, forever, which is why the implementation reports the literal string `NEGATIVE-CYCLE` rather than an array of infinities that no two languages agree on how to spell.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'An undirected negative edge is not a Bellman-Ford input',
      text: 'An undirected edge of weight −8 can be traversed in both directions, so going back and forth costs −16 — a negative cycle by construction, before any search starts. "An undirected graph with a negative edge" is not a case Bellman-Ford handles; it is an already-negative-cycle instance. Worth knowing because it is the kind of input that arrives by accident.',
    },

    { kind: 'h2', text: 'A*: Dijkstra plus a guess' },
    {
      kind: 'p',
      text: 'A* changes one thing about Dijkstra: what it puts in the priority queue. Dijkstra orders by `g`, the distance from the start — a number it is certain about. A* orders by `f = g + h`, where `h` is an **estimate** of the remaining distance to the goal. Dijkstra would expand nodes in every direction; A* expands nodes that look like they are heading for the answer.',
    },
    {
      kind: 'p',
      text: "The relaxation step is byte-for-byte identical to Dijkstra's, and the estimate is never consulted there. `h` changes only the order things come out of the queue, never the cost of anything — which is a good way to see that A* has exactly one degree of freedom.",
    },
    {
      kind: 'stepper',
      algoId: 'a-star-search',
      caption:
        'The corridor preset: the diagonal costs 283 a hop and every orthogonal hop costs 1100. A* walks the diagonal and expands four nodes. Dijkstra expands all sixteen on this graph.',
      preset: 'corridor',
    },
    {
      kind: 'p',
      text: 'Same bound — `O((V + E) log V)` — but a very different bill. The bound is the ceiling, not the cost; it is reached exactly when the estimate says nothing useful.',
    },
    {
      kind: 'stepper',
      algoId: 'a-star-search',
      caption:
        "The no-geometry preset: nothing here for a straight-line guess to measure, so all nine nodes get expanded — exactly what Dijkstra would do, for exactly Dijkstra's price.",
      preset: 'no-geometry',
    },
    {
      kind: 'p',
      text: "Which produces the honest summary of the whole technique: **A* is Dijkstra plus an estimate, and where the estimate is bad you get Dijkstra's behaviour and Dijkstra's bill.** A heuristic is only worth its cost on graphs that have the structure it measures.",
    },

    { kind: 'h3', text: 'Admissible, and what happens when it is not' },
    {
      kind: 'p',
      text: 'The one requirement on `h` is that it must never **overestimate** — it must be a lower bound on the true remaining cost. An admissible estimate can be wildly pessimistic, and the search still works. An inadmissible one does not merely run slower: the greedy step stops being sound, and the returned cost is wrong, **silently, with no exception anywhere**. That is the worst failure mode an algorithm has, and it is why the app builds its presets so that every edge costs at least the straight-line distance between its endpoints — admissibility by construction rather than by promise.',
    },
    {
      kind: 'stepper',
      algoId: 'a-star-search',
      caption:
        'The snare preset: a dead end heading straight at the goal. `f` looks wonderful there and finds nothing at all — which is allowed, because an admissible heuristic is permitted to be wrong, just never in the direction that would make it optimistic.',
      preset: 'snare',
    },
    {
      kind: 'p',
      text: 'And one more distinction that is the algorithm rather than an optimisation: A* stops when the goal is **popped**, not when it is reached. Reaching it only proves the best route found so far costs `g`. Popping it proves no cheaper route exists, because admissibility guarantees every remaining candidate still carries an `f` at least as large.',
    },

    { kind: 'h2', text: 'The three, side by side' },
    {
      kind: 'table',
      head: ['', 'Dijkstra', 'Bellman-Ford', 'A*'],
      rows: [
        ['Time', '`O((V+E) log V)`', '`O(V·E)`', '`O((V+E) log V)`'],
        ['Negative weights', 'no — silently wrong', 'yes', 'no — silently wrong'],
        ['Negative cycle', 'not detected', 'reported', 'not detected'],
        ['Ordering', 'cheapest settled first', 'every edge, every pass', 'cheapest `f` first'],
        [
          'Needs a goal',
          'no, gives all distances',
          'no, gives all distances',
          'yes, gives one route',
        ],
        ['Unreachable node', '`∞` / `-1`', '`∞` / `-1`', '`∞` / `-1`'],
        [
          'Use it when',
          'weights are non-negative',
          'a weight can be negative',
          'you know roughly where the goal is',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'There is a fourth answer that the table implies without saying: if you need **every** distance rather than one route, you want Dijkstra, and A** is the wrong shape for the question no matter how good the estimate is. A** is a **search for one goal**; Dijkstra is a **computation for every node**.',
    },

    { kind: 'h2', text: 'What they all have in common' },
    {
      kind: 'p',
      text: 'Worth naming, because it is the part that generalises past graphs:',
    },
    {
      kind: 'ul',
      items: [
        '**A table of best-known answers**, initialised to `∞` and updated in place. This is a [dynamic programming table](/learn/dp-state-shapes) over nodes — the same idea as a knapsack, with the graph as the dependency structure.',
        '**Relaxation as the only transition.** One comparison per edge. Everything else is bookkeeping.',
        '**An ordering argument that carries the proof.** Settled-first, repeat-until-quiet, or lowest-`f`-first. Remove the ordering and you have no correctness argument at all.',
        '**A precondition that is an assumption rather than a check.** Non-negative weights, in two of the three. See [how to read O(n log n)](/learn/reading-big-o) for why that habit is worth having on its own.',
      ],
    },
    {
      kind: 'p',
      text: 'And if the graph has no weights at all, go back to [breadth-first](/learn/bfs-and-dfs): it is faster, simpler, and its answer is already optimal.',
    },
  ],
};

export const MIN_SPANNING_TREE: Article = {
  slug: 'minimum-spanning-trees',
  title: 'Prim and Kruskal answer the same question',
  dek: 'Two greedy algorithms, one provably identical total — and, on a disconnected graph, two entirely different questions.',
  category: 'graphs',
  tags: ['mst', 'union-find', 'greedy', 'cut property', 'disconnected'],
  readMinutes: 11,
  algoId: 'kruskal',
  body: [
    {
      kind: 'p',
      text: 'Given a connected, undirected, weighted graph, the minimum spanning tree is the cheapest set of edges that connects every node with no cycles. Both algorithms for it here are greedy, both are `O(E log E)`-ish, and both provably return the same **total** — which is the kind of thing that makes them interchangeable until you notice that on a disconnected graph they do not return the same answer.',
    },

    { kind: 'h2', text: 'The theorem both of them rest on' },
    {
      kind: 'p',
      text: 'The **cut property**: for any way of splitting the nodes into two sets, the cheapest edge crossing that split is safe to include in some minimum spanning tree. "Safe" means there is an MST that contains it — not that it is in every one.',
    },
    {
      kind: 'p',
      text: 'That is a weaker claim than it sounds, and the weakness is what makes the greedy step legal. Both algorithms are repeated applications of it to a specific split: Kruskal splits the nodes by connected component, Prim splits them into "in the tree" and "not yet in the tree". Neither ever needs to search for an MST or compare it with another — they just keep the cheapest edge that crosses a cut they are confident about.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'The greedy proof you are actually making',
      text: 'The question is never "is this the cheapest edge?" — it is "can I commit to this edge now, before I have seen the rest of the graph?" Kruskal commits because the components are final: no cheaper connection between them can appear later, since all remaining edges are at least as expensive. Prim commits because everything already chosen is inside one connected tree, and any edge leaving it belongs to some cut.',
    },

    { kind: 'h2', text: 'Kruskal: sort, then keep unless it loops' },
    {
      kind: 'p',
      text: 'Kruskal is the simpler of the two and its implementation is essentially one sentence: **sort all edges cheapest-first, walk them in that order, and take an edge unless it would create a cycle.**',
    },
    {
      kind: 'p',
      text: 'Which leaves exactly one interesting question: how do you know in constant time whether an edge would create a cycle? You do not search for the path between its endpoints — that question is exponential, and the algorithm refuses to ask it. Instead it keeps a **union-find** forest: a table mapping each node to a representative, and the answer to "are these already connected?" is "do they have the same representative?".',
    },
    {
      kind: 'p',
      text: 'Union-find needs two halves, and both of them are load-bearing. **Union by size** attaches the smaller tree to the larger root, which stops the forest degenerating into a list of length `V` where every lookup costs `O(V)`. **Path compression** re-points every node walked past directly at the root, which is why the dashed forest in the visualiser visibly flattens as the run goes on. With both, the whole structure runs in `α(V)` amortised — the inverse Ackermann function, which is below 5 for any `V` a computer can name.',
    },
    {
      kind: 'stepper',
      algoId: 'kruskal',
      caption:
        'Kruskal, and the cycle test doing all the work: two roots are compared, and "same root" is the entire refusal criterion. No path is ever looked for.',
      preset: 'dense',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Comparing roots is not comparing parents',
      text: 'The test is `find(u) == find(v)`, never `parent[u] == parent[v]`. The second happens to give the right answer only because path compression has already flattened both chains, which makes it a bug waiting for a future path compression to be optimised.',
    },
    {
      kind: 'p',
      text: 'There is one more optimisation worth naming: once `n - 1` edges have been accepted, it stops. A tree on `n` nodes has exactly `n - 1` edges, so all nodes are in one component and every remaining edge would close a loop. On a dense graph the tail of the sorted list is never even looked at.',
    },

    { kind: 'h2', text: 'Prim: grow one tree from one node' },
    {
      kind: 'p',
      text: 'Prim takes the opposite approach: start from one node, and repeatedly add the **cheapest edge leaving the tree so far**. It never considers an edge between two nodes already in the tree, which is worth noticing — those edges are not refused by a test, they are **never queued at all**. That is why Prim needs no union-find, and why its cycle test is a boolean array lookup.',
    },
    {
      kind: 'p',
      text: 'Its priority queue holds **edges**, not nodes, and each entry remembers which end is inside the tree. It also refuses stale entries — a queued edge whose other end has since been dragged in — which is the price of a lazy queue rather than a decision.',
    },
    {
      kind: 'stepper',
      algoId: 'prims-mst',
      caption:
        'Prim growing from node 0. Every edge drawn in green has been accepted; the only edges ever considered are the ones leaving the tree.',
      preset: 'sparse',
    },
    {
      kind: 'table',
      head: ['', 'Kruskal', 'Prim'],
      rows: [
        ['Grows', 'many components, merged', 'one tree, from one node'],
        ['Queue holds', 'sorted edge list, built once', 'a priority queue of edges'],
        ['Cycle test', 'union-find: same root?', 'both ends already in the tree?'],
        ['Needs union-find', 'yes', 'no'],
        ['Needs a start node', 'no — start-independent', 'yes, and it changes the tree'],
        ['Time', '`O(E log E)`', '`O((V + E) log V)`'],
        [
          'Better when',
          'the graph is sparse or already sorted',
          'the graph is dense, or edges arrive online',
        ],
      ],
    },
    {
      kind: 'p',
      text: "The `start` row is the one people miss. Prim's seed is the only genuinely free choice in the algorithm, and it is **not a choice about cost**: a different start node gives a different tree of identical total weight. Kruskal has no such parameter, and that asymmetry is a real difference in how the two compose with the rest of a system.",
    },

    { kind: 'h2', text: 'Ties, and why the tree is not determined' },
    {
      kind: 'p',
      text: 'The total weight is unique — every minimum spanning tree of a given graph has the same total. **The tree is not.** A minimum spanning tree is unique only when every weight is distinct, and with ties the choice is settled by a tie-break rule rather than by the graph.',
    },
    {
      kind: 'stepper',
      algoId: 'kruskal',
      caption:
        'The ties preset: five weight-1 edges competing for four slots. The one that loses is refused by the cycle test, not by weight.',
      preset: 'ties',
    },
    {
      kind: 'stepper',
      algoId: 'prims-mst',
      caption:
        'The divergent preset: the same graph idea, the other algorithm. Two of the five edges differ from what Kruskal picks, and the total does not move.',
      preset: 'divergent',
    },
    {
      kind: 'p',
      text: 'Which is why both implementations return **the sum** and not the edge list. With tied weights a different tie-break yields a different tree of identical cost, so the total is the part of the answer the graph actually determines. Returning the tree would mean returning something that depends on an implementation detail.',
    },
    {
      kind: 'callout',
      tone: 'good',
      title: 'So which do you use?',
      text: 'Kruskal, when the graph is sparse, when you already have the edges sorted, or when you need a forest rather than a tree. Prim, when the graph is dense or edges arrive one at a time, and when you want to stop early. Otherwise: it genuinely does not matter, and picking either on taste is the right engineering decision.',
    },

    { kind: 'h2', text: 'The case where they disagree, and what that means' },
    {
      kind: 'p',
      text: 'Both presets below are the **same graph**: seven nodes, two components, nothing joining them. A spanning tree does not exist, so each algorithm returns the cheapest thing it can — and the two cheapest things are different.',
    },
    {
      kind: 'stepper',
      algoId: 'prims-mst',
      caption:
        'Prim on a disconnected graph. The queue empties with 4 of 7 nodes in the tree, and the other three were never even discovered — no edge out of the tree ever pointed at them.',
      preset: 'islands',
    },
    {
      kind: 'stepper',
      algoId: 'kruskal',
      caption:
        'Kruskal on the same graph, same weights, total 10. It reached the far component because it was already looking at every edge in the graph.',
      preset: 'forest',
    },
    {
      kind: 'p',
      text: 'Eight against ten, from the same input. Neither is a bug, and the difference is exactly the difference in what each algorithm can see. **Prim answers "the cheapest way to connect everything reachable from where I started."** Kruskal answers "the cheapest way to connect every pair that is connected at all" — which on a disconnected graph is a forest, and the fact that no spanning tree exists **is** the output.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'A minimum spanning forest is not a minimum spanning tree',
      text: "Calling Prim's 8 a spanning forest of the graph would be wrong: the far component is not cheaper, it is simply invisible from the start node. And neither algorithm warns you — a forest of one component is a perfectly good answer, so the caller tells the two cases apart by counting nodes, not by inspecting the number.",
    },
    {
      kind: 'p',
      text: 'Both algorithms here are greedy, and both need that argument to be made rather than assumed — which is the subject of [greedy](/learn/greedy). The other thing they share is a table answering "are these two connected?", which is the same structure that makes [hash tables](/learn/hash-tables) fast and this algorithm correct, just with a much worse lookup than `O(1)`.',
    },
  ],
};

import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { LinkedFrame, LinkedNode, NodeId } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Floyd's tortoise and hare — cycle detection in a linked list.
 *
 * The whole algorithm rests on one observation about *distance*: the slow
 * pointer moves one node per step and the fast one two, so their gap grows by
 * exactly one node per iteration, no matter where they are. If the list has no
 * cycle the fast pointer simply runs off the end. If it has one, the fast
 * pointer laps the slow one, and a gap that started at zero can only be zero
 * again at a node that genuinely lies on a ring.
 *
 * That gives cycle detection in **O(1) extra space with no bookkeeping at all**
 * — no visited set, no colouring, no modification of the list. Which is what
 * you need when the list is read-only: a shared immutable structure, a hardware
 * receive buffer, anything you were handed a read handle to.
 *
 * The generator draws two things the code cannot:
 *
 *  - `circular: true` closes the ring in the renderer, and the node array is
 *    ordered **cycle-first** so the ring the renderer draws is the *real* cycle
 *    rather than a plausible-looking lie. Tail nodes follow it, unreachable
 *    from the drawn head — which is exactly what they are.
 *  - `highlight.cycle` is the ground truth, so the presets whose ring the
 *    renderer could only approximate still carry an unambiguous membership set.
 *
 * The return value is the **length of the cycle** (0 when there is none). A
 * number is the only shape four languages can agree on from structures they each
 * model differently, and it is a strictly stronger claim than a boolean: 0 means
 * no ring, 1 means a self-loop, and a boolean cannot tell those apart.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * The input is the list's values plus `cycleBack`: the index the **last** node
 * points back to, or -1 for a genuinely acyclic list.
 *
 * Anchoring the link on the *last* node rather than on the cycle entry is what
 * makes the interesting presets possible at all. `next[n-1] = cycleBack` gives
 * `0 → 1 → … → cycleBack → … → n-1 → cycleBack`, which means there is a real
 * **tail** in front of the ring — the case where the two cursors collide
 * somewhere that is *not* the entry, and therefore the case where the second
 * half of Floyd's algorithm has any work to do.
 *
 * No randomness: the shape of the pointer graph is the only variable that
 * matters here, and a seed would only produce a different chain of the same
 * shape.
 */
const PRESETS: Preset[] = [
  {
    id: 'no-cycle',
    label: 'No cycle',
    blurb:
      'Five nodes and a `null` at the end. The hare runs off the end and the loop exits on the pointer test, having allocated nothing and marked nothing.',
    input: { type: 'numbers', values: [1, 2, 3, 4, 5] },
    params: { cycleBack: -1 },
  },
  {
    id: 'self-loop',
    label: 'One node pointing at itself',
    blurb:
      'The smallest cycle there is: a single node whose `next` is itself. Both cursors leave the head and arrive straight back at it, and the ring is one node long.',
    input: { type: 'numbers', values: [9] },
    params: { cycleBack: 0 },
  },
  {
    id: 'two-node-cycle',
    label: 'Two-node ring behind one node',
    blurb:
      'The first node is a tail; nodes 2 and 3 point at each other. The cursors collide on node 3, which is *not* the entry, so the reset phase has to walk them one node at a time to find node 2.',
    input: { type: 'numbers', values: [1, 2, 3] },
    params: { cycleBack: 1 },
  },
  {
    id: 'long-tail',
    label: 'Four-node tail, three-node ring',
    blurb:
      'The textbook case: a four-node tail feeding a three-node ring. The cursors collide on node 7, three steps round the ring from where the ring actually begins, and only the reset phase reveals that the entry is node 5.',
    input: { type: 'numbers', values: [1, 2, 3, 4, 5, 6, 7] },
    params: { cycleBack: 4 },
  },
  {
    id: 'whole-list',
    label: 'The whole list is the ring',
    blurb:
      'The tail is empty, so the collision point *is* the entry point and the reset phase has nothing to walk. The degenerate case where the second half of the algorithm finds its answer for free.',
    input: { type: 'numbers', values: [1, 2, 3, 4, 5] },
    params: { cycleBack: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const cycleBackOf = (p: Preset): number => Number(p.params?.cycleBack ?? -1);

/** The machine-checkable claim: the ring's length, or 0 when there is no ring. */
const cycleLength = (n: number, cycleBack: number): number => {
  if (n === 0 || cycleBack < 0 || cycleBack >= n) return 0;
  return n - cycleBack;
};

export function* detectCycle(ctx: RunContext): Generator<LinkedFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;
  const back = Number(ctx.params.cycleBack ?? -1);
  const hasCycle = n > 0 && back >= 0 && back < n;

  const ids: NodeId[] = values.map((_, i) => `n${i + 1}`);
  const nextOf: (NodeId | null)[] = ids.map((_, i) => ids[i + 1] ?? null);
  if (hasCycle) nextOf[n - 1] = ids[back] as NodeId;

  const idx = (id: NodeId | null): number => (id === null ? -1 : ids.indexOf(id));
  const idAt = (i: number): NodeId => ids[i] as NodeId;

  /** The real ring is `back … n-1`; anything before it is tail. */
  const ringIdx = hasCycle ? Array.from({ length: n - back }, (_, k) => back + k) : [];
  const tailIdx = hasCycle
    ? Array.from({ length: back }, (_, k) => k)
    : Array.from({ length: n }, (_, k) => k);
  const ringIds = ringIdx.map(idAt);
  const tailIds = tailIdx.map(idAt);

  /**
   * Cycle-first ordering. `LinkedListView` picks the head as the first node with
   * no `prev`, walks `next` until it revisits a node, and then draws the closing
   * arc from the *last* box back to the *first*. So putting the ring first makes
   * the drawn circle the actual cycle. The tail follows as unreachable
   * remainder — which is precisely what it is.
   */
  const snapshot = (): LinkedNode[] =>
    [...ringIdx, ...tailIdx].map((i) => ({
      id: idAt(i),
      value: values[i] as number,
      next: nextOf[i] ?? null,
    }));

  /** Ring membership in every frame, so the lesson never depends on the arc. */
  const hl = (extra: Record<string, NodeId[]> = {}): Record<string, NodeId[]> => {
    const out: Record<string, NodeId[]> = { ...extra };
    if (ringIds.length > 0) out.cycle = [...ringIds];
    if (tailIds.length > 0) out.unvisited = [...tailIds];
    return out;
  };

  const cursors = (slow: NodeId, fast: NodeId | null): Record<string, NodeId> =>
    fast === null ? { slow } : { slow, fast };

  let ops = 0;

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'start',
    caption: n === 0 ? 'Empty list' : `List of ${n} node${n === 1 ? '' : 's'}`,
    note:
      n === 0
        ? 'The list is empty, so there is nothing to walk and certainly no cycle. Neither cursor has a head to stand on.'
        : hasCycle
          ? `${n} nodes; the last one's arrow points back to node ${back + 1}, so a ${n - back}-node ring sits at the end${back > 0 ? `, behind a ${back}-node tail` : ' and there is no tail at all'}. Both cursors start on the head: the tortoise and the hare.`
          : `${n} nodes ending in \`null\`. Both cursors start on the head — the tortoise moves one node per step, the hare two, and the gap between them grows by exactly one node per iteration.`,
    nodes: snapshot(),
    circular: hasCycle,
    pointers: n > 0 ? { slow: idAt(0), fast: idAt(0) } : {},
    highlight: hl(),
    vars: { n, cycleBack: back, ops },
  };

  if (n === 0) {
    yield {
      kind: 'linked',
      index: 0,
      anchor: 'done',
      caption: 'Empty list',
      note: 'The list is empty, so the answer is 0: there is no node for either cursor to stand on, let alone a ring.',
      nodes: snapshot(),
      circular: false,
      highlight: {},
      result: 'no-cycle',
      ops,
      vars: { n: 0, length: 0, ops },
    };
    return;
  }

  // ---- phase 1: the two speeds ------------------------------------------
  let slow: NodeId = idAt(0);
  let fast: NodeId = idAt(0);
  let met = false;

  while (nextOf[idx(fast)] !== null) {
    if (ctx.shouldStop()) return;
    ops++;

    const tortoiseFrom = idx(slow);
    const hareFrom = idx(fast);
    slow = nextOf[idx(slow)] as NodeId;
    const mid = nextOf[idx(fast)] as NodeId;
    fast = nextOf[idx(mid)] as NodeId;

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'advance',
      caption: `Step ${ops}`,
      note: `The tortoise hops one node to ${values[idx(slow)] as number}; the hare hops two, from node ${hareFrom + 1} past node ${idx(mid) + 1} to node ${idx(fast) + 1}. Their distance grows by one node every step, and that is the whole proof.`,
      nodes: snapshot(),
      circular: hasCycle,
      pointers: cursors(slow, fast),
      highlight: hl({ current: [fast] }),
      ops,
      vars: { step: ops, tortoise: (values[tortoiseFrom] as number) ?? 0, cycleBack: back },
    };

    if (slow === fast) {
      met = true;
      yield {
        kind: 'linked',
        index: 0,
        anchor: 'meet',
        caption: `Step ${ops}`,
        note: `Both cursors are on node ${idx(slow) + 1}. The gap started at zero and is zero again, which is only possible on a ring — so this node is provably on the cycle, even though it is not yet known to be where the cycle *starts*.`,
        nodes: snapshot(),
        circular: hasCycle,
        pointers: cursors(slow, fast),
        highlight: hl({ answer: [slow] }),
        ops,
        vars: { step: ops, at: idx(slow) + 1, cycleBack: back },
      };
      break;
    }
  }

  if (!met) {
    yield {
      kind: 'linked',
      index: 0,
      anchor: 'no-cycle',
      caption: `Step ${ops}`,
      note: `The hare left the chain: node ${idx(fast) + 1} ${fast === null ? 'is null' : 'has a null `next`'}. Only a list with no cycle can produce that, so the answer is settled — no second phase, no extra space, and not one field of the list has been modified.`,
      nodes: snapshot(),
      circular: false,
      pointers: { slow },
      highlight: hl(),
      result: 'no-cycle',
      ops,
      vars: { step: ops, cycleBack: back },
    };

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'done',
      caption: 'Acyclic',
      note: `No cycle. ${ops} step${ops === 1 ? '' : 's'}, two cursors, zero memory allocated and not one arrow rewritten.`,
      nodes: snapshot(),
      circular: false,
      pointers: {},
      highlight: { unvisited: [...ids] },
      result: 'no-cycle',
      ops,
      vars: { n, length: 0, ops },
    };
    return;
  }

  // ---- phase 2: the head pointer and the meeting pointer, one step each ----
  //
  // The collision happened at position μ + λj for some j ≥ 1, which is the same
  // ring position as μ steps along. So advancing one cursor from the head and
  // the other from the collision node, one node at a time, their *first*
  // coincidence is exactly μ steps in — the ring's entry point.
  let meeting = slow;
  let head = idAt(0);

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'reset',
    caption: 'Find the entry',
    note: `Put one cursor back on the head and leave the other on the collision node, then walk them **one node at a time**. Where they agree is the first node of the ring.`,
    nodes: snapshot(),
    circular: hasCycle,
    pointers: { slow: head, fast: meeting },
    highlight: hl(),
    ops,
    vars: { meetAt: idx(meeting) + 1, cycleBack: back },
  };

  while (head !== meeting) {
    if (ctx.shouldStop()) return;
    ops++;
    head = nextOf[idx(head)] as NodeId;
    meeting = nextOf[idx(meeting)] as NodeId;
    yield {
      kind: 'linked',
      index: 0,
      anchor: 'reset',
      caption: 'Find the entry',
      note: `Both step one node. The collision point was μ + λj steps along for some j ≥ 1, which is the same ring position as μ steps along — so the head pointer's first possible meeting is μ steps in, and the tail length is shrinking under it one node per frame.`,
      nodes: snapshot(),
      circular: hasCycle,
      pointers: { slow: head, fast: meeting },
      highlight: hl(),
      ops,
      vars: { at: idx(head) + 1, cycleBack: back, ops },
    };
  }

  const entry = head;

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'reset',
    caption: 'Find the entry',
    note:
      back > 0
        ? `They agree on node ${idx(entry) + 1}, and that is ${back} node${back === 1 ? '' : 's'} along from the head — so node ${idx(entry) + 1} is the **entry point**: the first node of the ring, and where the tail arrives.`
        : `They agree on node ${idx(entry) + 1}, which is the head itself: with no tail in front of the ring, the collision point was already the entry.`,
    nodes: snapshot(),
    circular: hasCycle,
    pointers: { slow: entry },
    highlight: hl({ answer: [entry] }),
    ops,
    vars: { at: idx(entry) + 1, entry: idx(entry) + 1, cycleBack: back },
  };

  // ---- phase 3: measure the ring ------------------------------------------
  let length = 1;
  let p = nextOf[idx(entry)] as NodeId;

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'count',
    caption: 'Measure the ring',
    note: `Now walk the ring once from the entry, counting. Every step is guaranteed to stay on the ring and the last one is guaranteed to land back on the entry — that is what makes it a ring and not a path.`,
    nodes: snapshot(),
    circular: true,
    pointers: { entry, at: p },
    highlight: hl({ answer: [entry] }),
    ops,
    vars: { length, entry: idx(entry) + 1, cycleBack: back },
  };

  while (p !== entry) {
    if (ctx.shouldStop()) return;
    ops++;
    length++;
    p = nextOf[idx(p)] as NodeId;
    yield {
      kind: 'linked',
      index: 0,
      anchor: 'count',
      caption: 'Measure the ring',
      note: `Count node ${idx(p) + 1}. ${length} so far, and the walk has not returned to node ${idx(entry) + 1} yet.`,
      nodes: snapshot(),
      circular: true,
      pointers: { entry, at: p },
      highlight: hl({ answer: [entry] }),
      ops,
      vars: { length, entry: idx(entry) + 1, cycleBack: back },
    };
  }

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'done',
    caption: `Cycle of ${length}`,
    note: `The walk returned to node ${idx(entry) + 1} after ${length} node${length === 1 ? '' : 's'}, so the ring is ${length} long${back > 0 ? ` and sits behind a ${back}-node tail — ${back} node${back === 1 ? ' is' : 's are'} not on it` : ''}. ${ops} pointer step${ops === 1 ? '' : 's'} in total, and the list was never modified.`,
    nodes: snapshot(),
    circular: true,
    pointers: { entry },
    highlight: { answer: [...ringIds], tail: [...tailIds] },
    result: 'cycle',
    ops,
    vars: { n, length, entry: idx(entry) + 1, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'List values',
      kind: 'numbers' as const,
      default: PRESETS[0]?.input.type === 'numbers' ? PRESETS[0].input.values : [],
    },
    {
      key: 'cycleBack',
      label: 'Last node points back to',
      kind: 'number' as const,
      min: -1,
      max: 7,
      step: 1,
      default: -1,
      help: '0-based index the final node links to. -1 ends the list normally, so there is no cycle at all.',
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
 *
 * Each language builds a real node structure and walks it with real references
 * or real pointers; each returns the cycle **length** as a plain number. A cycle
 * is a graph containing a loop, so no language can hand the structure back
 * through the JSON boundary the harness uses. A number can.
 * ------------------------------------------------------------------ */

const JS = `class Node {
  constructor(value) { this.value = value; this.next = null; }
}

function detectCycle(a, cycleBack) {
  const nodes = a.map((v) => new Node(v));
  for (let i = 0; i + 1 < nodes.length; i++) nodes[i].next = nodes[i + 1];
  if (nodes.length > 0 && cycleBack >= 0 && cycleBack < nodes.length) {
    nodes[nodes.length - 1].next = nodes[cycleBack];   // close the ring
  }
  if (nodes.length === 0) return 0;
  let slow = nodes[0];
  let fast = nodes[0];                                // @anchor start
  while (fast.next !== null) {
    slow = slow.next;                                 // @anchor advance
    fast = fast.next.next;
    if (slow === fast) break;                         // @anchor meet
  }
  if (fast.next === null) return 0;                   // @anchor no-cycle
  let head = nodes[0];                                // one cursor back to the head
  while (head !== fast) {
    head = head.next;
    fast = fast.next;                                 // @anchor reset
  }
  let length = 1;
  let p = head.next;                                  // @anchor count
  while (p !== head) {
    length += 1;
    p = p.next;
  }
  return length;                                      // @anchor done
}`;

const PY = `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


def detect_cycle(a, cycle_back):
    nodes = [Node(v) for v in a]
    for i in range(len(nodes) - 1):
        nodes[i].next = nodes[i + 1]
    if nodes and 0 <= cycle_back < len(nodes):
        nodes[-1].next = nodes[cycle_back]             # close the ring
    if not nodes:
        return 0
    slow = nodes[0]
    fast = nodes[0]                                   # @anchor start
    while fast.next is not None:
        slow = slow.next                              # @anchor advance
        fast = fast.next.next
        if slow is fast:                              # @anchor meet
            break
    if fast.next is None:                             # @anchor no-cycle
        return 0
    head = nodes[0]                                   # one cursor back to the head
    while head is not fast:
        head = head.next
        fast = fast.next                              # @anchor reset
    length = 1
    p = head.next                                     # @anchor count
    while p is not head:
        length += 1
        p = p.next
    return length                                     # @anchor done
`;

const JAVA = `class DetectCycle {
    static class Node {
        final int value;
        Node next;
        Node(int value) { this.value = value; }
    }

    static int detectCycle(int[] a, int cycleBack) {
        int n = a.length;
        Node[] nodes = new Node[n];
        for (int i = 0; i < n; i++) nodes[i] = new Node(a[i]);
        for (int i = 0; i + 1 < n; i++) nodes[i].next = nodes[i + 1];
        if (n > 0 && cycleBack >= 0 && cycleBack < n) {
            nodes[n - 1].next = nodes[cycleBack];     // close the ring
        }
        if (n == 0) return 0;
        Node slow = nodes[0];
        Node fast = nodes[0];                         // @anchor start
        while (fast.next != null) {
            slow = slow.next;                         // @anchor advance
            fast = fast.next.next;
            if (slow == fast) break;                  // @anchor meet
        }
        if (fast.next == null) return 0;              // @anchor no-cycle
        Node head = nodes[0];                         // one cursor back to the head
        while (head != fast) {
            head = head.next;
            fast = fast.next;                         // @anchor reset
        }
        int length = 1;
        Node p = head.next;                           // @anchor count
        while (p != head) {
            length++;
            p = p.next;
        }
        return length;                                // @anchor done
    }
}`;

const CPP = `#include <vector>

struct Node {
    int value;
    Node* next;
    explicit Node(int v) : value(v), next(nullptr) {}
};

int detect_cycle(const std::vector<int>& a, int cycle_back) {
    int n = (int)a.size();
    std::vector<Node*> nodes;
    for (int i = 0; i < n; i++) nodes.push_back(new Node(a[i]));
    for (int i = 0; i + 1 < n; i++) nodes[i]->next = nodes[i + 1];
    if (n > 0 && cycle_back >= 0 && cycle_back < n) {
        nodes[n - 1]->next = nodes[cycle_back];       // close the ring
    }
    if (n == 0) return 0;
    Node* slow = nodes[0];
    Node* fast = nodes[0];                           // @anchor start
    while (fast->next != nullptr) {
        slow = slow->next;                           // @anchor advance
        fast = fast->next->next;
        if (slow == fast) break;                     // @anchor meet
    }
    if (fast->next == nullptr) return 0;             // @anchor no-cycle
    Node* head = nodes[0];                           // one cursor back to the head
    while (head != fast) {
        head = head->next;
        fast = fast->next;                           // @anchor reset
    }
    int length = 1;
    for (Node* p = head->next; p != head; p = p->next) length++;  // @anchor count
    return length;                                   // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Both cursors are born on the head, so the gap between them is zero — and that zero is the entire invariant. The tortoise advances one node per step, the hare two, so the gap grows by exactly one per iteration and can only be zero again at a node on a ring. JavaScript has no pointer syntax: `next` holds a *reference to another object*, so `slow === fast` is an identity test on objects, not a value test on fields.',
    python:
      'The identity test is the interesting line. Python has no pointers, so the honest way to ask "are these two cursors on the same node?" is `slow is fast` — **object identity**. Using `==` happens to work for a class with no `__eq__` and silently stops working the moment someone adds one, which is the Python-specific way this algorithm gets quietly broken. `None` plays the role of `null` throughout, and the loop condition is `fast.next is not None` rather than `fast is not None`, which is the off-by-one that makes the two hops safe.',
    java: 'Both references start on the head and the collision test is `slow == fast` — Java reference identity, with no `equals` in play. This algorithm exists in Java rather than as a `HashSet<Node>` because of memory: a visited set is O(n) references, which on a multi-gigabyte buffer is not a trade worth making. The `Node[]` here is only there to build the test input, and it is not part of the algorithm — the walk allocates nothing at all.',
    cpp: 'Both pointers start on the head and the collision test is `slow == fast`, an address comparison that never dereferences. This is the one algorithm where the compiler *cannot* assume two pointers are distinct, because a cycle is exactly the situation in which they may alias — and here that is what we want, so the absence of `restrict` costs nothing.',
  },
  advance: {
    javascript:
      'The two speeds. `fast.next.next` is safe because the loop condition already established that `fast.next` is not `null`, and a non-null node always has a `next` of its own. Write the guard one step too short and `null.next` throws a `TypeError` in the middle of the walk; write it one step too long and you pay a redundant test on every iteration of the hottest loop in the algorithm.',
    python:
      'Two hops for the hare, one for the tortoise. `fast.next.next` is safe only because the guard proved `fast.next` is not `None`, and a real node always has a `next`. Python is unforgiving here: dereferencing `None` raises `AttributeError` immediately, which is a better failure than a wrong answer but still a crash rather than a clean exit. Add a `next` of `None` to a node that is supposed to have one and the crash is at the hop, not at the test.',
    java: 'Two hops for the hare, one for the tortoise, with no null checks beyond the loop guard. Java is happy to let you write `fast.next.next.next` and find out as a `NullPointerException` at run time, which is the most helpful thing the language does here and also the reason cycle bugs so often survive code review. The guard is one line, and it is the entire safety argument.',
    cpp: 'Two hops for the hare, one for the tortoise. In C++ a null `Node*` is a segmentation fault rather than an exception, so the loop guard is not defensive style — it is the only thing between the program and a crash. The nodes are never freed, which is deliberate: destroying a *cyclic* allocation correctly is a genuine ownership problem, not an oversight.',
  },
  meet: {
    javascript:
      'The gap is zero again. Since it grew monotonically by one per step from zero, the only way back to zero is to have gone right around a ring, so this node is provably on the cycle. It is **not** known to be the first node of the cycle — that distinction is the entire reason the algorithm has a second half, and it stays invisible until you watch the reset phase.',
    python:
      'A collision means "somewhere on the ring", never "at the entry". The meeting point is at position μ + λj along the chain for some j ≥ 1, and *which* node that is depends on the arithmetic of the tail and ring lengths. Skipping the reset phase is the most common way to get this algorithm subtly, silently wrong: it still returns the right answer to "is there a cycle", and the wrong answer to "where does it start".',
    java: 'A collision proves membership of the ring, not arrival at its head. Because `==` on a plain class is reference equality, this test cannot be fooled by two distinct nodes holding equal values — a mistake a value-typed language makes easy and Java does not. By this point the algorithm has spent nothing but time: no set has been filled, no flag has been set on a node, and the list is exactly as it was handed over.',
    cpp: 'A collision means "somewhere on the ring", never "at the entry". Since `slow == fast` compares addresses, it cannot be fooled by equal payloads — and it cannot be *optimised away* either, because a cycle is precisely the case where a compiler is obliged to assume the pointers might alias. The two-speed walk is therefore also the standard library\'s cycle detector for iterators, where the same reasoning applies to pointers into a container.',
  },
  'no-cycle': {
    javascript:
      'The hare left the chain, and only a list with no cycle can produce that: on a ring, `next` is never `null`. This single test is the whole exit condition, and note what did **not** happen — no field was written after construction, so there is nothing to undo. That is the property that makes this the right algorithm on a read-only or shared structure.',
    python:
      'Falling off the end is the only way out of the loop that is not a collision, and on a ring `next` is never `None`. Because nothing was written to any node, this branch needs no cleanup — the same guarantee the other three languages give you, and the reason a "mark the nodes you visited" implementation is the wrong choice when the list is shared.',
    java: 'The hare reached `null`, which proves acyclicity. This branch is the one most hand-rolled implementations forget, and forgetting it is why so many naive cycle checks spin forever instead of terminating: they only test for a collision and have no exit at all for "the list ended". A correct Floyd implementation has exactly two exits, and this is the second one.',
    cpp: 'The hare dereferenced its way to `nullptr`, which proves there is no ring. Note there is only this exit and the collision one — a `while (true)` with a step-count safety valve would spin on a malformed list instead of stopping, and "spins forever on bad input" is a bug report you do not want to own.',
  },
  reset: {
    javascript:
      'The second half of the algorithm, and the frame worth watching: the collision happened at position μ + λj, and μ is the same ring position, so advancing the head pointer and the collision pointer one node at a time makes them agree for the **first** time exactly μ steps in. The head pointer is still in the tail at every step before that, so there is nothing to collide with. Two speeds, then one speed — the sequence is the algorithm, not an optimisation.',
    python:
      'The tortoise goes back to the head while the hare stays on the collision node, and both now advance one node at a time. The proof is positional: before μ steps the head pointer is in the tail, where every position is unique, so no meeting is even possible; at μ steps both sit at position μ, and μ + λj is the same ring position as μ. Note the loop condition is `head is not fast` — the two cursors themselves, not their successors.',
    java: "One cursor goes back to the head and the other stays put; both then advance one node at a time. Their first coincidence is the ring's entry, and it is *unique*: every node on the ring is visited exactly once per lap, so the only positions that can coincide are the ones congruent mod λ, and the first of those at or after μ is μ itself. That uniqueness is why no visited set is needed and why the answer is the same on every run.",
    cpp: 'The same two-speed-then-one-speed shape, with the collision test as an address comparison. This is also the standard-library story: `std::list::splice` that splices a range into itself, and iterator invalidation rules, both come down to "a cycle means the two pointers may alias, so prove it instead of assuming it". The μ-and-λ argument is the same argument every time.',
  },
  count: {
    javascript:
      'With the entry known, the ring is measured by walking it once. This is where the claim becomes falsifiable: the count is 0 for an acyclic list and ≥ 1 for a real one, so the return value distinguishes "no ring" from "a self-loop" — a boolean could not. The walk terminates because it is bounded by the ring it is on, and the loop re-reads `head.next` each test rather than caching it, trading a comparison for a variable.',
    python:
      'One lap of the ring, counting nodes. A `for` loop would be shorter in JavaScript and C++, but Python has none, so the same shape is spelled `while p is not head` with the counter incremented first. The `is` is the identity test again, and it is what makes the loop terminate: a value comparison could stop early on a ring whose nodes happen to hold equal payloads.',
    java: 'One lap, counting. The count is the return value, so it is a strictly stronger machine-checked claim than a boolean: 0 means no ring, 1 means a self-loop, and anything larger is a genuine multi-node cycle. Returning the `Node` would be the idiomatic Java choice for a real API — but a node graph containing a loop has no serialisation, so the harness would have nothing to compare. Primitives cross language boundaries; object graphs do not.',
    cpp: 'One lap of the ring, counting nodes, with the nodes deliberately never freed. Freeing a cyclic allocation is the classic ownership problem that `std::unique_ptr` and `std::weak_ptr` exist to solve; leaking a few dozen bytes in a verification run is the right trade, and saying so in a comment is the right documentation.',
  },
  done: {
    javascript:
      "The ring's length, as a number rather than a structure — a cyclic node graph has no JSON representation that four languages would agree on. A number is also a claim that can actually fail: if the chaining, the tail, the collision test or the reset phase were wrong in any one of the four listings, this value would disagree, and the harness would say so.",
    python:
      'The count, with 0 reserved for "no cycle" so the scalar answer is unambiguous. Because the harness compares the returned value across four languages, the shape is fixed to a plain `int`: a list of node ids would be a claim no other language could express, let alone compare.',
    java: 'The cycle length as a primitive `int`, which is also the only return type the verification driver can convert uniformly for all four languages. Deliberately the same width everywhere, so any disagreement is a logic error rather than an integer-overflow artefact hiding behind it.',
    cpp: "The cycle length as an `int`, and the one return type the C++ driver's `toJ` can convert for every algorithm in the curriculum. Same width as the Java `int` and the Python `int`, so a mismatch in the harness is always a real disagreement about the algorithm.",
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'detectCycle',
    python: 'detect_cycle',
    java: 'DetectCycle.detectCycle',
    cpp: 'detect_cycle',
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

const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return {
    presetId: p.id,
    args: [values, cycleBackOf(p)],
    result: cycleLength(values.length, cycleBackOf(p)),
  };
});

export const detectCycleAlgo: AlgoDef<LinkedFrame> = {
  id: 'detect-cycle',
  title: 'Detect a Cycle (Floyd)',
  category: 'linked-lists',
  summary:
    'Walk two cursors at different speeds. If the fast one falls off the end there is no cycle; if they meet, they must be on a ring.',
  intuition:
    'Reach for this when you are handed a structure you are not allowed to modify — a shared immutable list, a hardware receive buffer, a graph you only got a read handle on — because every alternative needs O(n) memory or a write, and "mark the nodes you have seen" is illegal on all three. Outside that constraint it is still the right first move, because the two-speed trick finds the ring *and* its length in one pass with no allocation. Pair it with the reset phase when you need the entry point; "there is a loop somewhere" is rarely the question you actually have.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'Worst case is μ + λ node visits, where μ is the tail length and λ the ring length — a million-node tail feeding a 2-node ring still terminates in time proportional to the tail. Best case O(1) is the empty or single-node list. The list is never modified and never copied.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['two pointers', 'O(1) space', 'read-only safe', 'no allocation'],
  },
  viewport: 'linked',
  level: 'intermediate',
  params: [
    {
      key: 'cycleBack',
      label: 'Last node points back to',
      kind: 'number',
      min: -1,
      max: 7,
      step: 1,
      default: -1,
      help: '0-based index the final node links to. -1 ends the list normally, so there is no cycle at all.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: detectCycle,
  lesson,
  expectations,
  formatResult: (r) => (Number(r) === 0 ? 'no cycle' : `cycle of ${String(r)}`),
  anchors: ['start', 'advance', 'meet', 'no-cycle', 'reset', 'count', 'done'],
};

export default detectCycleAlgo;

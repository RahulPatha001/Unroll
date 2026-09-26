import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isNumbers } from '../../input/types.ts';
import type { LinkedFrame, LinkedNode, NodeId } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Reverse a singly linked list in place.
 *
 * This is the canonical "your data structure is a graph, not an array" lesson.
 * Reversing an array is `a.reverse()`; reversing a linked list is *pointer
 * surgery*, and the only reason it is hard is that the middle of the list is
 * reachable by exactly one route — its predecessor's `next` field. Flip that
 * field and the tail of the list ceases to exist unless you saved it first.
 *
 * The visual is built around that one observation:
 *
 *  - `relinked: [id]` lights the arrow whose `next` field just changed, in
 *    amber, so the *write* is visible and not just the new arrangement;
 *  - the node array is ordered **reversed-prefix-first**, then the untouched
 *    suffix. That puts the current head at `nodes[0]` (which is how
 *    `LinkedListView` picks the head for a singly linked list) and it makes the
 *    gap between the two chains visible — mid-rewire the list really *is* in
 *    two pieces, and pretending otherwise would be a lie;
 *  - `highlight.reversed` is the finished prefix, which grows by exactly one
 *    node per iteration. It is the invariant made visible.
 *
 * `doubly` is left unset: this is a singly linked list, and the `prev` chain is
 * deliberately absent rather than null-filled, so the renderer picks the head
 * from the node order.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * No randomness here at all, and that is a deliberate choice: the *shape* of the
 * input is the variable that matters for a pointer algorithm, not its values.
 * Each preset is a structural edge case rather than another seed.
 */
const PRESETS: Preset[] = [
  {
    id: 'typical',
    label: 'Five nodes',
    blurb:
      'The everyday case. Every one of the five `next` fields is rewritten, and the reversed prefix grows by one node per iteration.',
    input: { type: 'numbers', values: [1, 2, 3, 4, 5] },
  },
  {
    id: 'two-nodes',
    label: 'Two nodes',
    blurb:
      'The smallest list where the algorithm does anything. One arrow is flipped and the two nodes swap places — which is the case most "clever" one-pass variants get wrong.',
    input: { type: 'numbers', values: [1, 2] },
  },
  {
    id: 'single',
    label: 'One node',
    blurb:
      'The degenerate case. A one-node list is already reversed, so the only real work is turning its `next` into `null` — and the loop must not crash trying to read past the end.',
    input: { type: 'numbers', values: [7] },
  },
  {
    id: 'palindrome',
    label: 'Palindrome',
    blurb:
      'Reversing changes every arrow but not a single position, because the list reads the same in both directions. Watch the `just rewired` arrows: the picture is identical and the structure is completely different.',
    input: { type: 'numbers', values: [1, 2, 3, 2, 1] },
  },
  {
    id: 'empty',
    label: 'Empty',
    blurb:
      'Nothing to reverse. `prev` starts as `null` and the loop never runs, so the answer is the empty list — and the generator still produces a valid frame rather than crashing.',
    input: { type: 'numbers', values: [] },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

export function* reverseList(ctx: RunContext): Generator<LinkedFrame> {
  const input = ctx.input as { type: 'numbers'; values: number[] };
  const source = isNumbers(ctx.input) ? ctx.input.values : input.values;
  const values = [...source];
  const n = values.length;

  const ids: NodeId[] = values.map((_, i) => `n${i + 1}`);

  /** `next[i]` is the id `n(i+1)` should point at *right now*. */
  const nextOf: (NodeId | null)[] = ids.map((_, i) => ids[i + 1] ?? null);

  /** How many nodes have been flipped already — i.e. the length of the `prev` chain. */
  let reversedCount = 0;
  let ops = 0;

  /**
   * Rebuild the whole node array from scratch, every time.
   *
   * Order matters and it is not cosmetic: for a *singly* linked list
   * `LinkedListView` picks the head as the first node with no `prev` field, so
   * `nodes[0]` must be the current head. That means the finished reversed prefix
   * goes first (newest first, so its head leads), followed by the untouched
   * suffix. The renderer walks the first chain from the head, then appends the
   * unreachable remainder in array order — which reads exactly like the real
   * mid-rewire state, where the list genuinely is two separate pieces.
   */
  const snapshot = (): LinkedNode[] => {
    const out: LinkedNode[] = [];
    for (let k = reversedCount - 1; k >= 0; k--) {
      out.push({
        id: ids[k] as NodeId,
        value: values[k] as number,
        next: k === 0 ? null : (ids[k - 1] ?? null),
      });
    }
    for (let k = reversedCount; k < n; k++) {
      out.push({ id: ids[k] as NodeId, value: values[k] as number, next: nextOf[k] ?? null });
    }
    return out;
  };

  /** `reversedCount - 1` is the head of the finished chain; `reversedCount` is the node in hand. */
  const pointers = (): Record<string, NodeId> => {
    const out: Record<string, NodeId> = {};
    const prevId = ids[reversedCount - 1];
    const currId = ids[reversedCount];
    if (prevId !== undefined) out.prev = prevId;
    if (currId !== undefined) out.curr = currId;
    return out;
  };

  const reversedIds = (): NodeId[] => ids.slice(0, reversedCount);
  const remainingIds = (): NodeId[] => ids.slice(reversedCount);

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'start',
    note:
      n < 2
        ? 'Fewer than two nodes, so there is no arrow worth flipping. The list is already in its own reverse order.'
        : `${n} nodes, ${n - 1} arrows. \`prev\` starts as \`null\` — that is the new tail — and \`curr\` takes the head. Every node keeps its value; only the arrows move.`,
    nodes: snapshot(),
    highlight: { unvisited: [...ids] },
    vars: { n, reversed: reversedCount, ops },
  };

  while (reversedCount < n) {
    if (ctx.shouldStop()) return;
    ops++;

    const k = reversedCount;
    const currId = ids[k] as NodeId;
    const nextId = nextOf[k] ?? null;

    if (nextId !== null) {
      yield {
        kind: 'linked',
        index: 0,
        anchor: 'save-next',
        caption: `Node ${k + 1} of ${n}`,
        note: `Save ${values[k] as number}'s own \`next\` before overwriting it. This is the only handle on the rest of the list — repoint the field first and everything after this node is unreachable.`,
        nodes: snapshot(),
        pointers: { ...pointers(), next: nextId },
        highlight: { reversed: reversedIds(), unvisited: remainingIds() },
        ops,
        vars: { i: k, n, reversed: reversedCount, ops },
      };
    }

    nextOf[k] = reversedCount === 0 ? null : (ids[reversedCount - 1] ?? null);
    reversedCount++;

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'flip',
      caption: `Node ${k + 1} of ${n}`,
      note:
        nextId === null
          ? `The old tail ${values[k] as number} had \`next = null\`; it now points at ${reversedCount >= 2 ? `${values[k - 1] as number}, the new head of the reversed part` : 'nothing, so it becomes the new tail'}. One arrow down, and the reversed prefix is a complete list.`
          : `Flip ${values[k] as number}'s arrow: it now points back at ${reversedCount >= 2 ? `${values[k - 1] as number}` : 'nothing'}. The first ${reversedCount} node${reversedCount === 1 ? '' : 's'} now form a self-contained chain.`,
      nodes: snapshot(),
      pointers: pointers(),
      relinked: [currId],
      highlight: { reversed: reversedIds(), unvisited: remainingIds() },
      ops,
      vars: { i: k, n, reversed: reversedCount, ops },
    };

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'advance',
      caption: `Node ${k + 1} of ${n}`,
      note:
        nextId === null
          ? `Nothing follows, so the walk is over. \`curr\` becomes null and \`prev\` — ${values[k] as number} — is the new head of the reversed list.`
          : `Both cursors step one node along the original chain. The ${reversedCount} node${reversedCount === 1 ? '' : 's'} before \`prev\` are final; everything from \`curr\` on is still in its original order.`,
      nodes: snapshot(),
      pointers: pointers(),
      highlight: { reversed: reversedIds(), unvisited: remainingIds() },
      ops,
      vars: { i: k, n, reversed: reversedCount, ops },
    };
  }

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'done',
    caption: 'Reversed',
    note:
      n === 0
        ? 'The list was empty, so it stays empty: the head was null before the loop and is null after it.'
        : `The head is now ${values[n - 1] as number} and the tail is ${values[0] as number}. ${ops} arrow${ops === 1 ? '' : 's'} rewritten, no node allocated and no value copied.`,
    nodes: snapshot(),
    highlight: { reversed: [...ids] },
    result: 'reversed',
    ops,
    vars: { n, reversed: reversedCount, ops },
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
 * All four listings return a **comma-joined string** rather than a node list.
 * A real `Node` graph cannot cross the JSON boundary the verification harness
 * uses, and a list of numbers cannot cross it in four identical shapes either
 * (Java `int[]` vs Python `list` vs `vector<int>` do serialise the same way,
 * but the string removes every ambiguity for free). The *point* of the module
 * is the pointer work, not the return type, so the string costs nothing.
 * ------------------------------------------------------------------ */

const JS = `class Node {
  constructor(value) { this.value = value; this.next = null; }
}

function reverseList(a) {
  // Build the chain by prepending, so no tail pointer is ever needed.
  let head = null;
  for (let i = a.length - 1; i >= 0; i--) {
    const node = new Node(a[i]);
    node.next = head;
    head = node;
  }
  let prev = null;                        // @anchor start  prev = the finished, reversed prefix
  let curr = head;                         // curr = the node being turned around
  while (curr !== null) {
    const next = curr.next;                // @anchor save-next
    curr.next = prev;                      // @anchor flip
    prev = curr;                           // @anchor advance
    curr = next;
  }
  const out = [];
  for (let n = prev; n !== null; n = n.next) out.push(String(n.value));
  return out.join(',');                    // @anchor done
}`;

const PY = `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


def reverse_list(a):
    head = None
    # Prepending builds the chain without a tail pointer.
    for v in reversed(a):
        node = Node(v)
        node.next = head
        head = node
    prev = None                            # @anchor start  prev = the finished, reversed prefix
    curr = head                             # curr = the node being turned around
    while curr is not None:
        nxt = curr.next                     # @anchor save-next
        curr.next = prev                    # @anchor flip
        prev = curr                         # @anchor advance
        curr = nxt
    out = []
    node = prev
    while node is not None:
        out.append(str(node.value))
        node = node.next
    return ",".join(out)                    # @anchor done`;

const JAVA = `class ReverseList {
    static class Node {
        final int value;                    // the payload never changes
        Node next;                          // the arrow, and the only mutable part
        Node(int value) { this.value = value; }
    }

    static String reverseList(int[] a) {
        Node head = null;
        for (int i = a.length - 1; i >= 0; i--) {
            Node node = new Node(a[i]);
            node.next = head;
            head = node;
        }
        Node prev = null;                   // @anchor start  prev = the finished, reversed prefix
        Node curr = head;                   // curr = the node being turned around
        while (curr != null) {
            Node next = curr.next;          // @anchor save-next
            curr.next = prev;               // @anchor flip
            prev = curr;                    // @anchor advance
            curr = next;
        }
        StringBuilder sb = new StringBuilder();
        for (Node n = prev; n != null; n = n.next) {
            if (sb.length() > 0) sb.append(',');
            sb.append(n.value);
        }
        return sb.toString();               // @anchor done
    }
}`;

const CPP = `#include <string>
#include <vector>

struct Node {
    int value;
    Node* next;                             // the arrow, and the only mutable part
    explicit Node(int v) : value(v), next(nullptr) {}
};

std::string reverse_list(const std::vector<int>& a) {
    Node* head = nullptr;
    for (int i = (int)a.size() - 1; i >= 0; i--) {
        Node* node = new Node(a[i]);
        node->next = head;
        head = node;
    }
    Node* prev = nullptr;                   // @anchor start  prev = the finished, reversed prefix
    Node* curr = head;                      // curr = the node being turned around
    while (curr != nullptr) {
        Node* next = curr->next;            // @anchor save-next
        curr->next = prev;                  // @anchor flip
        prev = curr;                        // @anchor advance
        curr = next;
    }
    std::string out;
    for (Node* n = prev; n != nullptr; n = n->next) {
        if (!out.empty()) out += ",";
        out += std::to_string(n->value);
    }
    return out;                             // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'Three local variables carry the whole algorithm: `prev` is the already-reversed chain (`null` on entry, which is why it doubles as the new tail), `curr` is the node in hand, and the node list is built by prepending. Nothing is copied and nothing is allocated inside the loop — the reversal is pure pointer surgery on objects that already exist, which is exactly why it costs O(1) space.',
    python:
      'Python has no pointer syntax, so `None` plays the part of `null` and `curr.next = prev` rebinds an attribute to *another object* rather than writing through an address. Same three variables, same algorithm. The list is built with `reversed(a)` plus a prepend because that is the idiomatic way to chain nodes without keeping a tail pointer around.',
    java: 'Java has no pointers either: `Node` is a class, `null` is the absent reference, and `curr.next = prev` overwrites a field inside an object that already exists. The declaration is where the lesson hides — `final int value` and a plain `Node next`, because a linked list must be rewirable in place while its payload must not be. Nothing is allocated in the loop, so the whole reversal is O(1) space.',
    cpp: 'Three raw pointers carry the whole algorithm, and here they really are addresses. `Node*` points into the heap, `nullptr` terminates the chain, and `curr->next = prev` writes eight bytes into an object that already exists. Compare with the other three languages, where the same line rebinds a reference to a shared object: the effect is identical, but in C++ the aliasing is real — any other pointer to that node sees the rewired value immediately, and the compiler is free to assume you never made one.',
  },
  'save-next': {
    javascript:
      '`next` is captured *before* the overwrite, because `curr.next` is the only route to the rest of the list. Reverse that order and the tail becomes unreachable: the classic way to lose a linked list in five lines, and one that does not throw — it just quietly returns a shorter list.',
    python:
      '`nxt = curr.next` is a plain attribute read, so it costs what any variable read costs — but the *ordering* is still load-bearing. Once `curr.next` is repointed at `prev`, the unprocessed tail of the list is unreachable from `curr`, and Python will not complain: it will simply walk a shorter list and return the wrong answer.',
    java: 'Captured before the overwrite. The `Node.next` field is deliberately non-`final` for exactly this reason: a singly linked list has to be rewirable in place. Capture-after-overwrite is the single most common linked-list bug, and it is silent — no exception, just a truncated list.',
    cpp: '`Node* next = curr->next;` saves the address of the rest of the list before the field is overwritten. Overwrite first and the tail is unreachable, so the loop exits early and the function returns a silently shorter list. Nothing detects this at run time, which is why linked-list bugs are so much harder to find than array ones.',
  },
  flip: {
    javascript:
      'The one line that does the work. On the first iteration `prev` is `null`, so the old head becomes the new tail — and because `null` terminates a chain, the reversed prefix is instantly a complete, self-contained list. No sentinel node and no output list is needed, because the answer is the same nodes in a different order.',
    python:
      '`curr.next = prev` is the reversal. On the first pass `prev` is `None`, so the old head points at nothing and becomes the new tail. This is why no dummy head node is required anywhere in Python: `None` does the job a null terminator does in the other three languages, and the reversed prefix is a valid list the moment this line runs.',
    java: '`curr.next = prev` is the reversal itself. On the first pass `prev` is `null`, so the old head’s `next` field becomes `null` and the node is immediately a valid tail. Java needs no sentinel either, and unlike an array-based reversal this touches no indexes — the compiler will not warn you, the runtime will not check, and the mutability is entirely yours to get right.',
    cpp: '`curr->next = prev;` is the reversal. On the first pass `prev` is `nullptr`, so the old head becomes a proper tail. C++ is the language where the aliasing hazard bites: if any other pointer still points into the middle of the list, reading its `next` afterwards gives the rewired value, not the original one — which is precisely why self-referential structures are fiddly here and merely routine in the other three.',
  },
  advance: {
    javascript:
      'Both cursors step one node along the original chain, which is untouched from `curr` onwards. The pair `prev`/`curr` is the algorithm’s entire state: everything before `prev` is final and will never be visited again, everything from `curr` on is still in its original order. That single invariant is why no output list is ever built.',
    python:
      '`prev` and `curr` both step one node along the *original* chain, which still exists from `curr` onwards. Everything before `prev` is final; everything from `curr` on is untouched. Because the only write is to `curr`’s own `next` attribute, advancing is a single attribute read and never a search.',
    java: 'The two cursors advance together along the original chain. Since the reversal only ever writes `curr`’s own `next` field, the list from `curr` onwards is byte-for-byte what it was, so advancing costs one dereference. This is the whole reason the algorithm is O(n) time and O(1) space: the nodes are reused, never reallocated, and never copied.',
    cpp: 'Both cursors step one node along the original chain. This is where const-correctness lands: `curr` is a plain `Node*` and not a `const Node*`, because the flip line is going to mutate it — a `const Node*` here would not compile. Everything from `curr` onwards is untouched, so advancing is a single dereference and the total work is one pass over the nodes.',
  },
  done: {
    javascript:
      '`prev` is the new head. The walk that builds the string is a deliberately separate pass, so the algorithm proper stays allocation-free and the output only has to exist at the boundary. The comma-joined string is there because a real node graph cannot cross the JSON boundary the verification harness uses, and a string is the one return shape all four languages produce byte-identically.',
    python:
      '`prev` is the new head, and the loop that builds the string is a separate traversal rather than something folded into the reversal. Python would happily return a list of values, but joining with `","` keeps all four languages identical for the harness — and it is the only formatting detail the Java and C++ listings have to reproduce exactly.',
    java: '`prev` is the new head and the values are walked out into a `StringBuilder`. `StringBuilder` rather than `+=` on a `String` because that would be quadratic in the number of nodes — a real cost, and a real habit worth forming. The result is a comma-joined string so the four listings stay byte-identical for the harness; a `List<Node>` could never be compared across languages.',
    cpp: '`prev` is the new head, and the nodes are deliberately leaked. A *cyclic* list cannot be freed with a naive `delete` loop, and doing it properly needs either an explicit unlink or smart pointers with a weak edge — out of scope for a reversal. `std::to_string` plus the comma join is the shared serialisation that makes all four outputs identical.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'reverseList',
    python: 'reverse_list',
    java: 'ReverseList.reverseList',
    cpp: 'reverse_list',
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

/** The claim: the values, reversed, as a comma-joined string. */
const expectations: Expectation[] = PRESETS.map((p) => {
  const values = valuesOf(p);
  return { presetId: p.id, args: [values], result: [...values].reverse().join(',') };
});

export const reverseListAlgo: AlgoDef<LinkedFrame> = {
  id: 'reverse-list',
  title: 'Reverse a Linked List',
  category: 'linked-lists',
  summary:
    'Walk the list with two cursors and repoint every `next` field backwards, so the nodes never move and nothing is copied.',
  intuition:
    'You would reach for this the first time you discover that a singly linked list cannot be reversed by swapping values, the way you would an array. Beyond the interview it is the template for every in-place linked-list mutation — removing the k-th node from the end, rotating a list, partitioning it — because all of them are the same move: save the next handle, repoint one field, advance. If you find yourself wanting random access on this structure, that is the signal to reach for an array or a skip list instead.',
  complexity: {
    best: 'O(1)',
    average: 'O(n)',
    worst: 'O(n)',
    space: 'O(1)',
    note: 'No node is allocated, moved or copied, so the space cost is three pointers regardless of length. Best case O(1) is the empty or single-node list, where the loop body never runs at all.',
  },
  traits: {
    stable: false,
    inPlace: true,
    online: false,
    allowsDuplicates: true,
    tags: ['pointer surgery', 'no allocation', 'iterative', 'O(1) space'],
  },
  viewport: 'linked',
  level: 'intro',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: reverseList,
  lesson,
  expectations,
  formatResult: (r) => `[${String(r)}]`,
  anchors: ['start', 'save-next', 'flip', 'advance', 'done'],
};

export default reverseListAlgo;

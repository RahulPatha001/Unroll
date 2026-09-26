import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import type { LinkedFrame, LinkedNode, NodeId } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * Merge two already-sorted singly linked lists into one sorted list.
 *
 * The trick — and the reason this is worth learning rather than just calling a
 * library — is that the inputs are already ordered, so there is nothing to
 * compare except *the front of each list*. The smallest remaining value in the
 * union is always at the head of one of the two inputs. Take it, advance that
 * one cursor, repeat. No scanning, no backtracking, no auxiliary buffer: every
 * node is visited once.
 *
 * What the viewport has to show, and how:
 *
 *  - `nodes` is ordered **output-first**, then whatever is left of A, then
 *    whatever is left of B. `LinkedListView` takes `nodes[0]` as the head and
 *    appends unreachable nodes in array order, so this renders as one growing
 *    list beside two shrinking ones — which is exactly the state of a merge in
 *    progress. When the drain splices the surviving tail in, the picture
 *    collapses into a single chain, because it is now a single chain.
 *  - `relinked` names the node whose `next` field just changed. On an interleave
 *    frame that is the output's current tail. There is deliberately no sentinel
 *    head in the picture, so the very first append has *no arrow to relight* —
 *    the special case a sentinel head node exists to remove, and the listings
 *    below all take that option instead.
 *  - `pick-a` and `pick-b` are separate anchors for one structural move, so the
 *    tie rule is observable: on a tie the first list wins, and which anchor
 *    fires is the proof.
 *
 * ## Why the two lists are hardcoded per preset
 *
 * `AlgoInput` is a single tagged union with no shape for "two lists", and adding
 * one is a design change rather than a per-algorithm liberty. So each preset
 * carries both lists in a module-level table, selects them with a `pair` param,
 * and spells them out in the preset `blurb`.
 *
 * ## Why the return value is a string
 *
 * The listings could return the merged `int[]` / `List<Integer>` / `vector<int>`
 * and the harness would compare them structurally. But a merge of linked lists is
 * supposed to be judged on its *nodes*, and a node graph cannot cross the JSON
 * boundary at all. One comma-joined string (`"1,2,3,4"`) is the smallest shape
 * that is identical in all four languages, removes every int/Integer/long
 * coercion question, and still fails loudly if any listing merges in the wrong
 * order.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * Hardcoded on purpose — see the note above. Every preset is a different *shape*
 * of interleave, because for a merge the interesting variable is which list runs
 * out first and when the two fronts tie. No seed is involved anywhere.
 */
interface MergeCase {
  a: number[];
  b: number[];
}

const CASES: Record<string, MergeCase> = {
  'even-interleave': { a: [1, 3, 5, 7], b: [2, 4, 6, 8] },
  'first-drains': { a: [1, 2], b: [10, 20, 30] },
  ties: { a: [1, 4, 4, 9], b: [1, 1, 4, 10] },
  'one-empty': { a: [], b: [4, 5, 6] },
  'both-empty': { a: [], b: [] },
};

const PRESETS: Preset[] = [
  {
    id: 'even-interleave',
    label: 'Perfect interleave',
    blurb:
      'A: 1, 3, 5, 7. B: 2, 4, 6, 8. The lists are the same length and perfectly staggered, so the merge alternates all the way to the end and the drain never runs. This is the case where the algorithm looks like it is doing nothing clever.',
    input: { type: 'numbers', values: CASES['even-interleave']?.a ?? [] },
    params: { pair: 'even-interleave' },
  },
  {
    id: 'first-drains',
    label: 'A runs out first',
    blurb:
      'A: 1, 2. B: 10, 20, 30. Every element of A is below every element of B, so A is exhausted after two steps and the rest of B is *spliced* in with a single pointer write — no comparisons, no copies, no new nodes.',
    input: { type: 'numbers', values: CASES['first-drains']?.a ?? [] },
    params: { pair: 'first-drains' },
  },
  {
    id: 'ties',
    label: 'Values that tie',
    blurb:
      'A: 1, 4, 4, 9. B: 1, 1, 4, 10. The heads are equal four times. `<=` hands every tie to the first list, so A’s 1 and both of A’s 4s come out ahead of B’s equal values — which is precisely what makes the merge stable with respect to A ++ B.',
    input: { type: 'numbers', values: CASES.ties?.a ?? [] },
    params: { pair: 'ties' },
  },
  {
    id: 'one-empty',
    label: 'One list is empty',
    blurb:
      'A is empty, B is 4, 5, 6. There is no comparison to make and no node to copy: the answer is B. Watch the drain frame — it has no arrow to relight at all, because there is no output tail yet. That special case is exactly what the sentinel head node in the listings removes.',
    input: { type: 'numbers', values: CASES['one-empty']?.a ?? [] },
    params: { pair: 'one-empty' },
  },
  {
    id: 'both-empty',
    label: 'Both lists empty',
    blurb:
      'Nothing to merge. The output head stays null and the answer is the empty string — the degenerate case a good implementation must return rather than dereference a null head on.',
    input: { type: 'numbers', values: CASES['both-empty']?.a ?? [] },
    params: { pair: 'both-empty' },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

const caseOf = (p: Preset): MergeCase => CASES[p.id] ?? { a: [], b: [] };

export function* mergeTwoSorted(ctx: RunContext): Generator<LinkedFrame> {
  const { a: valuesA, b: valuesB } = CASES[String(ctx.params.pair ?? 'even-interleave')] ?? {
    a: [],
    b: [],
  };

  const aIds: NodeId[] = valuesA.map((_, i) => `a${i + 1}`);
  const bIds: NodeId[] = valuesB.map((_, i) => `b${i + 1}`);

  const storedValue = new Map<NodeId, number>();
  const nextOf = new Map<NodeId, NodeId | null>();
  aIds.forEach((id, i) => {
    storedValue.set(id, valuesA[i] as number);
    nextOf.set(id, aIds[i + 1] ?? null);
  });
  bIds.forEach((id, i) => {
    storedValue.set(id, valuesB[i] as number);
    nextOf.set(id, bIds[i + 1] ?? null);
  });

  /** The output chain, built from fresh nodes `m1, m2, …`. */
  const outIds: NodeId[] = [];
  /** The whole remaining chain, attached in one write once a list is empty. */
  let spliced: NodeId[] | null = null;

  let ai = 0;
  let bi = 0;
  let ops = 0;

  /**
   * Rebuild every node from scratch, output chain first.
   *
   * `LinkedListView` takes `nodes[0]` as the head and appends unreachable nodes
   * in array order, so `[...output, ...rest of A, ...rest of B]` renders as one
   * growing list beside two shrinking ones. After the drain, the spliced chain
   * joins the output section and there is nothing unreachable left, so the
   * picture collapses to a single chain — because it now is one.
   */
  const snapshot = (): LinkedNode[] => {
    const out: LinkedNode[] = [];
    for (let k = 0; k < outIds.length - 1; k++) {
      out.push({
        id: outIds[k] as NodeId,
        value: storedValue.get(outIds[k] as NodeId) as number,
        next: outIds[k + 1] ?? null,
      });
    }
    const last = outIds[outIds.length - 1];
    if (last !== undefined) {
      out.push({
        id: last,
        value: storedValue.get(last) as number,
        next: spliced !== null ? (spliced[0] ?? null) : null,
      });
    }
    const pending = spliced ?? [...aIds.slice(ai), ...bIds.slice(bi)];
    for (const id of pending) {
      out.push({ id, value: storedValue.get(id) as number, next: nextOf.get(id) ?? null });
    }
    return out;
  };

  const restA = (): NodeId[] => aIds.slice(ai);
  const restB = (): NodeId[] => bIds.slice(bi);

  const pointers = (): Record<string, NodeId> => {
    const out: Record<string, NodeId> = {};
    const x = aIds[ai];
    const y = bIds[bi];
    if (x !== undefined) out.a = x;
    if (y !== undefined) out.b = y;
    return out;
  };

  /** The arrow that just changed, or nothing at all when the output had no tail. */
  const relinked = (): NodeId[] => {
    const tail = outIds[outIds.length - 2];
    return tail === undefined ? [] : [tail];
  };

  const caption = (): string => `${outIds.length} of ${valuesA.length + valuesB.length} merged`;

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'start',
    caption: 'Two sorted lists',
    note:
      valuesA.length + valuesB.length === 0
        ? 'Both lists are empty, so the merged list is empty too. The output head stays null and there is nothing to compare or link.'
        : `Two chains, ${valuesA.length} and ${valuesB.length} nodes. Both are already sorted, so the smallest value still to come is always at the *head* of one of them — the merge is just "take the smaller head, repeatedly".`,
    nodes: snapshot(),
    doubly: false,
    pointers: pointers(),
    highlight: { unvisited: [...aIds, ...bIds] },
    vars: { i: ai, j: bi, out: outIds.length, ops },
  };

  // ---- interleave: while both lists still have a head ------------------------
  while (ai < aIds.length && bi < bIds.length) {
    if (ctx.shouldStop()) return;
    ops++;

    const x = aIds[ai] as NodeId;
    const y = bIds[bi] as NodeId;
    const xv = storedValue.get(x) as number;
    const yv = storedValue.get(y) as number;
    const fromA = xv <= yv;
    const taken = fromA ? x : y;

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'compare',
      caption: caption(),
      note: `Compare the two heads: a${ai + 1} holds ${xv}, b${bi + 1} holds ${yv}. ${xv === yv ? 'A tie, and the rule is `<=`, so the first list wins it.' : xv < yv ? `${xv} is smaller, so it goes next.` : `${yv} is smaller, so it goes next.`} Nothing is written yet — the output is still ${outIds.length} node${outIds.length === 1 ? '' : 's'} long.`,
      nodes: snapshot(),
      doubly: false,
      pointers: pointers(),
      highlight: { compare: [x, y], picked: [...outIds], unvisited: [...restA(), ...restB()] },
      ops,
      vars: { i: ai, j: bi, a: xv, b: yv, out: outIds.length, ops },
    };

    outIds.push(taken);
    if (fromA) ai++;
    else bi++;

    yield {
      kind: 'linked',
      index: 0,
      anchor: fromA ? 'pick-a' : 'pick-b',
      caption: caption(),
      note: fromA
        ? `Take a${ai} (${xv}) — ${xv === yv ? 'equal to' : 'below'} b${bi}'s ${yv}, and the rule is \`<=\`, so a tie belongs to the first list. A fresh output node takes that value and list A advances one node.`
        : `Take b${bi} (${yv}) — smaller than a${ai}'s ${xv}. A fresh output node takes that value and list B advances one node.`,
      nodes: snapshot(),
      doubly: false,
      pointers: pointers(),
      relinked: relinked(),
      highlight: { picked: [...outIds], unvisited: [...restA(), ...restB()] },
      ops,
      vars: { i: ai, j: bi, out: outIds.length, ops },
    };
  }

  // ---- drain: one list is empty, so the rest is spliced, not compared -------
  const pendingIds = ai < aIds.length ? restA() : restB();
  if (pendingIds.length > 0) {
    const fromA = ai < aIds.length;
    spliced = pendingIds;
    const values = pendingIds.map((id) => storedValue.get(id) as number);

    yield {
      kind: 'linked',
      index: 0,
      anchor: 'drain',
      caption: caption(),
      note:
        outIds.length === 0
          ? `List ${fromA ? 'A' : 'B'} was empty from the start, so there is nothing to compare and nothing to copy: the answer is simply the other list, ${values.join(', ')}. No arrow is relit because there is no output tail yet to relight — the one special case a sentinel head node exists to remove.`
          : `List ${fromA ? 'A' : 'B'} is exhausted, so there is nothing left to compare against. The remaining ${values.length} node${values.length === 1 ? '' : 's'} (${values.join(', ')}) are already in order, so their whole chain is *spliced* on with a single pointer write — no comparisons, no copies, no new nodes.`,
      nodes: snapshot(),
      doubly: false,
      pointers: pointers(),
      relinked: relinked(),
      highlight: { picked: [...outIds, ...pendingIds] },
      ops,
      vars: { i: ai, j: bi, out: outIds.length, ops },
    };
  }

  const merged = [
    ...outIds.map((id) => storedValue.get(id) as number),
    ...(spliced ?? []).map((id) => storedValue.get(id) as number),
  ];

  yield {
    kind: 'linked',
    index: 0,
    anchor: 'done',
    caption: `Merged ${merged.length}`,
    note:
      merged.length === 0
        ? 'Nothing was merged, so the output is null. That is the correct answer for two empty lists, and it is the case a version that dereferences both heads unconditionally gets wrong.'
        : `The merged chain is ${merged.join(', ')} — ${merged.length} node${merged.length === 1 ? '' : 's'} in ${ops} step${ops === 1 ? '' : 's'}. It is sorted because at every step the head taken was the smallest value left anywhere.`,
    nodes: snapshot(),
    doubly: false,
    highlight: { sorted: [...outIds, ...(spliced ?? [])] },
    result: 'merged',
    ops,
    vars: { out: merged.length, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 *
 * The editor cannot express "two lists", so the single field is list A; each
 * preset's blurb spells out both, and the `pair` param selects the table row.
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'List A',
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
 * All four build real nodes, interleave into fresh output nodes behind a
 * sentinel head, and then splice the surviving tail. All four return the values
 * as a comma-joined string, because a `Node` graph cannot cross the JSON
 * boundary and that string is the shape all four can produce identically.
 * ------------------------------------------------------------------ */

const JS = `class Node {
  constructor(value) { this.value = value; this.next = null; }
}

function chain(values) {
  const head = new Node(null);
  let tail = head;
  for (const v of values) {
    tail.next = new Node(v);
    tail = tail.next;
  }
  return head.next;
}

function mergeTwoSorted(a, b) {
  let p = chain(a);                               // the two sorted inputs
  let q = chain(b);
  const outHead = new Node(null);                 // @anchor start  sentinel: the merge never branches
  let tail = outHead;
  while (p !== null && q !== null) {
    const takeA = p.value <= q.value;             // @anchor compare
    const from = takeA ? p : q;
    if (takeA) p = p.next;                        // @anchor pick-a
    else q = q.next;                              // @anchor pick-b
    tail.next = new Node(from.value);
    tail = tail.next;
  }
  tail.next = p !== null ? p : q;                 // @anchor drain  splice the rest, uncopied
  const out = [];
  for (let n = outHead.next; n !== null; n = n.next) out.push(String(n.value));
  return out.join(',');                           // @anchor done
}`;

const PY = `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None


def chain(values):
    head = Node(None)
    tail = head
    for v in values:
        tail.next = Node(v)
        tail = tail.next
    return head.next


def merge_two_sorted(a, b):
    p = chain(a)                                  # the two sorted inputs
    q = chain(b)
    out_head = Node(None)                         # @anchor start  sentinel: the merge never branches
    tail = out_head
    while p is not None and q is not None:
        take_a = p.value <= q.value               # @anchor compare
        node = p if take_a else q
        if take_a:                                # @anchor pick-a
            p = p.next
        else:                                      # @anchor pick-b
            q = q.next
        tail.next = Node(node.value)
        tail = tail.next
    tail.next = p if p is not None else q         # @anchor drain  splice the rest, uncopied
    out = []
    node = out_head.next
    while node is not None:
        out.append(str(node.value))
        node = node.next
    return ",".join(out)                           # @anchor done
`;

const JAVA = `class MergeTwoSorted {
    static class Node {
        final Integer value;                       // Integer, not int: the sentinel needs null
        Node next;
        Node(Integer value) { this.value = value; }
    }

    static Node chain(int[] values) {
        Node head = new Node(null);
        Node tail = head;
        for (int v : values) {
            tail.next = new Node(v);
            tail = tail.next;
        }
        return head.next;
    }

    static String mergeTwoSorted(int[] a, int[] b) {
        Node p = chain(a);                         // the two sorted inputs
        Node q = chain(b);
        Node outHead = new Node(null);             // @anchor start  sentinel: the merge never branches
        Node tail = outHead;
        while (p != null && q != null) {
            boolean takeA = p.value <= q.value;    // @anchor compare
            Node from = takeA ? p : q;
            if (takeA) {                           // @anchor pick-a
                p = p.next;
            } else {                               // @anchor pick-b
                q = q.next;
            }
            tail.next = new Node(from.value);
            tail = tail.next;
        }
        tail.next = p != null ? p : q;             // @anchor drain  splice the rest, uncopied
        StringBuilder sb = new StringBuilder();
        for (Node n = outHead.next; n != null; n = n.next) {
            if (sb.length() > 0) sb.append(',');
            sb.append(n.value);
        }
        return sb.toString();                        // @anchor done
    }
}`;

const CPP = `#include <string>
#include <vector>

struct Node {
    int value;
    Node* next;
    explicit Node(int v) : value(v), next(nullptr) {}
};

Node* chain(const std::vector<int>& values) {
    Node head(0);                                 // stack sentinel, so no allocation
    Node* tail = &head;
    for (size_t i = 0; i < values.size(); i++) {
        tail->next = new Node(values[i]);
        tail = tail->next;
    }
    return head.next;
}

std::string merge_two_sorted(const std::vector<int>& a, const std::vector<int>& b) {
    Node* p = chain(a);                            // the two sorted inputs
    Node* q = chain(b);
    Node outHead(0);
    Node* tail = &outHead;                        // @anchor start  sentinel: the merge never branches
    while (p != nullptr && q != nullptr) {
        bool takeA = p->value <= q->value;         // @anchor compare
        Node* from = takeA ? p : q;
        if (takeA) {                               // @anchor pick-a
            p = p->next;
        } else {                                   // @anchor pick-b
            q = q->next;
        }
        tail->next = new Node(from->value);
        tail = tail->next;
    }
    tail->next = p != nullptr ? p : q;             // @anchor drain  splice the rest, uncopied
    std::string out;
    for (Node* n = outHead.next; n != nullptr; n = n->next) {
        if (!out.empty()) out += ",";
        out += std::to_string(n->value);
    }
    return out;                                    // @anchor done
}`;

const NOTES = {
  start: {
    javascript:
      'A sentinel head node for the output, allocated before the loop, is the trick that removes "is the output empty yet?" from the merge. Without it you need a special case for the first node, inside the hottest loop, to avoid one branch. Note the inputs are not copied: `chain` builds each list once and the merge walks the originals, so the input arrays are untouched and safe to share.',
    python:
      'The `None`-valued sentinel head is the same idea under a different name, and it exists so the loop body has exactly one shape. Note also what `chain` does *not* do: it never mutates its argument and the merge never adopts an input node, so both inputs are still intact afterwards. That is a deliberate difference from the tail splice at the end, which does share nodes — by then there is nothing left to decide, so sharing cannot corrupt anything.',
    java: 'The sentinel is why the payload is an `Integer` and not an `int`: Java has no way to put "absent" into a primitive field, and both a sentinel and a terminator need an absent value. That is the honest cost of node-based lists in Java — one boxing decision per node, and a `null` check the compiler cannot elide. On a hot path this is exactly why production merges use arrays or `ArrayDeque` instead.',
    cpp: 'The output sentinel is a stack `Node`, not a `Node*`, so `&outHead` can serve as the tail pointer without a heap allocation — the other three languages all pay one. The merged nodes are deliberately never freed, because the drain splices an input chain into the output, so no single chain owns all of them and any naive `delete` loop is a double-free waiting to happen.',
  },
  compare: {
    javascript:
      'The entire decision of a merge, and it fits on one line: take from the first list when `p.value <= q.value`. Because both lists are sorted, the minimum of their union is the minimum of the two heads — no other element can be smaller. That single invariant is why a merge is linear and why no further comparison is ever needed.',
    python:
      'The whole algorithm, and the reasoning is identical in all four languages: both inputs are sorted, so the smallest value still to come is at one of the two heads. `<=` on the *first* list is the tie rule — write `<` instead and the second list wins ties, which silently makes the merge unstable with respect to A ++ B, and no test that only checks the sorted output will ever notice.',
    java: 'Both inputs are sorted, so the smallest value still to come is at one of the two heads; that is the entire invariant. `<=` on the first list is the tie rule and it is what makes the merge stable: an element of A that ties with an element of B comes out first, so the output preserves the order of A ++ B. Flipping it to `<` is a one-character change that changes the output.',
    cpp: 'One comparison decides everything, because both inputs are sorted. The `<=` is not style: it is the stability guarantee. It is also where a signed/unsigned trap would hide — if `value` were ever a `size_t`, the comparison would silently promote the signed operand and the merge would misbehave for negative values without a single diagnostic.',
  },
  'pick-a': {
    javascript:
      'The first list wins this step, so only `p` advances. The invariant to carry away: after every step, the head of each list is the smallest value still unmerged *in that list*. The output node copies the value rather than adopting the node, so a merge never mutates its inputs.',
    python:
      'One cursor moves and the value is copied into a new node rather than the node being adopted. Adopting would be cheaper and would mutate the input list, and a merge that destroys its inputs is not a function anyone can reuse. The tail splice at the end is the one place nodes *are* shared, and by that point the ordering has already been decided so sharing is safe.',
    java: 'One reference advances and a new `Node` is allocated. This is the only language here where that is a garbage-collected `new` with a visible cost in allocation rate, which is the practical reason production merges of large lists are written against arrays: the interleave allocates `min(n, m)` nodes, and on a hot path that shows up as GC pauses rather than as a slow loop.',
    cpp: 'One pointer advances and one node is allocated with `new`. This is the expensive half of the merge, and it is exactly why the drain splices instead of copying: `std::merge` writes into a caller-supplied buffer with no allocation at all, whereas a node-based merge pays `min(n, m)` allocations before it starts. C++ makes that cost impossible to overlook, because nothing reclaims it.',
  },
  'pick-b': {
    javascript:
      'The second list wins this step, so `q` advances instead. Two separate anchors for one structural move is not redundancy — it is what makes the tie rule observable. On a tie, `pick-a` fires and never `pick-b`, so the output shows the first list’s copy of an equal value first, and the stability guarantee becomes something you can *see* rather than something you have to be told.',
    python:
      'The mirror of the other branch. Keeping them as distinct anchors is what makes the ordering rule readable in the animation: when the two heads are equal the `<=` sends it to the first list, so `pick-a` fires. Python reaches the same result in one expression (`p if take_a else q`) that JavaScript and C++ spell as a conditional, which is the only place in this listing the two styles diverge.',
    java: 'The mirror branch, taken because `p.value > q.value`. Java gives no hint about which branch ran — both are one line — so the animation is the only place the tie rule becomes visible, and that is an argument for keeping the two anchors distinct in the trace even though the source lines are nearly identical.',
    cpp: 'The mirror branch, and the pointer that *does not* advance is the one still holding the next candidate. That is the invariant: after every step, the head of each list is the smallest unmerged value in that list. Lose it and the output is not sorted, however many comparisons you performed.',
  },
  drain: {
    javascript:
      'One input is exhausted, so there is nothing left to compare — the surviving tail is already sorted and is attached with a single pointer assignment. This is why a merge needs no auxiliary buffer: the tail of one input *is* the tail of the answer, and reusing it means the merge only allocates the interleaved prefix. The frame where the output is still empty has no arrow to relight at all, which is the special case the sentinel head removes.',
    python:
      'The splice: `p if p is not None else q` attaches whichever cursor survived, and the nodes behind it are reused rather than rebuilt. So a merge with one short list allocates far fewer nodes than an even interleave — worst-case allocation is `min(len(a), len(b))`, not `len(a) + len(b)`. Worth knowing when a merge is on a hot path.',
    java: "One line, and it is the difference between an allocating merge and a free one. Once either cursor is null the answer's tail is the other cursor's chain, verbatim: nothing is copied and nothing is allocated on this frame at all, while every interleave frame allocated a node that is now garbage. That asymmetry is the whole space-complexity argument.",
    cpp: 'The splice, with no allocation and no copy — and the ownership consequence is the real lesson here. After this line the output chain shares its tail with one of the input vectors, so neither may be freed independently, and raw `Node*` records no owner at all. `std::list::splice` does the same splice safely in O(1); a hand-rolled node merge has to state the rule in a comment.',
  },
  done: {
    javascript:
      'The merged chain, walked once to build the return value. That final walk is not part of the algorithm — it exists because a `Node` graph cannot cross the JSON boundary the harness uses, and a comma-joined string is the shape all four languages produce identically. The merge itself is the loop above.',
    python:
      'One more traversal, purely for serialisation. Python would happily return a list of the values and all four listings could have agreed on a JSON array; the string removes every int-versus-Integer-versus-long question and leaves exactly one thing to check — the order of the values.',
    java: 'The values go into a `StringBuilder`, not a `List<Integer>` and not an `int[]`. The harness is the reason: a comma-joined string is one value the driver writes straight to JSON, whereas a boxed `Integer[]` goes through the reflective path and could differ from the other three listings for reasons that have nothing to do with the algorithm.',
    cpp: '`std::to_string` on each value, joined with commas, and the nodes are leaked. Both are consequences of the same constraint — this listing has to produce a value the verification driver can serialise, and it cannot manage the lifetime of a graph that splices two inputs into one output. Fine for a teaching listing; neither is fine in production code.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'mergeTwoSorted',
    python: 'merge_two_sorted',
    java: 'MergeTwoSorted.mergeTwoSorted',
    cpp: 'merge_two_sorted',
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

/** The claim: the merged values, ascending, as a comma-joined string. */
const mergedOf = (a: number[], b: number[]): string => [...a, ...b].sort((x, y) => x - y).join(',');

const expectations: Expectation[] = PRESETS.map((p) => {
  const { a, b } = caseOf(p);
  return { presetId: p.id, args: [a, b], result: mergedOf(a, b) };
});

export const mergeTwoSortedAlgo: AlgoDef<LinkedFrame> = {
  id: 'merge-two-sorted',
  title: 'Merge Two Sorted Lists',
  category: 'linked-lists',
  summary:
    'Repeatedly take the smaller of the two heads and link it on. Because both inputs are already sorted, that head is always the smallest value left anywhere.',
  intuition:
    'Reach for this when the two inputs are already ordered and re-sorting them would be wasteful — merging sorted runs is how k-way external sorts, LSM-tree compaction, log merging and multi-way stream merges all work. As a teaching algorithm it is the cheapest way to see that "sorted" is a *usable* property rather than just an outcome: one comparison per output node, and the tail of the answer is the tail of an input, so the merge barely allocates. In production prefer the library merge, which writes into a caller-supplied buffer and allocates nothing at all.',
  complexity: {
    best: 'O(n + m)',
    average: 'O(n + m)',
    worst: 'O(n + m)',
    space: 'O(min(n, m))',
    note: 'Linear in the total and the bound is tight: every node is visited exactly once, including the spliced tail. Space is O(min(n, m)) *new* nodes, not O(n + m), because the interleaved prefix is allocated and the rest of one input is reused. Stable, because `<=` hands ties to the first list.',
  },
  traits: {
    stable: true,
    inPlace: false,
    online: true,
    allowsDuplicates: true,
    tags: ['linear', 'two pointers', 'sorted input', 'allocates only the prefix'],
  },
  viewport: 'linked',
  level: 'intro',
  params: [],
  inputSpec,
  presets: PRESETS,
  run: mergeTwoSorted,
  lesson,
  expectations,
  formatResult: (r) => `[${String(r)}]`,
  anchors: ['start', 'compare', 'pick-a', 'pick-b', 'drain', 'done'],
};

export default mergeTwoSortedAlgo;

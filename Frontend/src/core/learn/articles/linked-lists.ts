import type { Article } from '../types.ts';

/**
 * Linked lists.
 *
 * The three algorithms in this category are here because they are the three that
 * teach pointer manipulation, and each one teaches a different lesson: an in-place
 * rewire, a constant-space cycle proof, and an interleave with an ownership
 * consequence at the end.
 */
export const POINTER_PROBLEMS: Article = {
  slug: 'pointer-problems',
  title: 'Pointer problems, and the three that teach the rest',
  dek: 'Reversing a list, detecting a cycle in constant space, and merging two lists — the bugs are all the same bug.',
  category: 'linked-lists',
  tags: ['pointers', 'aliasing', 'floyd', 'rewire', 'ownership'],
  readMinutes: 11,
  algoId: 'reverse-list',
  body: [
    {
      kind: 'p',
      text: 'Linked lists are taught as "arrays that are worse", and that framing makes them hard. An array is a contiguous block with free indexing; a linked list buys three things with that loss: insertion and deletion in `O(1)` once you hold a node, no reallocation, and the ability to be a *cyclic* structure rather than a range.',
    },
    {
      kind: 'p',
      text: 'The three algorithms here are the ones that exercise those three things, and — this is the useful part — **they fail in the same three ways**. Learn the failures here and the category is finished.',
    },

    { kind: 'h2', text: 'Reversing a list in three pointers' },
    {
      kind: 'p',
      text: 'The canonical version has no output list and allocates nothing. Three pointers, and each of the four lines is forced:',
    },
    {
      kind: 'code',
      lang: 'typescript',
      caption: 'The `save-next` line is the whole algorithm. Everything else is bookkeeping.',
      code: `let prev: Node | null = null;
let curr: Node | null = head;

while (curr !== null) {
  const next = curr.next;   // capture BEFORE the overwrite — this is the bug everyone hits
  curr.next = prev;         // the one line that does the work
  prev = curr;              // advance
  curr = next;
}
return prev;                // prev is the new head`,
    },
    {
      kind: 'stepper',
      algoId: 'reverse-list',
      caption:
        'Reversing a five-node list. The picture honestly shows the list in two pieces mid-run, and the amber arrow is the edge that was just rewired.',
      preset: 'typical',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'Order of operations, always',
      text: 'If you overwrite `curr.next` before saving it, the rest of the list is unreachable and you have leaked it. This is the same class of bug as freeing a node before reading its value, and it is the single most common way a linked-list implementation fails. The one-line habit: **read everything you will need, then write**.',
    },
    {
      kind: 'p',
      text: 'Two things about this implementation are deliberate and worth noticing. It needs no sentinel head node, because `prev` starts as `null` and the first iteration turns the old head into the new tail — the reversed prefix is a complete, valid list from the very first step. And it is **iterative**, not recursive: the recursive version is prettier and is `O(n)` stack, which is [a space cost you did not budget for](/learn/recursion-is-a-stack).',
    },
    {
      kind: 'p',
      text: 'The `palindrome` preset is the instructive one. The values look unchanged — `1 2 3 2 1` reversed is `1 2 3 2 1` — but every arrow moves. Position-based intuition does not transfer to pointer structures, and this is the preset that makes people notice.',
    },

    { kind: 'h2', text: 'Detecting a cycle in constant space' },
    {
      kind: 'p',
      text: "Floyd's tortoise-and-hare needs two pointers at different speeds and **no extra memory**. Slow moves one node per step, fast moves two, and if a list has a cycle the fast pointer will eventually lap the slow one and they will meet.",
    },
    {
      kind: 'p',
      text: 'The proof is short enough to be worth learning properly. Meeting proves there *is* a cycle, because two nodes can only coincide if they are both inside a ring. The reverse is the interesting half: if a cycle of length `λ` exists, then by the time slow has travelled `μ + λ` steps it is on the ring, and fast has travelled `2(μ + λ)`, which is also a whole number of laps — so they coincide.',
    },
    {
      kind: 'stepper',
      algoId: 'detect-cycle',
      caption:
        'A four-node tail feeding a three-node ring. The two cursors meet inside the ring — but that is not where the cycle *starts*, which is the second half of the algorithm.',
      preset: 'long-tail',
    },
    {
      kind: 'p',
      text: 'And there is a second half, because *detecting* a cycle and *locating its entry* are different problems. The classic solution: park one cursor at the collision point, put the other at the head, and walk both one step at a time. They meet **at the entry**. The arithmetic: the collision happened at `μ + λ·k` steps, so the cursor that started at the head needs exactly `μ` steps to reach the ring, and the parked one needs `λ·k − μ` more — the same ring position.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Zero iterations in the easy case',
      text: 'When the entire list is the ring, the collision point *is* the entry, so the second phase does nothing at all and the head is already correct. The trace says so explicitly, because a loop that runs zero times looks like a bug until you know what it means.',
    },
    {
      kind: 'p',
      text: 'Three details are easy to get wrong and worth naming. The walk condition tests whether the **fast** pointer can still take two steps, not one — otherwise `fast.next.next` reads off the end. The self-loop case has cycle length 1, and only a counter rather than a boolean distinguishes "no cycle" from "a node pointing at itself". And this returns the **length**, not a yes/no, which is a hint that the interesting question was never the yes/no.',
    },

    { kind: 'h2', text: 'Merging two sorted lists' },
    {
      kind: 'p',
      text: 'The third one is a straight loop with a hidden decision: compare the two fronts, take the smaller, advance that side. The comparison is `<=`, not `<`, and that one character is the entire difference between a stable merge and one that is not.',
    },
    {
      kind: 'stepper',
      algoId: 'merge-two-sorted',
      caption:
        'Two sorted lists merging into one. Watch the tie rule: on an equal pair the first list wins, and which of the two anchors fires is the proof.',
      preset: 'ties',
    },
    {
      kind: 'p',
      text: "There is a payoff most implementations miss. The loop only runs while **both** lists have elements; when one drains, the other's remaining chain is spliced in wholesale — one pointer write, no comparisons, no copying. So a merge of two equal lists allocates almost nothing.",
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The splice is an ownership transfer, and that is not free',
      text: "After the splice the surviving nodes belong to the output, so neither input list can be freed independently. If the two lists came from different allocators, that is a bug; in C the honest options are to allocate copies or to hand ownership over explicitly, and this app's listings deliberately **leak** rather than pretend otherwise. Splicing is cheap. Knowing who owns the result is not.",
    },
    {
      kind: 'p',
      text: "The stability point is worth making properly, because it is what [the sorting landscape](/learn/sorting-landscape) calls the difference between a merge sort and a heap sort: **if the equal elements come from the same list, they come out in that list's original order**, so merging is stable, and stability is what lets you sort by one field while other fields carry meaning.",
    },

    { kind: 'h2', text: 'The three ways these go wrong' },
    {
      kind: 'table',
      head: ['Failure', 'What it looks like', 'Where it comes from'],
      rows: [
        [
          'Losing the tail',
          'half the list disappears',
          'writing a pointer before reading what it pointed at',
        ],
        [
          'One node in two lists',
          'a corrupted structure far from the edit; double-free',
          'splicing without deciding who owns the result',
        ],
        [
          'Aliased reads',
          'a value changes without anyone writing it',
          'two names for one node, so a mutation through one is seen by the other',
        ],
        [
          'Off-by-one on the walk',
          'reading past the end, or an infinite loop',
          'testing `fast !== null` where you needed `fast.next !== null`',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The third row is the one that generalises beyond this category. Aliasing — two names for one object — is not a linked-list problem, it is a *reference* problem, and it is why a value-semantics language removes an entire class of these bugs while adding a different one. Every one of these three algorithms is `O(n)` time and `O(1)` extra space, which is the best a pointer algorithm can do, and none of them is harder than the bookkeeping it requires.',
    },
    {
      kind: 'p',
      text: 'The same stack reasoning that makes [recursion expensive in space](/learn/recursion-is-a-stack) is what makes these algorithms worth learning: the machine was already doing this bookkeeping for you, invisibly, and these are the cases where you have to do it yourself.',
    },
  ],
};

import type { Article } from '../types.ts';

/**
 * Trees.
 *
 * One article, because the six algorithms in this family are one argument: a search
 * tree is only worth anything if its height is small, and every one of them exists to
 * establish, preserve or repair that fact.
 */
export const BINARY_SEARCH_TREES: Article = {
  slug: 'binary-search-trees',
  title: 'The BST is a sorted array with a bad worst case',
  dek: 'Insert your keys in order and you have not built a tree. What balancing fixes, and what it does not.',
  category: 'trees',
  tags: ['bst', 'rotations', 'self-balancing', 'invariant', 'degenerate'],
  readMinutes: 12,
  algoId: 'bst-insert',
  body: [
    {
      kind: 'p',
      text: 'A binary search tree holds one rule: **for every node, everything in its left subtree is smaller and everything in its right subtree is larger.** That is the entire specification. Every property people like about BSTs — sorted in-order traversal, `O(log n)` search, no duplicates without trying — is a consequence of that one sentence.',
    },
    {
      kind: 'p',
      text: 'The rule does not say anything about the **shape**. Which is the whole problem, and the whole subject of this article.',
    },

    { kind: 'h2', text: 'What the rule buys you' },
    {
      kind: 'p',
      text: 'Compare a key against the root and one of three things is true: it is smaller, it is larger, or you have found it. In the first two cases **an entire subtree is eliminated**, not one element. That is exactly the argument [binary search](/learn/binary-search) makes, applied to pointers instead of indices, and it is why a search costs `O(height)` rather than `O(n)`.',
    },
    {
      kind: 'p',
      text: 'A miss costs precisely what a hit costs — the walk ends at an empty child slot and there is no "I looked everywhere" step, because the tree has already proved the absence at every level. In this app the narration puts it directly: the only way a BST search can fail is by reaching a gap.',
    },
    {
      kind: 'stepper',
      algoId: 'bst-search',
      caption:
        'BST search. Each comparison abandons a whole subtree, and the L-badge is the recursion depth — the thing that decides whether this is fast or hopeless.',
      preset: 'hit-middle',
    },
    {
      kind: 'p',
      text: 'The second thing the rule buys is free and slightly magical: **an in-order traversal of a BST is sorted**, and there is not a comparison anywhere in the traversal code that says so.',
    },
    {
      kind: 'stepper',
      algoId: 'inorder-traversal',
      caption:
        'In-order traversal of a BST. The output is sorted, and the reason is not a comparison — it is the order the frames come off the call stack.',
      preset: 'balanced',
    },
    {
      kind: 'p',
      text: 'Visit the left subtree, then the node, then the right. Because the left subtree is entirely smaller and the right entirely larger, and the same holds recursively, the output is in ascending order for any tree obeying the rule. Change the traversal to pre-order and you get a structure dump instead — useful, ordered by nothing.',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Which is why the traversal is not a sorting algorithm',
      text: 'You could put a BST\'s in-order traversal in front of a reader as "sorting". It is `O(n)` once the tree exists and `O(n²)` to build, which is worse than insertion sort, and it uses `O(n)` space for something an array does in place. The sorted traversal is a **consequence**, not a method.',
    },

    { kind: 'h2', text: 'The sorted-input trap' },
    {
      kind: 'p',
      text: 'Now insert six keys that arrive already sorted. Every key is larger than everything already in the tree, so every insert walks to the rightmost node and hangs the new one off its right pointer. The result is a straight line.',
    },
    {
      kind: 'stepper',
      algoId: 'bst-insert',
      caption:
        'Six ascending keys. Height 6 for 6 nodes — the tree is a linked list, and the narration calls it "a list wearing a tree costume".',
      preset: 'ascending',
    },
    {
      kind: 'p',
      text: "Height `n`. Every search is `O(n)`. Every insert is `O(n)`. Building the tree is `O(n²)` — 15 comparisons for six keys — which is **worse** than bubble sort on the same data, and it is not the implementation's fault. The insert code is identical in both runs; the worst case is entirely a property of arrival order, and nothing inside the insertion knows the difference.",
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The tell is one comparison',
      text: 'If the height equals the number of nodes, the tree is degenerate. It is worth checking in any code that builds trees from real data, because the failure is not a crash — it is a data structure that has quietly become a linked list while still being called a tree.',
    },
    {
      kind: 'p',
      text: 'The fix is not a better insert. It is a repair pass after the insert, which is a different kind of algorithm entirely.',
    },

    { kind: 'h2', text: 'What deletion actually does' },
    {
      kind: 'p',
      text: 'Delete is where the three-case analysis everyone memorises comes from, and the cases are forced by the rule rather than invented. A node has zero, one or two children, and the rule decides what may replace it in each case.',
    },
    {
      kind: 'ul',
      items: [
        '**No children.** Unlink it. Nothing moves, so the height provably cannot change — this is the one case with no argument attached.',
        "**One child.** Lift the child into the node's slot. Safe because it was the **only** key that could have been on either side of the parent, so nothing is misfiled and no ordering is disturbed.",
        '**Two children.** There is no way to just remove it — whichever subtree you lifted would end up on the wrong side of the parent. So you find the **in-order successor** (the smallest key in the right subtree), copy its value up, and delete the successor instead.',
      ],
    },
    {
      kind: 'stepper',
      algoId: 'bst-delete',
      caption:
        "Deleting the root from a three-level tree. The successor is found by following left pointers, its value is copied into the hole, and then deleting the successor turns out to be the easy case wearing the hard one's clothes.",
      preset: 'two-children',
    },
    {
      kind: 'p',
      text: 'And here is the pleasant part that makes it two branches rather than three: **the in-order successor has no left child by construction.** It was found by following left pointers until there were none. So deleting the successor is always the one-child case — which is why a careful implementation writes two cases, not three, and the comments here say so.',
    },
    {
      kind: 'callout',
      tone: 'warn',
      title: 'The value moves, not the node',
      text: 'In the two-children case the node stays exactly where it was — same parent, same children — holding a different key. So any index, iterator or node reference the caller was holding now refers to a **different key**. Code that caches `Node` handles across a delete has silently invalidated them, and the symptom shows up far from the cause.',
    },
    {
      kind: 'p',
      text: 'One more implementation note, because it is a genuine design decision rather than a detail: this app keeps deleted nodes in its parallel arrays and merely marks them unreachable, so the drawing loses them while the memory does not. Repeated insert/delete cycles grow the arrays monotonically. That is a cost of the representation, not of the algorithm, and it is the kind of thing that is fine for a visualiser and wrong for a database.',
    },

    { kind: 'h2', text: 'What a rotation is' },
    {
      kind: 'p',
      text: 'A rotation looks like it restructures a subtree, and it is much more boring than that: **it is six pointer writes and two height updates**, after which the in-order sequence of the subtree is unchanged. That invariance is the definition of a rotation — if an in-order traversal of the subtree comes out the same before and after, it was a rotation and not a different tree.',
    },
    {
      kind: 'p',
      text: 'AVL trees store one extra integer per node: the height of the subtree above it, with empty subtrees being height 0 and a leaf being height 1. That one extra int is the entire difference between a BST and a self-balancing one, because it makes the balancing question answerable in `O(1)` at every node.',
    },
    {
      kind: 'p',
      text: 'After an insert, walk back up the path you came down and check the **balance factor** — left height minus right height — at each node. An AVL tree allows a difference of 1. A difference of 2 means a rotation is needed, and **which** rotation depends on two things, not one:',
    },
    {
      kind: 'ul',
      items: [
        'The **sign** of the imbalance: heavy on the left means rotate right, and vice versa.',
        'Which side the **new key arrived on**: if it went left and then right, a single rotation cannot fix it, and you need a double.',
      ],
    },
    {
      kind: 'stepper',
      algoId: 'avl-rotate',
      caption:
        'The left-right case. A single rotation cannot fix a lean that bent one way and then the other; rotate the child first, into a temporarily illegal tree, and then the parent.',
      preset: 'double-left-right',
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'A double rotation is two rotations, and the intermediate state is invalid',
      text: 'Height alone cannot pick the rotation, which is why the fix-up also has to know where the new key came from. The frame you see between the two rotations is a tree that is **not** a valid AVL tree — and that is fine, because it is a step of the algorithm rather than a state anyone ever stores.',
    },
    {
      kind: 'p',
      text: "Two details in the repair are worth naming because they are the ones people get wrong. The heights are recomputed **parent-first, then the promoted node**, because the promoted node's new height is measured over children that include the one you just recomputed. And the bookkeeping that says which side of its parent a node hangs on has to be rewritten too — forget it and the **numbers** stay right while the drawing loses half the tree, which is a genuinely unnerving bug to chase.",
    },

    { kind: 'h2', text: 'What balancing actually buys' },
    {
      kind: 'p',
      text: 'The same six sorted keys, inserted into an AVL tree. The insert code is the same BST descent; there is one repair pass afterwards.',
    },
    {
      kind: 'stepper',
      algoId: 'avl-rotate',
      caption:
        'Six ascending keys into an AVL tree: three rotations, and height 3 where the plain BST reached 6. Same data, same comparisons, half the depth.',
      preset: 'ascending',
    },
    {
      kind: 'p',
      text: "That is the whole value proposition, and it generalises to a hard guarantee: an AVL tree's height is bounded by about `1.44 · log₂(n+2)`, so a million nodes are at most **21 levels deep**. Every search, insert and delete is `O(log n)` on **every** input, with no randomness and no assumptions about arrival order.",
    },
    {
      kind: 'table',
      head: ['', 'Array, sorted', 'Plain BST', 'AVL tree', 'Hash table'],
      rows: [
        ['Search by key', '`O(log n)`', '`O(log n)` avg', '`O(log n)` guaranteed', '`O(1)` avg'],
        ['Insert', '`O(n)`', '`O(log n)` avg', '`O(log n)`', '`O(1)` amortised'],
        ['Delete by key', '`O(n)`', '`O(log n)` avg', '`O(log n)`', '`O(1)` amortised'],
        ['Sorted iteration', 'free', 'in-order, `O(n)`', 'in-order, `O(n)`', 'not possible'],
        ['Range query', 'free', '`O(log n + k)`', '`O(log n + k)`', '`O(n)`'],
        ['Worst case', 'good', '`O(n)` — a list', '`O(log n)`', '`O(n)`'],
        [
          'Space',
          '`O(n)`, no pointers',
          '`O(n)` + pointers',
          '`O(n)` + height field',
          '`O(n + capacity)`',
        ],
      ],
    },
    {
      kind: 'p',
      text: 'The row worth pausing on is **range query**. A BST can answer "everything between 40 and 60" in `O(log n + k)` — find the boundary, then walk — which is the operation databases are built around. A hash table cannot do it at all without scanning every key, because keys come out in hash order, which is arbitrary. That is the moment order stops being a nicety and becomes the requirement, and it is the same trade-off as [hash tables](/learn/hash-tables) making.',
    },

    { kind: 'h2', text: 'Measuring, then repairing' },
    {
      kind: 'p',
      text: "Before you can balance a tree you have to be able to measure it, and measurement is a traversal with a specific property: **a node's height depends on its children's heights, so it can only be computed after they have been**. That is post-order, and it is why this is the traversal AVL itself uses.",
    },
    {
      kind: 'stepper',
      algoId: 'tree-height',
      caption:
        'Post-order height. The hN label appears only once a node has actually been measured — a height printed before it is known is a lie.',
      preset: 'ascending',
    },
    {
      kind: 'p',
      text: "Two things fall out of that run which are worth internalising. The call count is `2n + 1` **whatever the shape** — a six-node spine and a six-node balanced tree both cost 13 calls, because height is `O(n)` time with no interesting best case. And the traversal can flag imbalance as it goes: a difference of more than 1 between a node's two subtree heights is the single test an AVL tree exists to keep from ever firing.",
    },
    {
      kind: 'callout',
      tone: 'note',
      title: 'Measurement and repair are separate jobs',
      text: 'The height traversal reports **which** nodes are out of balance and never fixes them — the rotation that would fix one happens at exactly that node, and doing it inline would turn a `O(n)` measurement into something that mutates the tree you are walking. This is the cleanest example in the app of "find the problem first, fix it second".',
    },

    { kind: 'h2', text: 'Choosing' },
    {
      kind: 'ul',
      items: [
        '**You need sorted iteration or range queries:** a balanced tree, and there is no real choice between the self-balancing variants for almost anyone.',
        '**You have keys that arrive in order, or worst-case latency matters:** AVL or red-black. Never a plain BST on input you did not choose.',
        '**You only need lookup by key, and order is irrelevant:** a hash table. It is faster and it will not tell you the answer in order.',
        '**You know the keys up front and never change them:** sort an array. It is faster, smaller, and has better cache behaviour than any tree.',
        '**Prefix search over strings:** neither — that is a [trie](/learn/strings-as-keys).',
      ],
    },
    {
      kind: 'p',
      text: 'And the argument running through all of it — discard half the possibilities at every step, measure what you are about to trust, and never let the shape depend on the order the data happened to arrive in — is the same one that runs through [binary search](/learn/binary-search), [Dijkstra](/learn/shortest-paths) and [Kruskal](/learn/minimum-spanning-trees). The data structure changes. The discipline does not.',
    },
  ],
};

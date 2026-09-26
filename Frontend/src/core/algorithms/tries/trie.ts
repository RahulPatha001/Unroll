import { byLanguage } from '../../code/anchors.ts';
import type { AlgoInput } from '../../input/types.ts';
import { isWords } from '../../input/types.ts';
import type { NodeId, TrieFrame, TrieNode } from '../../trace/types.ts';
import type { AlgoDef, Expectation, Preset, RunContext } from '../types.ts';

/**
 * A trie: insert a set of words, then answer a prefix query.
 *
 * The idea is that a trie stores *prefixes*, not words. Every node is a prefix,
 * every edge is one character, and a node is flagged when some inserted word
 * happens to end there. So a prefix query is not a search at all — it is a walk
 * down a path you already drew, and it either arrives or it does not.
 *
 * `depth` is the character index from the root, and it is load-bearing for the
 * layout: `TrieView` places each node at `MARGIN + depth * GAP_X`, so the trie
 * reads left to right as the characters of a word. That is the whole reason this
 * viewport is a left-to-right tree rather than a top-down one — a top-down tree
 * would make the word read vertically and hide the one property that separates a
 * trie from any other tree.
 *
 * `path` is the root → current chain, which the renderer draws as a highlighted
 * spine, and `probe` / `probeIndex` are the word or prefix being walked plus the
 * cursor on it. Together they make the walk visible character by character; the
 * `isWord` flag on a node is what distinguishes "this node ends a word" from
 * "this node merely exists", and the green dot is the whole difference between a
 * trie and a plain prefix tree.
 */

/* ------------------------------------------------------------------ *
 * 1. Presets
 * ------------------------------------------------------------------ */

/**
 * The words are the variable that matters — a trie is a statement about shared
 * prefixes, so every preset uses a different set of prefixes — and the query is a
 * param, so the *same* set can be asked about in two different ways. That pairing
 * is deliberate: "no match" is a property of the query, not of the data, and using
 * the same data makes that obvious.
 */
const PRESETS: Preset[] = [
  {
    id: 'empty-prefix',
    label: 'Empty prefix',
    blurb:
      'cat, car, cart, dog inserted, and the query is the empty string. The walk never leaves the root, so the whole run is the *build* — which is the point: the four shapes this set produces (the ca- fork, the rt- branch, and the lone dog) are exactly what the next two presets search inside.',
    input: { type: 'words', values: ['cat', 'car', 'cart', 'dog'] },
    params: { prefix: '' },
  },
  {
    id: 'prefix-hit',
    label: 'A prefix with four words under it',
    blurb:
      'trie, tree, track, train, band with the query "tr". The walk descends t then r and arrives; four words are below the node, and two of them (track, train) diverge immediately afterwards. A trie answers this in three character comparisons regardless of how many words it holds.',
    input: { type: 'words', values: ['trie', 'tree', 'track', 'train', 'band'] },
    params: { prefix: 'tr' },
  },
  {
    id: 'no-match',
    label: 'A prefix that is not there',
    blurb:
      'The same five words, queried with "zz". The walk descends t, asks for z, and the child simply does not exist. There is no fallback and no scan: the miss is a missing edge, and that is the entire failure mode of a prefix query.',
    input: { type: 'words', values: ['trie', 'tree', 'track', 'train', 'band'] },
    params: { prefix: 'zz' },
  },
  {
    id: 'prefix-is-a-word',
    label: 'The prefix is itself a word',
    blurb:
      'car, card, cardinal, cargo, bar with the query "car". The node the walk arrives at is flagged as a word end *and* has children — the case a plain "list of strings with a `startsWith`" gets right by accident and a hand-rolled trie gets wrong by forgetting the flag.',
    input: { type: 'words', values: ['car', 'card', 'cardinal', 'cargo', 'bar'] },
    params: { prefix: 'car' },
  },
];

/* ------------------------------------------------------------------ *
 * 2. The generator
 * ------------------------------------------------------------------ */

/** The claim: every stored word starting with the prefix, sorted, comma-joined. */
export function prefixWords(words: string[], prefix: string): string {
  interface TNode {
    word: boolean;
    kids: Map<string, TNode>;
  }
  const make = (): TNode => ({ word: false, kids: new Map() });
  const root = make();
  for (const w of words) {
    let node = root;
    for (const ch of w) {
      if (!node.kids.has(ch)) node.kids.set(ch, make());
      node = node.kids.get(ch) as TNode;
    }
    node.word = true;
  }
  let node = root;
  for (const ch of prefix) {
    const next = node.kids.get(ch);
    if (next === undefined) return '';
    node = next;
  }
  const out: string[] = [];
  const walk = (n: TNode, acc: string): void => {
    if (n.word) out.push(acc);
    for (const ch of [...n.kids.keys()].sort()) walk(n.kids.get(ch) as TNode, acc + ch);
  };
  walk(node, prefix);
  return out.sort().join(',');
}

export function* trie(ctx: RunContext): Generator<TrieFrame> {
  const input = ctx.input as { type: 'words'; values: string[] };
  const source = isWords(ctx.input) ? ctx.input.values : input.values;
  const words = [...source];
  const prefix = String(ctx.params.prefix ?? '');

  const ROOT: NodeId = 'root';
  let counter = 0;
  const nodes: Record<NodeId, TrieNode> = {
    [ROOT]: { id: ROOT, char: '', children: [], parent: null, isWord: false, depth: 0 },
  };
  let ops = 0;

  /** Rebuild the node table from scratch, every frame. */
  const snapshot = (): Record<NodeId, TrieNode> => {
    const out: Record<NodeId, TrieNode> = {};
    for (const [id, n] of Object.entries(nodes)) out[id] = { ...n, children: [...n.children] };
    return out;
  };

  const pathIds = (path: NodeId[]): NodeId[] => [...path];
  const allIds = (): NodeId[] => Object.keys(nodes);
  const childOf = (id: NodeId, ch: string): NodeId | undefined =>
    (nodes[id] as TrieNode).children.find((c) => (nodes[c] as TrieNode).char === ch);

  /* ---- build --------------------------------------------------------- */
  for (let w = 0; w < words.length; w++) {
    if (ctx.shouldStop()) return;
    const word = words[w] as string;
    const path: NodeId[] = [ROOT];

    yield {
      kind: 'trie',
      index: 0,
      anchor: 'insert',
      caption: `Insert "${word}"`,
      note:
        word.length === 0
          ? 'An empty word would flag the root itself, which the viewport cannot draw. Real tries either forbid it or treat the root as a word end; here it is a no-op.'
          : `Insert "${word}". The walk starts at the root and asks, one character at a time, whether an edge for this character already leaves the current node. ${w === 0 ? 'The trie is empty, so every character creates a new node.' : 'Existing edges are reused — that sharing of prefixes is the entire point.'}`,
      nodes: snapshot(),
      root: ROOT,
      path: pathIds(path),
      probe: word,
      probeIndex: 0,
      highlight: {},
      vars: { word, char: 0, ops },
    };

    for (let d = 0; d < word.length; d++) {
      ops++;
      const ch = word[d] as string;
      const here = path[path.length - 1] as NodeId;
      const existing = childOf(here, ch);

      if (existing !== undefined) {
        path.push(existing);
        yield {
          kind: 'trie',
          index: 0,
          anchor: 'descend',
          caption: `Insert "${word}"`,
          note: `Character ${d + 1} of "${word}" is '${ch}', and node ${(nodes[here] as TrieNode).char === '' ? 'the root' : `'${(nodes[here] as TrieNode).char}'`} already has a '${ch}' child. Take it: no new node, and the whole subtree below it is shared with whatever word created it. This is the O(1) per character that makes a trie a trie.`,
          nodes: snapshot(),
          root: ROOT,
          path: pathIds(path),
          probe: word,
          probeIndex: d + 1,
          highlight: { visited: pathIds(path) },
          ops,
          vars: { word, ch, char: d + 1, ops },
        };
        continue;
      }

      counter++;
      const id = `n${counter}`;
      nodes[id] = {
        id,
        char: ch,
        children: [],
        parent: here,
        isWord: false,
        depth: d + 1,
      };
      (nodes[here] as TrieNode).children.push(id);
      path.push(id);

      yield {
        kind: 'trie',
        index: 0,
        anchor: 'create',
        caption: `Insert "${word}"`,
        note: `No '${ch}' edge leaves this node, so one is created at depth ${d + 1}. Every node here is one shared prefix, and the number of nodes is bounded by the number of *distinct prefixes* — not by the sum of the word lengths, which is why a trie is smaller than its words for a large dictionary and larger for a small one.`,
        nodes: snapshot(),
        root: ROOT,
        path: pathIds(path),
        probe: word,
        probeIndex: d + 1,
        highlight: { picked: [id], visited: pathIds(path).slice(0, -1) },
        ops,
        vars: { word, ch, depth: d + 1, ops },
      };
    }

    const leaf = path[path.length - 1] as NodeId;
    const wasWord = (nodes[leaf] as TrieNode).isWord;
    (nodes[leaf] as TrieNode).isWord = true;

    yield {
      kind: 'trie',
      index: 0,
      anchor: 'mark',
      caption: `Insert "${word}"`,
      note: wasWord
        ? `"${word}" was already here, so the flag is set again and nothing changes. Inserting the same word twice is idempotent in a trie, which is a genuine advantage over a sorted list — and over some hash maps, where it is a wasted allocation.`
        : `End of "${word}": flag this node as a word end. That single bit is the difference between a trie and a plain prefix tree — it is what makes "${word}" a word while "${word}s" is only a path.`,
      nodes: snapshot(),
      root: ROOT,
      path: pathIds(path),
      probe: word,
      probeIndex: word.length,
      highlight: { answer: [leaf], visited: pathIds(path).slice(0, -1) },
      ops,
      vars: { word, depth: word.length, ops },
    };
  }

  /* ---- search --------------------------------------------------------- */
  const matches: string[] = [];
  let cursor: NodeId = ROOT;
  const searchPath: NodeId[] = [ROOT];
  let hitPrefix = true;

  yield {
    kind: 'trie',
    index: 0,
    anchor: 'search',
    caption: prefix === '' ? 'Query: the empty prefix' : `Query: "${prefix}"`,
    note:
      prefix.length === 0
        ? 'The empty prefix is a legal query and matches everything: the walk is already at the right node before it starts. The whole trie is below it, which is the degenerate case worth checking — a query of length 0 must not be treated as a miss.'
        : `Query "${prefix}". This is not a search in any interesting sense — it is a walk down edges that were already drawn during the build, one character at a time, with no comparisons and no backtracking.`,
    nodes: snapshot(),
    root: ROOT,
    path: pathIds(searchPath),
    probe: prefix,
    probeIndex: 0,
    highlight: {},
    vars: { prefix, char: 0, ops },
  };

  for (let d = 0; d < prefix.length; d++) {
    if (ctx.shouldStop()) return;
    ops++;
    const ch = prefix[d] as string;
    const next = childOf(cursor, ch);

    if (next === undefined) {
      hitPrefix = false;
      const options = (nodes[cursor] as TrieNode).children.map((c) => (nodes[c] as TrieNode).char);
      yield {
        kind: 'trie',
        index: 0,
        anchor: 'miss',
        caption: `Query: "${prefix}"`,
        note: `Character ${d + 1} of "${prefix}" is '${ch}', and this node has no such edge — its children are ${options.length === 0 ? 'none at all' : options.map((o) => `'${o}'`).join(', ')}. The query has fallen off the trie. There is no scan of the remaining words and no fallback: a missing edge *is* the answer, and that is what makes a prefix query O(prefix length) rather than O(dictionary size).`,
        nodes: snapshot(),
        root: ROOT,
        path: pathIds(searchPath),
        probe: prefix,
        probeIndex: d,
        highlight: { frontier: (nodes[cursor] as TrieNode).children, visited: pathIds(searchPath) },
        result: 'no-match',
        ops,
        vars: { prefix, ch, char: d + 1, ops },
      };
      break;
    }

    searchPath.push(next);
    cursor = next;
    yield {
      kind: 'trie',
      index: 0,
      anchor: 'descend',
      caption: `Query: "${prefix}"`,
      note: `Character ${d + 1} of "${prefix}" is '${ch}', and the edge exists. One child lookup — a hash-map lookup by character, or a 26-way array index, or a scan of a short sibling list — and the walk moves on.`,
      nodes: snapshot(),
      root: ROOT,
      path: pathIds(searchPath),
      probe: prefix,
      probeIndex: d + 1,
      highlight: { visited: pathIds(searchPath) },
      ops,
      vars: { prefix, ch, char: d + 1, ops },
    };
  }

  if (hitPrefix) {
    yield {
      kind: 'trie',
      index: 0,
      anchor: 'hit',
      caption: `Query: "${prefix}"`,
      note:
        prefix.length === 0
          ? 'Already at the root, which is the node the empty prefix names. Everything in the trie is below it.'
          : `The walk arrived at the node for "${prefix}" after ${prefix.length} character lookup${prefix.length === 1 ? '' : 's'}. ${(nodes[cursor] as TrieNode).isWord ? 'This node is itself a word end, so the query is both a prefix and a word.' : 'This node is not a word end, so the query is a prefix of something else and nothing is emitted here.'} Everything below it is the answer set.`,
      nodes: snapshot(),
      root: ROOT,
      path: pathIds(searchPath),
      probe: prefix,
      probeIndex: prefix.length,
      highlight: { answer: [cursor], visited: searchPath.slice(0, -1) },
      result: 'prefix-found',
      ops,
      vars: { prefix, depth: searchPath.length - 1, ops },
    };

    /* ---- collect: one depth-first sweep of the subtree ---------------- */
    function* sweep(id: NodeId, acc: string, pathSoFar: NodeId[]): Generator<TrieFrame> {
      if (ctx.shouldStop()) return;
      const node = nodes[id] as TrieNode;
      if (node.isWord) {
        matches.push(acc);
        const below = node.children.length;
        yield {
          kind: 'trie',
          index: 0,
          anchor: 'collect',
          caption: `Collect "${acc}"`,
          note: `"${acc}" ends at a node flagged as a word, so it is emitted. ${below === 0 ? 'It is a leaf — the sweep has nothing left to visit here.' : `${below} branch${below === 1 ? '' : 'es'} continue${below === 1 ? 's' : ''} below it, and the sweep will take them next, in character order.`}`,
          nodes: snapshot(),
          root: ROOT,
          path: pathIds(pathSoFar),
          probe: prefix,
          probeIndex: prefix.length,
          highlight: { answer: [id], visited: [...pathSoFar] },
          ops,
          vars: { found: acc, matches: matches.length, ops },
        };
      }
      // Children are swept in character order so the animation, and therefore the
      // result, does not depend on the insertion order the underlying map uses.
      const kids = [...node.children].sort((x, y) =>
        (nodes[x] as TrieNode).char.localeCompare((nodes[y] as TrieNode).char),
      );
      for (const c of kids) yield* sweep(c, acc + (nodes[c] as TrieNode).char, [...pathSoFar, c]);
    }

    yield* sweep(cursor, prefix, [...searchPath]);
  }

  const sorted = [...matches].sort();
  yield {
    kind: 'trie',
    index: 0,
    anchor: 'done',
    caption:
      sorted.length === 0 ? 'No words' : `${sorted.length} word${sorted.length === 1 ? '' : 's'}`,
    note: !hitPrefix
      ? `The prefix is not in the trie, so the answer is empty. ${ops} character step${ops === 1 ? '' : 's'} for a negative result, which is the cheapest possible failure.`
      : sorted.length === 0
        ? `The prefix exists but no word ends there — it is a path and not a word, which is why a trie has to record word ends separately from nodes. ${ops} step${ops === 1 ? '' : 's'}.`
        : `${sorted.join(', ')}. ${ops} step${ops === 1 ? '' : 's'} in total, and the result is sorted — the four implementations have to sort it, because Python's dict, Java's HashMap and C++'s map all iterate in a different order, and a result that depends on iteration order is a result three of the four would get wrong.`,
    nodes: snapshot(),
    root: ROOT,
    path: hitPrefix ? pathIds(searchPath) : [ROOT],
    probe: prefix,
    probeIndex: prefix.length,
    highlight: hitPrefix ? { answer: searchPath.slice(-1), sorted: allIds() } : {},
    result: sorted.length === 0 ? 'empty' : 'found',
    ops,
    vars: { prefix, matches: sorted.length, ops },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Input spec
 * ------------------------------------------------------------------ */

const inputSpec = {
  fields: [
    {
      key: 'values',
      label: 'Words to insert',
      kind: 'words' as const,
      default: PRESETS[0]?.input.type === 'words' ? PRESETS[0].input.values : [],
    },
  ],
  build: (values: Record<string, unknown>): AlgoInput => ({
    type: 'words',
    values: Array.isArray(values.values) ? (values.values as string[]) : [],
  }),
  sizeOf: (input: AlgoInput): number => (input.type === 'words' ? input.values.length : 0),
};

/* ------------------------------------------------------------------ *
 * 4. The lesson — four languages, one set of anchors
 *
 * The listings differ in how they store a node's children — `Map`, `dict`,
 * `HashMap`, `map` — and that difference has a consequence the return value
 * depends on: iteration order. All four therefore **sort** the words they collect,
 * and the notes spend a good deal of their length on why that is not optional.
 * ------------------------------------------------------------------ */

const JS = `function prefixWords(words, prefix) {
  const root = { isWord: false, kids: new Map() };
  for (const w of words) {
    let node = root;
    for (const ch of w) {                        // @anchor insert
      if (!node.kids.has(ch)) node.kids.set(ch, { isWord: false, kids: new Map() });  // @anchor create
      node = node.kids.get(ch);                  // @anchor descend
    }
    node.isWord = true;                           // @anchor mark
  }
  let node = root;
  for (const ch of prefix) {                      // @anchor search
    const next = node.kids.get(ch);
    if (next === undefined) return '';            // @anchor miss
    node = next;                                  // @anchor descend
  }
  // The walk arrived: everything below this node is the answer set.  // @anchor hit
  const out = [];
  const sweep = (n, acc) => {                    // @anchor collect
    if (n.isWord) out.push(acc);
    for (const ch of n.kids.keys()) sweep(n.kids.get(ch), acc + ch);
  };
  sweep(node, prefix);
  out.sort();
  return out.join(',');                           // @anchor done
}`;

const PY = `def prefix_words(words, prefix):
    root = {"is_word": False, "kids": {}}
    for w in words:
        node = root
        for ch in w:                              # @anchor insert
            if ch not in node["kids"]:
                node["kids"][ch] = {"is_word": False, "kids": {}}   # @anchor create
            node = node["kids"][ch]              # @anchor descend
        node["is_word"] = True                    # @anchor mark
    node = root
    for ch in prefix:                             # @anchor search
        if ch not in node["kids"]:
            return ""                             # @anchor miss
        node = node["kids"][ch]                   # @anchor descend
    # The walk arrived: everything below this node is the answer set.   # @anchor hit
    out = []
    def sweep(n, acc):                            # @anchor collect
        if n["is_word"]:
            out.append(acc)
        for ch, kid in n["kids"].items():
            sweep(kid, acc + ch)
    sweep(node, prefix)
    out.sort()                                    # dicts iterate in insertion order
    return ",".join(out)                          # @anchor done
`;

const JAVA = `import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

class Trie {
    static class Node {
        boolean isWord;
        final Map<Character, Node> kids = new HashMap<>();
    }

    static String prefixWords(String[] words, String prefix) {
        Node root = new Node();
        for (String w : words) {
            Node node = root;
            for (char ch : w.toCharArray()) {     // @anchor insert
                Node fresh = new Node();             // @anchor create
                node = node.kids.computeIfAbsent(ch, c -> fresh);      // @anchor descend
            }
            node.isWord = true;                   // @anchor mark
        }
        Node node = root;
        for (char ch : prefix.toCharArray()) {    // @anchor search
            node = node.kids.get(ch);
            if (node == null) return "";          // @anchor miss
        }
        // The walk arrived: everything below this node is the answer set. // @anchor hit
        List<String> out = new ArrayList<>();
        sweep(node, new StringBuilder(prefix), out);   // @anchor collect
        java.util.Collections.sort(out);
        return String.join(",", out);             // @anchor done
    }

    static void sweep(Node n, StringBuilder acc, List<String> out) {
        if (n.isWord) out.add(acc.toString());
        for (Map.Entry<Character, Node> e : n.kids.entrySet()) {
            acc.append(e.getKey());
            sweep(e.getValue(), acc, out);
            acc.setLength(acc.length() - 1);
        }
    }
}`;

const CPP = `#include <algorithm>
#include <map>
#include <string>
#include <vector>

struct Node {
    bool isWord = false;
    std::map<char, Node> kids;                    // ordered, so the sweep is deterministic
};

static void sweep(const Node& n, std::string acc, std::vector<std::string>& out) {
    if (n.isWord) out.push_back(acc);
    for (const auto& e : n.kids) sweep(e.second, acc + e.first, out);
}

std::string prefix_words(const std::vector<std::string>& words, const std::string& prefix) {
    Node root;
    for (size_t i = 0; i < words.size(); i++) {
        Node* node = &root;
        for (char ch : words[i]) {               // @anchor insert
            node = &node->kids[ch];               // @anchor create  operator[] inserts if absent
        }
        node->isWord = true;                      // @anchor mark
    }
    Node* node = &root;
    for (char ch : prefix) {                      // @anchor search
        auto it = node->kids.find(ch);
        if (it == node->kids.end()) return "";    // @anchor miss
        node = &it->second;                       // @anchor descend
    }
    // The walk arrived: everything below this node is the answer set. // @anchor hit
    std::vector<std::string> out;
    sweep(*node, prefix, out);                    // @anchor collect
    std::sort(out.begin(), out.end());
    std::string s;
    for (size_t i = 0; i < out.size(); i++) { if (i) s += ","; s += out[i]; }
    return s;                                    // @anchor done
}`;

const NOTES = {
  insert: {
    javascript:
      'A node is an object with a `Map` of children and one boolean. The inner loop is the whole insert: for each character, reuse the child if there is one and create it if there is not. No search, no comparison against other words, no sorting — a character lookup is the only operation, which is why inserting n words of average length L costs O(nL) and touches each existing node at most once.',
    python:
      'A dict of dicts, and the two `if` lines are the insert. Python is the one language here where a node is genuinely just a dict — no class, no fields — which makes the structure easy to write and equally easy to get wrong, because nothing stops you putting a string where a node belongs. The `ch not in node["kids"]` test is one hash lookup, and `node["kids"].setdefault(ch, ...)` would fuse the two lines at the cost of building the default object every time.',
    java: '`computeIfAbsent` fuses the find-or-create into one hash lookup — the idiomatic modern way to write this, and noticeably better than `get` followed by `put`, which hashes the key twice. The `Node` class is static and holds a `final Map`, so a node is immutable in shape; only `isWord` ever changes after construction.',
    cpp: '`node = &node->kids[ch];` — `std::map::operator[]` inserts a default-constructed child if the key is absent, so the find-or-create is one line and one lookup. The cost is that a node is stored **by value inside its parent**, so the whole trie is one deeply nested object rather than a set of separately allocated nodes; that keeps it allocation-light and makes any pointer into it fragile, since inserting into a `std::map` can move its nodes.',
  },
  descend: {
    javascript:
      "The character walk, and it appears twice in the listing — once during the build and once during the search — because it is literally the same operation. That is the trie's central claim: *looking something up is the same as building it*, which is why an autocomplete can be answered in time proportional to the query rather than to the dictionary.",
    python:
      '`node = node["kids"][ch]` after the membership test. Indexing rather than `.get` is safe here precisely because the line above created the child if it was missing; swapping the two lines and indexing directly is the same bug as C++\'s `operator[]` on a probe, just with a different symptom.',
    java: 'The same line in the search loop, where it is the entire query: `node.kids.get(ch)`, one hash lookup per character. Note the asymmetry with the build loop — there it is `computeIfAbsent`, here it is `get`, because a search must not create the node it fails to find. Confusing the two is how a lookup ends up silently growing the dictionary.',
    cpp: '`node = &it->second;` — a pointer *into* the map, valid as long as nothing is inserted. The search loop never inserts, so it is safe; the build loop above it takes a pointer with `operator[]` and immediately reassigns, so it never holds one across a mutation. That discipline — take a pointer, use it, or do not — is the whole lifetime story for a recursive structure in C++.',
  },
  create: {
    javascript:
      'Creating the missing child, which the listing writes as a nested object literal inside `set`. The count of nodes is the count of distinct prefixes, so a trie for a large dictionary is far smaller than the dictionary — but for a handful of long words with no shared prefixes it is *larger*, storing every character as a node to store one flag per word. That inversion is the practical limit of tries.',
    python:
      'The nested dict literal that creates a child. There is no `null` here at all: a child either exists in the dict or it does not, and "does not exist" is answered by `ch not in node["kids"]` rather than by a null check. Compare that with the linked-list modules, where absence *is* a null — the trie has no terminator because every node is real.',
    java: '`computeIfAbsent` with a lambda that allocates. The lambda is only invoked on a miss, which is what makes the idiom cheap: allocating a `Node` for a key that already has a child would be pure waste, and the JDK contract guarantees the mapping function is not called in that case.',
    cpp: 'The node is created by `operator[]` inside the map, default-constructed with `isWord = false` thanks to the in-class initialiser. C++17 is what allows that in-class default on a member of a recursive type; before C++17 you needed a constructor, and the recursive member could not be initialised in the member initialiser list at all — a small example of a language feature existing to make recursive data structures expressible.',
  },
  mark: {
    javascript:
      'One boolean on the node the walk ended at. This flag is what makes the structure a trie rather than a prefix tree, and it is the only thing that distinguishes "the word `car` exists" from "the word `car` is a path to `card`". Forgetting it is the classic hand-rolled-trie bug, and the failure is silent: queries still work, one of them just returns nothing.',
    python:
      '`node["is_word"] = True`. Because a dict node is not a type, nothing enforces the presence of this key — reading `node["is_word"]` on a node built by hand without it raises `KeyError`, and using `node.get("is_word")` would silently treat every node as a non-word. A small class with `__init__` makes the field mandatory; a dict makes it a convention.',
    java: 'A mutable `boolean` on the node. Java would call this a "flag object" and there is a decade of argument about whether it should be a field or should be inferred from a sentinel child; the flag wins because it is a single bit and the inference breaks on the empty string. The field is package-private and non-final, which is the one concession the class makes to mutability.',
    cpp: "`node->isWord = true;` through a pointer into the parent's map. The `= false` in-class initialiser is what makes this safe for a freshly created node; without it the flag would be indeterminate and a trie built by a slightly different insertion order would give different answers — the kind of bug that only reproduces sometimes.",
  },
  search: {
    javascript:
      'The query walk begins at the root, and it is *the same code* as the insert walk. That is the entire thesis of a trie: a prefix query is a build that stops early, so its cost is the length of the prefix and is completely independent of how many words are stored. A `HashMap` of words would be O(prefix length) too here, but only because the map holds the words — it could not answer "everything starting with car" without a full scan.',
    python:
      "One loop over the prefix's characters, one dict lookup each. Note there is no lowercasing, no normalisation and no Unicode handling anywhere: a trie over `str` is exact and case-sensitive, which is both its strength (no false positives, ever) and its weakness (two spellings of the same word are two entries).",
    java: 'The query loop, and the one line to notice is the null check: `node = node.kids.get(ch); if (node == null) return "";`. The assignment happens *before* the check, so the next iteration would dereference null if the check were missing — a shape worth preferring over the reverse, because the check is adjacent to the thing it validates.',
    cpp: '`find` and a comparison against `end()`, never a dereference of the result until it is known to be valid. The `const std::string& prefix` parameter means no copy of the query, which matters more than it looks: a trie search is a read-only operation and copying the query would allocate for no reason.',
  },
  miss: {
    javascript:
      'The child does not exist, so the query has fallen off the trie and the answer is empty. Returning `""` rather than `[]` keeps the return type stable across success and failure, which is the same reasoning as the two-sum module returning `[-1, -1]`.',
    python:
      'The early return, and the reason it is cheap: no edge means no scan. Compare with a sorted list and a `startsWith` binary search, which is O(log n) per query and O(n) over a whole dictionary, or a linear scan of every stored word. The failure mode of a trie is a single failed dict lookup.',
    java: 'The same early return, reached by a `null` child. Note that nothing is logged and nothing is thrown: a prefix that is not present is a perfectly ordinary answer, and a trie that raised on a miss would be unusable for exactly the case it is best at.',
    cpp: 'The miss, and the pointer stays pointing at the last good node rather than becoming null — `node` is only reassigned after the check passes. Keeping the invariant "node is always a valid node" is what lets the rest of the function be written without a single further null test, which is worth more than the single line it costs here.',
  },
  hit: {
    javascript:
      'A whole subtree matched, without ever touching a character comparison beyond the ones already made. This is the payoff of the trie: the answer to "which words start with `app`" is a *pointer to a region of the tree*, not a scan. The cost was paid one character at a time on the way down; everything below this node is free.',
    python:
      'A whole subtree matched, without ever touching a character comparison beyond the ones already made. This is the payoff of the trie: the answer to "which words start with `app`" is a *pointer to a region of the tree*, not a scan. The dictionary below this node is a set the walk built as it went, so collecting the words is a traversal of a subtree the search never had to filter.',
    java: 'A whole subtree matched, without ever touching a character comparison beyond the ones already made. This is the payoff of the trie: the answer to "which words start with `app`" is a *reference to a region of the tree*, not a scan. Note there is no `isTerminal` flag on the node itself — the word boundary is a separate boolean, which is what lets a prefix be a valid query without being a word.',
    cpp: 'A whole subtree matched, without ever touching a character comparison beyond the ones already made. This is the payoff of the trie: the answer to "which words start with `app`" is an *iterator range into the node list*, not a scan. Because children are stored contiguously in one vector, that subtree is a contiguous range — the collect step is a loop over a slice, not a search.',
  },
  collect: {
    javascript:
      'One depth-first sweep of everything under the query node, emitting a word at each node flagged as a word end. Note this is a **recursive** function in a language where functions are hoisted, so `sweep` can call itself before its declaration — a JavaScript-specific convenience the other three do not have, and the reason the C++ listing needs a forward declaration or a reorder.',
    python:
      'A closure, which is how Python gets recursion without a named function. It also has a cost the other three do not: a closure is a heap-allocated cell, and a recursive closure capturing `out` and itself allocates a frame per level. Fine for a trie, not fine in a hot parser loop — where a method with `self.out` would be faster and easier to profile.',
    java: 'A `StringBuilder` for the path, with `setLength` to pop a character off it. The tempting alternative, `acc + e.getKey()`, allocates a fresh string at every node — O(length) per node, so O(L²) for a path of L characters. The `setLength` undo is the standard trick, and it is the clearest example in this curriculum of a mutable buffer earning its keep.',
    cpp: 'Recursion with `const std::string& acc` plus one concatenation per level. That copy is the honest cost of this shape — `acc + e.first` builds a new string, so a deep path is O(L²) in copying. The fix is the same `StringBuilder` idea as Java, written with a `std::string&` that is pushed to and popped from, and the fact that it is not written here is a simplification rather than a best practice.',
  },
  done: {
    javascript:
      '`out.sort()` and then a comma join. The sort is **not** cosmetic: `Map` iterates in insertion order, JavaScript would hand back the words in the order the trie happened to be built, and the other three languages would hand back three different orders. Sorting is what makes the four outputs comparable — and it is also what an autocomplete box wants anyway.',
    python:
      '`out.sort()` after a sweep of a dict, which iterates in insertion order since 3.7. The sort is therefore doing real work, not making a guarantee that was already there: without it the result would depend on the order the words were inserted, which is a property of the *input* rather than of the algorithm.',
    java: '`Collections.sort(out)` on a `List<String>`, and note what had to be true for the rest of the function to be correct: `HashMap` has **no** iteration order at all — not insertion order, not sorted, and explicitly unspecified. A `LinkedHashMap` would have given insertion order and `TreeMap` sorted order, and either would have removed the need to sort — but relying on either is exactly the fragility this line exists to prevent.',
    cpp: 'A `std::sort` over a vector of strings, and here it is very nearly a no-op: `std::map` already iterates in sorted key order, so the sweep produced sorted output. That is the one language where the container makes the guarantee for you, and it is worth knowing that relying on it is what the other three are working around rather than something to be proud of.',
  },
};

const lesson = {
  code: { javascript: JS, python: PY, java: JAVA, cpp: CPP },
  notes: byLanguage(NOTES),
  entry: {
    javascript: 'prefixWords',
    python: 'prefix_words',
    java: 'Trie.prefixWords',
    cpp: 'prefix_words',
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

const wordsOf = (p: Preset): string[] => (p.input.type === 'words' ? p.input.values : []);
const prefixOf = (p: Preset): string => String(p.params?.prefix ?? '');

const expectations: Expectation[] = PRESETS.map((p) => {
  const words = wordsOf(p);
  const prefix = prefixOf(p);
  return { presetId: p.id, args: [words, prefix], result: prefixWords(words, prefix) };
});

export const trieAlgo: AlgoDef<TrieFrame> = {
  id: 'trie',
  title: 'Trie: Insert and Prefix Search',
  category: 'tries',
  summary:
    'Store every distinct prefix as a node, one edge per character, and flag the nodes where a word ends. A prefix query is then just a walk along edges you already drew.',
  intuition:
    'Reach for this when the questions are about *shared beginnings*: autocomplete, spell check, search-as-you-type over a large corpus, IP routing tables, radix-partitioned keys, a phone book by surname. The deciding factor is usually whether you need everything under a prefix — a `HashMap` of prefixes answers "is this exact prefix present" in O(1) and "what is under it" in O(n), and a trie inverts that trade. Do not reach for one to *save* memory: for a handful of long, unrelated words a trie stores every character as its own node and is larger than the words.',
  complexity: {
    best: 'O(1)',
    average: 'O(L)',
    worst: 'O(L)',
    space: 'O(total characters)',
    note: 'O(L) per query for a prefix of length L, *independent of the number of words stored* — that independence is the entire reason to use a trie. Insert is O(L) per word, and the total space is the number of distinct prefixes, which is at most the total characters and in practice far less. The empty-prefix query is O(1) to match and O(n) to enumerate, which is the one case where the "independent of size" claim needs a footnote.',
  },
  traits: {
    stable: true,
    inPlace: true,
    online: true,
    allowsDuplicates: true,
    tags: ['prefix sharing', 'O(prefix) query', 'no false positives', 'ordered sweep'],
  },
  viewport: 'trie',
  level: 'intermediate',
  params: [
    {
      key: 'prefix',
      label: 'Prefix to search for',
      kind: 'text',
      default: 'tr',
      help: 'Try a prefix that does not exist, or the empty string, which matches every word.',
    },
  ],
  inputSpec,
  presets: PRESETS,
  run: trie,
  lesson,
  expectations,
  formatResult: (r) => (String(r) === '' ? 'no words match' : String(r)),
  anchors: ['insert', 'descend', 'create', 'mark', 'search', 'miss', 'hit', 'collect', 'done'],
};

export default trieAlgo;

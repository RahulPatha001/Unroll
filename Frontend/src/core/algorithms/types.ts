import type { FormatResult, Lang, Lesson } from '../code/anchors.ts';
import type { AlgoInput, InputSpec } from '../input/types.ts';
import type { Frame } from '../trace/types.ts';

export type Category =
  | 'sorting'
  | 'searching'
  | 'two-pointers'
  | 'sliding-window'
  | 'greedy'
  | 'dynamic-programming'
  | 'linked-lists'
  | 'stacks-queues'
  | 'hashing'
  | 'trees'
  | 'heaps'
  | 'tries'
  | 'graphs'
  | 'recursion';

export const CATEGORIES: Array<{ id: Category; label: string; blurb: string }> = [
  { id: 'sorting', label: 'Sorting', blurb: 'Put things in order' },
  { id: 'searching', label: 'Searching', blurb: 'Find things fast' },
  { id: 'two-pointers', label: 'Two Pointers', blurb: 'Squeeze from both ends' },
  { id: 'sliding-window', label: 'Sliding Window', blurb: 'A window that slides' },
  { id: 'greedy', label: 'Greedy', blurb: 'Decide now, regret never' },
  { id: 'dynamic-programming', label: 'Dynamic Programming', blurb: 'Remember every sub-answer' },
  { id: 'linked-lists', label: 'Linked Lists', blurb: 'Nodes and arrows' },
  { id: 'stacks-queues', label: 'Stacks & Queues', blurb: 'Last in, first out' },
  { id: 'hashing', label: 'Hashing', blurb: 'Trade space for speed' },
  { id: 'trees', label: 'Trees', blurb: 'Recursion made visible' },
  { id: 'heaps', label: 'Heaps', blurb: 'Always grab the extreme' },
  { id: 'tries', label: 'Tries', blurb: 'Prefixes, stored' },
  { id: 'graphs', label: 'Graphs', blurb: 'Nodes, edges, traversal' },
  { id: 'recursion', label: 'Recursion', blurb: 'The call stack, drawn' },
];

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
) as Record<Category, string>;

export interface Complexity {
  best?: string;
  average: string;
  worst: string;
  space: string;
  /** The one non-obvious caveat. e.g. "stable", "in-place", "not stable". */
  note?: string;
}

/** Short tags shown as chips, e.g. ['in-place', 'stable', 'online']. */
export interface Traits {
  stable?: boolean;
  inPlace?: boolean;
  online?: boolean;
  /** Needs the whole input up front. Mutually exclusive with `online`. */
  offline?: boolean;
  /** Works with duplicate keys. */
  allowsDuplicates?: boolean;
  tags?: string[];
}

export interface ParamSpec {
  key: string;
  label: string;
  kind: 'number' | 'select' | 'text' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  /** For `kind: 'text'`, e.g. a comma-separated list. */
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default: number | string | boolean;
  /** Changing this regenerates the input (e.g. a new random array). */
  regeneratesInput?: boolean;
  help?: string;
}

export interface RunContext {
  params: Record<string, number | string | boolean>;
  /** Pre-generated, deterministic input. Never call Math.random() here. */
  input: AlgoInput;
  /** Cooperative cancellation, polled by the materialiser between frames. */
  shouldStop(): boolean;
}

export interface Preset {
  id: string;
  label: string;
  /** Why this input is interesting. Shown as a tooltip / caption. */
  blurb?: string;
  input: AlgoInput;
  params?: Record<string, number | string | boolean>;
}

/**
 * One machine-checkable claim: "given these arguments, every language
 * implementation must return exactly this."
 *
 * The harness (plan §5.4) writes `code[lang]` to a temp file, appends the shared
 * driver for that language, runs it, and diffs the output. So a Java snippet
 * that compiles but computes the wrong thing is a red build, not a bad lesson.
 */
export interface Expectation {
  /** Which preset this case comes from, for readable failure output. */
  presetId: string;
  /** JSON arguments handed to the implementation, positionally. */
  args: unknown[];
  /** The value every implementation must return, compared structurally. */
  result: unknown;
}

export interface AlgoDef<TFrame extends Frame = Frame> {
  id: string;
  title: string;
  category: Category;
  /** One line: what it does. */
  summary: string;
  /**
   * When would I reach for this? The question a student actually has.
   * Deliberately not a restatement of `summary`.
   */
  intuition: string;
  complexity: Complexity;
  traits: Traits;
  /** Which viewport renders this algorithm's frames. */
  viewport: TFrame['kind'];
  params: ParamSpec[];
  /** Pure and deterministic. One frame per meaningful state change. */
  run(ctx: RunContext): Generator<TFrame>;
  /** The code shown to students, in four languages, with per-anchor notes. */
  lesson: Lesson;
  /** Declared shape of `input`, so the input editor is generic. */
  inputSpec: InputSpec;
  /** One-click sample inputs. Every preset is also a parity-test case. */
  presets: Preset[];
  level: 'intro' | 'intermediate' | 'advanced';
  /**
   * One case per preset, in preset order. Every language implementation is run
   * against every case and must agree.
   *
   * Empty means "visual only, nothing machine-checkable", which is allowed only
   * for algorithms with no interesting return value. The contract test reports
   * which ones those are, so the list stays short and deliberate.
   */
  expectations: Expectation[];
  /** Renders the result in the UI. Shared by the app and the verifier output. */
  formatResult?: FormatResult;
  /** Anchor names this algorithm may emit, for documentation and tests. */
  anchors: string[];
}

/** The minimum a module must export for the lazy app loader to work. */
export type AlgoModule = { default: AlgoDef } | AlgoDef;

/** Narrow an AlgoDef to a specific frame type for type-safe viewport selection. */
export type AlgoOf<K extends Frame['kind']> = AlgoDef<Extract<Frame, { kind: K }>>;

export function defaultParams(algo: AlgoDef): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p of algo.params) out[p.key] = p.default;
  return out;
}

/** Languages this module is expected to ship, in tab order. */
export const LESSON_LANGS: Lang[] = ['javascript', 'python', 'java', 'cpp'];

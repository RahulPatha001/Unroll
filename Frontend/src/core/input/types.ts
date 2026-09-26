/**
 * The union of raw input shapes the curriculum needs.
 *
 * A tagged union rather than `any`, because the input editor, the URL encoder
 * and the verification harness all need to know what they are looking at — and
 * because an algorithm declaring its own input shape is what stops every new
 * algorithm from needing a new form control.
 */

export type AlgoInput =
  | { type: 'numbers'; values: number[] }
  | { type: 'chars'; values: string }
  | { type: 'words'; values: string[] }
  | { type: 'matrix'; rows: number[]; cols: number; values: number[] }
  | {
      type: 'graph';
      nodes: Array<{ id: string; label?: string; x: number; y: number }>;
      edges: Array<{ from: string; to: string; weight?: number; directed: boolean }>;
      directed: boolean;
      weighted: boolean;
    }
  | { type: 'keys'; values: Array<number | string> }
  | { type: 'tree'; values: Array<number | string> }
  | { type: 'grid'; rows: number; cols: number; values: Array<number | string | null> };

interface InputFieldBase {
  key: string;
  label: string;
  /**
   * Optional explanation, shown under the box by the custom-input editor.
   *
   * Declared on the base rather than repeated per variant because the editor
   * renders it for every kind, and because algorithms were *already* passing it —
   * `detect-cycle` explains its `cycleBack` field in one — while the type did not
   * declare it. So the property existed at runtime and was invisible to `tsc`,
   * which is the worst of both: it worked, and nothing checked it.
   */
  help?: string;
}

export type InputField =
  | (InputFieldBase & { kind: 'numbers'; default: number[] })
  | (InputFieldBase & { kind: 'number'; default: number; min?: number; max?: number })
  | (InputFieldBase & { kind: 'text'; default: string; maxLength?: number })
  | (InputFieldBase & { kind: 'words'; default: string[] })
  | (InputFieldBase & { kind: 'keys'; default: Array<number | string> })
  | (InputFieldBase & { kind: 'graph' });

/**
 * Declared shape of an algorithm's input. `build` turns the raw field values
 * into the `AlgoInput` the generator and the language implementations receive.
 */
export interface InputSpec {
  fields: InputField[];
  /** How the field values become the input object. */
  build(values: Record<string, unknown>): AlgoInput;
  /** Rough element count, used to warn about the DOM/canvas threshold. */
  sizeOf(input: AlgoInput): number;
}

/* ------------------------------------------------------------------ *
 * Constructors — used by presets and by the input editor
 * ------------------------------------------------------------------ */

export function numbers(values: number[]): AlgoInput {
  return { type: 'numbers', values };
}

export function chars(value: string): AlgoInput {
  return { type: 'chars', values: value };
}

export function words(values: string[]): AlgoInput {
  return { type: 'words', values };
}

export function matrix(rows: number[], cols: number, values: number[]): AlgoInput {
  return { type: 'matrix', rows, cols, values };
}

export function graph(g: {
  nodes: AlgoGraphNode[];
  edges: AlgoGraphEdge[];
  directed?: boolean;
  weighted?: boolean;
}): AlgoInput {
  const directed = g.directed ?? true;
  return {
    type: 'graph',
    nodes: g.nodes,
    edges: g.edges,
    directed,
    weighted: g.weighted ?? g.edges.some((e) => e.weight !== undefined),
  };
}

export interface AlgoGraphNode {
  id: string;
  label?: string;
  x: number;
  y: number;
}
export interface AlgoGraphEdge {
  from: string;
  to: string;
  weight?: number;
  directed: boolean;
}

export function grid(rows: number, cols: number, values: Array<number | string | null>): AlgoInput {
  return { type: 'grid', rows, cols, values };
}

export function keys(values: Array<number | string>): AlgoInput {
  return { type: 'keys', values };
}

/* ------------------------------------------------------------------ *
 * Narrowing helpers — used pervasively by the generators
 * ------------------------------------------------------------------ */

export function isNumbers(i: AlgoInput): i is { type: 'numbers'; values: number[] } {
  return i.type === 'numbers';
}
export function isChars(i: AlgoInput): i is { type: 'chars'; values: string } {
  return i.type === 'chars';
}
export function isWords(i: AlgoInput): i is { type: 'words'; values: string[] } {
  return i.type === 'words';
}
export function isMatrix(
  i: AlgoInput,
): i is { type: 'matrix'; rows: number[]; cols: number; values: number[] } {
  return i.type === 'matrix';
}
export function isGraph(i: AlgoInput): i is Extract<AlgoInput, { type: 'graph' }> {
  return i.type === 'graph';
}
export function isGrid(i: AlgoInput): i is Extract<AlgoInput, { type: 'grid' }> {
  return i.type === 'grid';
}
export function isKeys(i: AlgoInput): i is { type: 'keys'; values: Array<number | string> } {
  return i.type === 'keys';
}
export function isTree(i: AlgoInput): i is { type: 'tree'; values: Array<number | string> } {
  return i.type === 'tree';
}

/** Every element of a one-dimensional input as an array, whatever its flavour. */
export function asCellArray(i: AlgoInput): Array<number | string> {
  switch (i.type) {
    case 'numbers':
    case 'words':
    case 'keys':
    case 'tree':
      return i.values;
    case 'chars':
      return [...i.values];
    case 'matrix':
      return i.values;
    default:
      return [];
  }
}

/** The human-readable size of an input, for threshold warnings. */
export function inputSize(i: AlgoInput): number {
  switch (i.type) {
    case 'numbers':
    case 'words':
    case 'keys':
    case 'tree':
      return i.values.length;
    case 'chars':
      return i.values.length;
    case 'matrix':
      return i.rows.length * i.cols;
    case 'grid':
      return i.rows * i.cols;
    case 'graph':
      return i.nodes.length;
    default:
      return 0;
  }
}

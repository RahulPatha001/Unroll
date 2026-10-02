import type { Frame } from '../core/trace/types.ts';

/**
 * A shape mark per frame kind.
 *
 * ## What this is for
 *
 * Sixty-six rows of identical rectangles are a wall. A student scanning for "the
 * graph one" cannot see that from the text, because the text is the same shape
 * every time — a name, a sentence, a number. These marks make the *kind* of data
 * structure legible before a single word is read, which is the one piece of
 * information a list of algorithms has that a flat catalogue cannot show.
 *
 * ## Why abstract rather than literal
 *
 * Because a literal miniature of a real visualisation is a lie at 16 pixels. A
 * four-node graph icon drawn honestly needs 6px per node, and at that size it is a
 * smudge that reads as "some dots" for every graph in the app. These are *signs*
 * that stand for a shape — four bars, a branching fork, a triangle of nodes — and
 * they are deliberately not to scale with anything.
 *
 * ## Why `aria-hidden`
 *
 * Because it carries no information the row does not already carry in text. The
 * row says the family in its heading and the shape in nothing at all — so the mark
 * is decorative texture, and announcing "image, array" before every algorithm name
 * would be noise for anyone using a screen reader.
 *
 * ## One box, one stroke weight
 *
 * Every mark is drawn in the same 16×16 box with a 1.25 stroke and round caps, so
 * the set reads as one family at a glance. Marks that shared a scale would look
 * like they were competing for attention.
 */

const KINDS = ['array', 'linear', 'linked', 'hash', 'tree', 'trie', 'graph', 'grid'] as const;

type Kind = (typeof KINDS)[number];

export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

/**
 * The name announced nowhere, but used as the `title` for a sighted mouse user
 * hovering the mark — "shows as: graph" is genuinely useful context on a row where
 * the shape is otherwise unexplained.
 */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'array':
      return 'a bar chart';
    case 'linear':
      return 'a sequence';
    case 'linked':
      return 'linked nodes';
    case 'hash':
      return 'a hash table';
    case 'tree':
      return 'a tree';
    case 'trie':
      return 'a prefix tree';
    case 'graph':
      return 'a graph';
    case 'grid':
      return 'a grid';
    default:
      return kind;
  }
}

export function FamilyGlyph({ kind, className }: { kind: Frame['kind']; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className ?? 'flex size-8 shrink-0 items-center justify-center'}
    >
      {/*
        Suppressed rather than satisfied, and the reasoning is the point.

        This SVG sits inside an `aria-hidden` subtree, so a `<title>` here is never
        announced by anything — the rule's intent, that a screen reader be able to
        say what the graphic is, is already met by the glyph being decorative.
        Adding a title anyway would be cargo-culting: it satisfies a checker by
        inserting a node no user and no assistive technology can reach.

        The accessible equivalent is the row's own text, and a sighted reader gets
        the same fact from the `title` attribute on the wrapping element in
        `AlgoRow`.
      */}
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: aria-hidden by design; the row's text carries the same information */}
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="size-4"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <PathFor kind={kind} />
      </svg>
    </span>
  );
}

function PathFor({ kind }: { kind: Frame['kind'] }) {
  switch (kind) {
    /* Four bars of varying height — reads as "sorts" instantly. */
    case 'array':
      return (
        <>
          <path d="M3 12.5V8" />
          <path d="M6.5 12.5V5" />
          <path d="M10 12.5V9.5" />
          <path d="M13 12.5V3.5" />
        </>
      );
    /* A dotted run — a sequence with no structure beyond its order. */
    case 'linear':
      return (
        <>
          <path d="M3 8h10" strokeDasharray="0.1 3" />
          <path d="M3 8h10" opacity={0.25} />
        </>
      );
    /* Circles on a line: nodes and arrows. */
    case 'linked':
      return (
        <>
          <path d="M5.5 8h5" />
          <circle cx="3.5" cy="8" r="1.6" />
          <circle cx="12.5" cy="8" r="1.6" />
        </>
      );
    /* A row of buckets with one probed — the hash table's actual idea. */
    case 'hash':
      return (
        <>
          <rect x="2.5" y="4.5" width="11" height="7" rx="1.5" />
          <path d="M6 4.5v7M10 4.5v7" opacity={0.45} />
        </>
      );
    /* One root, two children: the minimum that says "tree". */
    case 'tree':
      return (
        <>
          <circle cx="8" cy="3.6" r="1.5" />
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <path d="M7.2 5 4.8 10.6M8.8 5l2.4 5.6" />
        </>
      );
    /* A deeper fork, with a terminal — reads as "prefixes stored". */
    case 'trie':
      return (
        <>
          <circle cx="4" cy="3.6" r="1.4" />
          <circle cx="9" cy="7.4" r="1.4" />
          <circle cx="4" cy="7.4" r="1.4" />
          <circle cx="9" cy="12" r="1.4" />
          <path d="M5.2 4.6 3.4 6.3M5.1 3.9l2.7 2.4M5.3 8.6l2.5 2.4" />
        </>
      );
    /* Three nodes, every pair joined — the shape of "connected". */
    case 'graph':
      return (
        <>
          <path d="M8 3.2 12.6 12H3.4L8 3.2Z" opacity={0.5} />
          <circle cx="8" cy="3.2" r="1.6" />
          <circle cx="12.6" cy="12" r="1.6" />
          <circle cx="3.4" cy="12" r="1.6" />
        </>
      );
    /* A 3×3 lattice, one cell filled: the grid's actual vocabulary. */
    case 'grid':
      return (
        <>
          <path d="M4 2.5v11M8 2.5v11M12 2.5v11M2.5 4h11M2.5 8h11M2.5 12h11" opacity={0.4} />
          <rect
            x="4"
            y="8"
            width="4"
            height="4"
            rx="0.5"
            fill="currentColor"
            stroke="none"
            opacity={0.9}
          />
        </>
      );
    default:
      return <path d="M3 8h10" opacity={0.4} />;
  }
}

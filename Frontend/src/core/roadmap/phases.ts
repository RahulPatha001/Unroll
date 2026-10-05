import type { Phase } from './types.ts';

/**
 * The four stages.
 *
 * ## Hand-ordered, and the order is the curriculum
 *
 * Not alphabetical, not "by difficulty". It is the order that gets a beginner from
 * "I have written a for loop" to "I can be asked a graph question", and it puts the
 * *techniques* before the *structures*, which is the opposite of how these topics
 * are usually taught.
 *
 * That order is the single opinion this page has. Everything else — which questions,
 * which levels, how many — follows from it:
 *
 *  - **Patterns before structures.** Two pointers, sliding window, binary search and
 *    recursion are *ways of attacking a problem*, and they apply to arrays, strings,
 *    trees and graphs alike. Teaching a binary search tree before two pointers
 *    teaches the structure without the technique, and the technique is the part
 *    that transfers.
 *  - **Linked lists and stacks before trees**, because a linked list is the first
 *    time a learner meets "a node is not its value", and a stack is the first time
 *    they meet "the structure does the remembering for you". Both are cheaper to
 *    learn on a structure with one pointer and one end.
 *  - **DP last, and split in two.** Dynamic programming is not a harder greedy. It
 *    is the first topic where you must describe a problem as a *table of states*
 *    before writing any code, and that is a different kind of thinking, not a harder
 *    version of the same one. Splitting it into 1-D and 2-D lets the first half land
 *    while the second half is still scaffolding.
 *
 * ## The week ranges are a guide, not a promise
 *
 * They are labelled `Weeks 1–3` and not "3 weeks" because nobody finishes this on
 * schedule, and a roadmap that implies otherwise is a guilt generator. The ranges
 * assume roughly an hour a day; someone doing twenty minutes should read them as a
 * floor, and someone with a CS degree can skip the foundation phase.
 */
export const PHASE_LIST: readonly Phase[] = [
  {
    id: 'foundation',
    label: 'Foundation',
    weeks: 'Weeks 1–3',
    blurb:
      'The vocabulary every interview assumes you already have: complexity, arrays, strings, and a hash map you can reach for without thinking.',
    outcome:
      'You can read a problem, say what it costs in the worst case, and know which data structure is hiding in it.',
  },
  {
    id: 'patterns',
    label: 'Core patterns',
    weeks: 'Weeks 4–8',
    blurb:
      'Five techniques that keep reappearing regardless of the data structure: two pointers, sliding window, binary search, divide and conquer, and recursion.',
    outcome:
      'Given an unfamiliar array or string problem, you can name the pattern it belongs to before you write a line.',
  },
  {
    id: 'structures',
    label: 'Structures',
    weeks: 'Weeks 9–14',
    blurb:
      'The data structures themselves, plus greedy reasoning and the two graph traversals — the part of interviews where the shape of the input changes.',
    outcome:
      'You can model a problem as a graph, choose BFS or DFS, and know when a heap is the right answer.',
  },
  {
    id: 'advanced',
    label: 'Advanced & interview-ready',
    weeks: 'Weeks 15–22',
    blurb:
      'Dynamic programming, weighted graphs, and the questions that combine two ideas at once. This is the phase that feels like the exam.',
    outcome:
      'You can write a DP table from the recurrence, run Dijkstra or an MST, and survive a 45-minute interview.',
  },
] as const;

import { beforeEach, describe, expect, it } from 'vitest';
import { bubbleSortAlgo } from '../../core/algorithms/sorting/bubble-sort.ts';
import type { Preset } from '../../core/algorithms/types.ts';
import { usePlayer } from './playerStore.ts';

/**
 * `regeneratesInput` — the flag 28 algorithms declare and nothing implemented.
 *
 * ## What was broken
 *
 * `ParamSpec.regeneratesInput` is documented as *"Changing this regenerates the
 * input (e.g. a new random array)"* and was referenced nowhere outside its own
 * declaration. So `setParam` re-ran the algorithm against the *existing* input and
 * `size` could only ever **truncate**. Dragging it from 8 to 20 did nothing at
 * all: the viewport still drew 8 cells, because there was nothing to slice up to.
 *
 * That is the defect a student hits first, before typing anything of their own,
 * so it is worth having as a store-level test rather than only testing
 * `resizeInput` in isolation — the function being correct is no use if the store
 * does not call it.
 */
const reset = () => {
  usePlayer.setState({
    algoId: 'bubble-sort',
    algo: null,
    status: 'idle',
    error: null,
    params: {},
    input: { type: 'numbers', values: [] },
    presetId: null,
    inputCustom: false,
    trace: [],
    index: 0,
    isPlaying: false,
    completed: false,
    truncated: false,
    lastRunMs: 0,
    offThread: false,
    lang: 'javascript',
    loop: false,
    shortcutsOpen: false,
  });
};

const sizeSpec = () => {
  const spec = usePlayer.getState().algo?.params.find((p) => p.key === 'size');
  if (!spec) throw new Error('expected this algorithm to declare a `size` param');
  return spec;
};

const drawn = () => {
  const f = usePlayer.getState().trace[0];
  return f && f.kind === 'array' ? f.values.length : -1;
};

const descending = (a: readonly number[]) =>
  a.every((v, i) => i === 0 || (a[i - 1] as number) >= v);

const values = () => {
  const i = usePlayer.getState().input;
  return i.type === 'numbers' ? i.values : [];
};

describe('a size control that regenerates its input', () => {
  beforeEach(reset);

  it('grows the run when raised, which is the whole point of it', async () => {
    await usePlayer.getState().load('bubble-sort');
    const before = drawn();
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(20);

    await usePlayer.getState().setParam(sizeSpec(), 20);

    expect(Number(usePlayer.getState().params['size'])).toBe(20);
    expect(drawn()).toBe(20);
  });

  it('still shrinks when lowered', async () => {
    // The direction that happened to work before, kept working. A fix that only
    // implemented growth would have looked correct in the store and broken this.
    await usePlayer.getState().load('bubble-sort');
    await usePlayer.getState().setParam(sizeSpec(), 24);
    await usePlayer.getState().setParam(sizeSpec(), 3);
    expect(drawn()).toBe(3);
  });

  it('keeps a reversed preset reversed when it grows', async () => {
    // Growing `Reversed` to 20 must not turn it into 20 random numbers: the
    // best-case O(n) lesson is the entire reason to pick that preset, and a
    // resize that kept the length while destroying the shape would be a fix that
    // teaches something false.
    await usePlayer.getState().load('bubble-sort');
    await usePlayer
      .getState()
      .applyPreset(bubbleSortAlgo.presets.find((p) => p.id === 'reverse') as Preset);
    expect(descending(values()), 'the fixture is not actually reversed').toBe(true);

    await usePlayer.getState().setParam(sizeSpec(), 20);

    expect(values()).toHaveLength(20);
    expect(descending(values()), 'a grown reversed preset lost its order').toBe(true);
  });

  it('keeps growing past the first step, which is where the flag version stopped', async () => {
    /*
      The regression this whole file exists for.

      `regeneratesInput` produces a *new* array from a preset, so after the first
      growth the input no longer equals the preset it came from. The original
      provenance check was a value comparison — `!isPresetInput(preset, input)` —
      and it reported "custom" from that point on. The `size` control was then
      capped at the current length, so it grew once (8 -> 20) and refused every
      step after. A student dragging the slider would see it move, then stick,
      which reads as the app being broken rather than as a cap.

      Provenance is recorded now, and this asserts the recorded value survives a
      regeneration, twice over.
    */
    await usePlayer.getState().load('bubble-sort');
    const spec = sizeSpec();

    await usePlayer.getState().setParam(spec, 20);
    expect(drawn()).toBe(20);
    expect(usePlayer.getState().inputCustom, 'a grown preset was mistaken for custom input').toBe(
      false,
    );

    await usePlayer.getState().setParam(spec, 60);
    expect(drawn(), 'the second growth was refused').toBe(60);

    await usePlayer.getState().setParam(spec, 150);
    expect(drawn(), 'the third growth was refused').toBe(150);
  });

  it('reaches the declared ceiling of 150', async () => {
    await usePlayer.getState().load('bubble-sort');
    expect(sizeSpec().max).toBe(150);
    await usePlayer.getState().setParam(sizeSpec(), 150);
    expect(drawn()).toBe(150);
  });

  it('never regenerates a custom input, because that would replace the data', async () => {
    // The student typed these exact values. Answering a number field by inventing
    // twenty more would overwrite their work silently, which is worse than the
    // control doing nothing.
    await usePlayer.getState().load('bubble-sort');
    const mine = Array.from({ length: 6 }, (_, i) => i + 1);
    await usePlayer.getState().setInput({ type: 'numbers', values: mine });
    await usePlayer.getState().setParam(sizeSpec(), 40);

    expect(values()).toEqual(mine);
    expect(Number(usePlayer.getState().params['size'])).toBe(6);
    expect(drawn()).toBe(6);
  });

  it('leaves a non-regenerating param alone', async () => {
    // A `target` or a `rotation` changes the computation, not the data. If this
    // ever started regenerating, the input would change under a control that has
    // nothing to do with input size.
    await usePlayer.getState().load('longest-substring');
    const spec = usePlayer.getState().algo?.params.find((p) => !p.regeneratesInput);
    if (!spec) return; // this algorithm has only regenerating params
    const before = values();
    await usePlayer.getState().setParam(spec, spec.default);
    expect(values()).toEqual(before);
  });
});

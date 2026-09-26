import { useEffect, useRef } from 'react';
import { isPresetInput } from '../../core/input/fields.ts';
import type { AlgoInput } from '../../core/input/types.ts';
import { decodeInput, readUrlState, writeUrlState } from '../../lib/urlState.ts';
import { type PlayerState, usePlayer } from './playerStore.ts';

/**
 * URL ⇄ store. The custom-input feature is half-built without this.
 *
 * `urlState.ts` has been able to encode an `AlgoInput` into the query string
 * since before the editor existed — and nothing ever called `writeUrlState`, so
 * the encoder was dead code and a student who typed their own array could not
 * reload the page, share the link, or send it to anyone. Restoring a *preset*
 * from the URL worked; restoring a *run* did not.
 *
 * ## Two decisions worth stating
 *
 * **A custom input is only put in the URL when it differs from the active
 * preset.** Otherwise every ordinary link carries a base64 copy of an array that
 * the preset already names, which makes the links long, unreadable, and — worse
 * — makes a later edit to that preset's data silently not apply to old links.
 * Preset links stay short; only a genuinely custom input pays for the payload.
 *
 * **Algorithm changes push a history entry; everything else replaces.** The
 * frame index changes up to 60 times a second during playback, so pushing on
 * every frame would make the Back button useless within a second of pressing
 * play. But "go back to the algorithm I was looking at" is a real expectation,
 * and `replaceState` alone would drop it on the floor. So the one transition
 * worth a history entry gets one.
 */

const THROTTLE_MS = 250;

/** The URL-relevant slice. Built fresh, so it is compared field by field. */
interface UrlSlice {
  algoId: string;
  /**
   * The algorithm this write is replacing, captured when the change was *observed*
   * rather than when it is written.
   *
   * This was the previous algorithm only as of the last flush, and the flush is
   * throttled by 250ms — so switching algorithms within that window compared
   * against `null`, read as "the very first write, so replace", and never pushed.
   * The result was a history with a single entry, so `goBack()` left the app for
   * `about:blank`. A visitor who clicked through quickly got no Back button at all,
   * which is the exact feature this file exists to provide.
   */
  previousAlgo: string | null;
  presetId: string | null;
  lang: PlayerState['lang'];
  index: number;
  speed: PlayerState['speed'];
  loop: boolean;
  params: PlayerState['params'];
  input: AlgoInput;
}

/**
 * The input to put in the link, or null when the student is looking at a preset
 * and the preset name already says everything.
 *
 * A custom input is only encoded when it differs from the active preset.
 * Otherwise every ordinary link carries a base64 copy of an array the preset
 * already names, which makes the links long and unreadable and — worse — makes a
 * later edit to that preset's data silently not apply to old links.
 */
function customInputOf(presetInput: AlgoInput | undefined, input: AlgoInput): AlgoInput | null {
  return isPresetInput(presetInput, input) ? null : input;
}

/** The active preset's input, or undefined when no preset is selected. */
function activePresetInput(s: PlayerState): AlgoInput | undefined {
  return s.algo?.presets.find((p) => p.id === s.presetId)?.input;
}

export function useUrlSync(): void {
  const lastAlgo = useRef<string | null>(null);
  /** Set while applying a `popstate`, so the write that follows replaces. */
  const popRef = useRef(false);

  useEffect(() => {
    let timer: number | undefined;
    let pending: (UrlSlice & { presetInput?: AlgoInput }) | null = null;

    const write = (slice: UrlSlice & { presetInput?: AlgoInput }, push: boolean) => {
      /*
       * Derived from the same captured slice as everything else, deliberately.
       * Reading the live store for the input while writing a captured index
       * would splice a newer input onto an older frame, and the resulting link
       * would look fine and be subtly wrong.
       */
      const custom = customInputOf(slice.presetInput, slice.input);
      const query = writeUrlState(
        {
          algo: slice.algoId,
          ...(slice.presetId ? { preset: slice.presetId } : {}),
          lang: slice.lang,
          frame: slice.index,
          speed: slice.speed,
          loop: slice.loop,
          params: slice.params,
        },
        custom ?? undefined,
      );
      const url = `${window.location.pathname}${query}`;
      if (push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    };

    const flush = () => {
      timer = undefined;
      const slice = pending;
      pending = null;
      if (!slice) return;
      /*
       * Push only for a change the student made, never for one the browser made.
       *
       * After a `popstate` the algorithm genuinely has changed — Quick Sort to
       * Dijkstra — so the naive test says "push". But we are already *on* the
       * entry the pop landed us on, and `pushState` truncates every entry after
       * the current one. So it deletes the Forward history the student is in the
       * middle of using: Back works, Forward silently does nothing, and the only
       * symptom is a browser button that has stopped working.
       *
       * Hence the `fromPop` flag, set before applying a pop and consumed by the
       * first write that follows it.
       */
      const fromPop = popRef.current;
      popRef.current = false;
      const algoChanged = slice.previousAlgo !== null && slice.previousAlgo !== slice.algoId;
      write(slice, algoChanged && !fromPop);
    };

    /**
     * Drop a scheduled write.
     *
     * Needed on every `popstate`. A write scheduled by the state we are *leaving*
     * is throttled by up to 250ms, so it can fire after the browser has already
     * navigated — and `replaceState` then rewrites the entry the browser just moved
     * to. The symptom is a Forward that appears to do nothing: the history position
     * advances and the URL is stamped back over it.
     */
    const cancelPending = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
      pending = null;
    };

    const schedule = (slice: UrlSlice & { presetInput?: AlgoInput }) => {
      pending = slice;
      if (timer !== undefined) return;
      timer = window.setTimeout(flush, THROTTLE_MS);
    };

    const unsubscribe = usePlayer.subscribe((s) => {
      // Eager, so the *next* notification has something to compare against however
      // quickly the next one arrives.
      const previousAlgo = lastAlgo.current;
      lastAlgo.current = s.algoId;
      const slice = {
        algoId: s.algoId,
        previousAlgo,
        presetId: s.presetId,
        lang: s.lang,
        index: s.index,
        speed: s.speed,
        loop: s.loop,
        params: s.params,
        input: s.input,
        presetInput: activePresetInput(s),
      };

      /*
       * An algorithm change is written *immediately*, not throttled.
       *
       * Everything else here is high-frequency — `index` moves up to 60 times a
       * second — which is the only reason there is a throttle. But sharing it with
       * the one event that creates a history entry made Back depend on timing: a
       * student who picked an algorithm and hit Back within 250ms found no entry to
       * go back to, and left the app for `about:blank`. The fix is not a longer
       * timeout, it is not sharing a mechanism between a per-frame update and a
       * navigation.
       *
       * `cancelPending` first, so a queued frame update cannot land afterwards and
       * stamp the old algorithm over the entry we just pushed.
       */
      if (previousAlgo !== null && previousAlgo !== s.algoId && !popRef.current) {
        popRef.current = false;
        cancelPending();
        write(slice, true);
        return;
      }
      schedule(slice);
    });

    /*
     * Back and forward.
     *
     * Only algorithm changes push an entry, so this fires for those and for
     * anything outside the app. Applying it re-enters `load`, which writes the
     * URL again — harmless, because `replaceState` does not fire `popstate`, so
     * there is no loop. A `busy` guard is still kept for the case where a pop
     * arrives while a load is in flight, because two loads racing is exactly the
     * out-of-order-completion bug the store's `requestId` exists to stop, and
     * starting a third is not an improvement.
     */
    /*
     * Back and forward, with no re-entrancy guard.
     *
     * There was a `busy` flag here that ignored a pop while another was still being
     * applied, and it was wrong twice over. It broke the feature: a student holding
     * the Back button gets a second pop milliseconds after the first, while
     * `applyUrlState` is still awaiting the algorithm's lazy import, and that second
     * navigation was silently discarded. It was also redundant — two `load` calls
     * racing is precisely what the store's `requestId` exists to make safe, so the
     * guard was protecting against a problem that had already been solved and
     * creating one it had not.
     */
    const onPop = () => {
      // Whatever we had queued describes the state we are leaving.
      cancelPending();
      // Mark the change as the browser's, so the write that follows replaces the
      // entry we are on instead of pushing a duplicate that truncates Forward.
      popRef.current = true;
      void applyUrlState();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', onPop);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
}

/**
 * Apply whatever the URL currently says to the store.
 *
 * One implementation, called from the mount effect and from `popstate`, because
 * the two were briefly separate copies and they drifted — which is how the
 * ordering bug below got written twice.
 *
 * ## The order is load-bearing
 *
 * **The frame is restored last, and it has to be.** Every `setParam` rebuilds the
 * trace, and `applyTrace` resets the index to 0 as part of doing so. A URL
 * carrying `params={"size":8}` and `frame=30` therefore lands on frame 0 if the
 * seek runs first: the seek succeeds, the parameter re-run throws it away, and
 * the link silently opens on the wrong step. It is a plausible-looking link, and
 * there is nothing on screen to say the frame was dropped.
 *
 * So: everything that can *rebuild the trace* first, then seek into the result.
 */
export async function applyUrlState(): Promise<void> {
  const state = readUrlState(window.location.search);
  const custom = state.input ? decodeInput(state.input) : null;

  await usePlayer.getState().load(state.algo, {
    ...(state.preset ? { presetId: state.preset } : {}),
    lang: state.lang,
    ...(custom ? { input: custom } : {}),
  });

  if (state.speed !== undefined) usePlayer.getState().setSpeed(state.speed);
  if (state.loop) usePlayer.getState().setLoop(true);

  if (state.params) {
    for (const [k, v] of Object.entries(state.params)) {
      const spec = usePlayer.getState().algo?.params.find((p) => p.key === k);
      // Awaited one at a time: two overlapping `setParam` calls race, and the
      // loser's trace wins, which is the store's `requestId` problem arriving
      // from a direction the guard was not written for.
      if (spec) await usePlayer.getState().setParam(spec, v);
    }
  }

  if (state.frame !== undefined && state.frame > 0) {
    usePlayer.getState().dispatch({ type: 'seek', index: state.frame });
  }
}

/**
 * Seed the store from the URL, once, on mount.
 *
 * Split out from the subscription because it is a read, not a write, and because
 * it has to happen *before* the first `useUrlSync` write or a custom input in
 * the link would be overwritten by the default preset's within a tick.
 */
export const loadFromUrl = applyUrlState;

/** Whether the current input is the preset's own, or genuinely the user's. */
export function isCustomInput(s: PlayerState): boolean {
  return !isPresetInput(activePresetInput(s), s.input);
}

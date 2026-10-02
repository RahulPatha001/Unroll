/**
 * Copying a link to the current run.
 *
 * A share link is a headline feature: the URL carries the algorithm, the
 * language, the frame index, the preset and any custom input, so a link
 * reproduces the run exactly. It used to be reachable only from inside the input
 * editor, which is a strange place to look for it — the editor is about
 * *changing* the run, and a student who wants to send someone what they are
 * looking at is not thinking about the editor at all.
 *
 * Both call sites need the same three things and had drifted into having them
 * separately: read the current URL, write it, and report success briefly. The
 * brief-lived "copied" confirmation is the fiddly part, so it is a hook here
 * rather than a `setTimeout` in each component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the confirmation stays up. Long enough to notice, short enough not to linger. */
const CONFIRM_MS = 1600;

/**
 * Write `text` to the clipboard, resolving to whether it worked.
 *
 * Never rejects. A clipboard the browser will not open — an insecure origin, a
 * permission the student declined, a browser with no async clipboard at all — is
 * not an error worth a dialog: the address bar already holds a link that
 * reproduces the exact run, so the worst case is a control that quietly does
 * nothing, which is still not ideal but is not worth interrupting anyone over.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * A "copy" button's worth of state: a `copied` flag that clears itself, and a
 * `copy` callback that fills it.
 */
export function useCopyLink(): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // A pending timer must not fire after unmount, or a student who navigates
  // within 1.6s of copying gets a state update on a dead component.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void copyToClipboard(window.location.href).then((ok) => {
      if (!ok) return;
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), CONFIRM_MS);
    });
  }, []);

  return { copied, copy };
}

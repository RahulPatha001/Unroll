#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Delete the committed screenshot baselines so the next capture writes them fresh.
 *
 * ## Why this is necessary, and why it is not obvious
 *
 * Playwright's `--update-snapshots` only writes a file when the comparison
 * **fails** or the file is **missing**. A snapshot that already passes is left
 * exactly as it is, byte for byte and mtime for mtime.
 *
 * That is normally the right behaviour, and it is quietly catastrophic for a
 * tool named "update". The intended workflow is: make a visual change, run the
 * updater, commit the new baselines. If the change happens to fall inside the
 * pixel tolerance, the comparison passes, the updater writes nothing, the stale
 * baseline is committed, and the change is now permanently invisible — the suite
 * reports green against a picture of the app as it used to look.
 *
 * This is not hypothetical here. It happened: the token migration repainted text
 * across the app, the tests passed inside a 0.2% tolerance, `npm run
 * snapshots:update` reported success, and not one of the 26 baselines changed on
 * disk. The two bugs compounded — a tolerance loose enough to hide the change, and
 * an updater that would not have written it anyway.
 *
 * Deleting first makes "update" mean what it says. It also means the tolerance
 * can be as tight as it needs to be, because there is no longer any pressure to
 * inflate it in order to stop baselines churning.
 *
 * The geometry JSON in `tests/visual/__baselines__` is *not* touched: it is
 * written by the test itself under `UPDATE_LAYOUT`, which does overwrite
 * unconditionally, and it is data rather than pixels.
 */
const dir = join(process.cwd(), 'tests', 'visual', 'screens.spec.ts-snapshots');
rmSync(dir, { recursive: true, force: true });
console.log(`  removed ${dir}`);

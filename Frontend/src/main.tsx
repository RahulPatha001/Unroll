import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/inter';
import './index.css';
import { AppRoutes } from './app/routes.tsx';

/**
 * The entry point.
 *
 * ## Why a router, and why `BrowserRouter`
 *
 * `react-router` has been a dependency since the project started and imported by
 * nothing — the app was a single view at `/`. Now there are six, so it is used.
 *
 * `BrowserRouter` rather than `createBrowserRouter` deliberately: the data-router
 * machinery exists for loaders and actions, and nothing here has either. Every
 * page's data is either pure metadata already in `catalog.ts`, or an article from
 * a statically-imported module, or a trace built from a lazy algorithm chunk. A
 * data router would be several kilobytes of unused abstraction against a 200 kB
 * initial budget.
 *
 * ## Where the history is owned, and why it matters
 *
 * Two things write to the URL and they must not fight:
 *
 *  - **The router** owns the *path*. Clicking a link, pressing Back, going
 *    forward.
 *  - `useUrlSync` owns the *query string*, and it writes it with
 *    `history.replaceState` directly, up to 60 times a second during playback.
 *
 * The reason that split works is that a `replaceState` that changes only the query
 * does not fire `popstate`, so the router's own location becomes stale — and
 * nothing reads `location.search` through the router on the player route. The
 * player reads the URL from the store (`useUrlSync`) and the algorithm id from the
 * *presence of the `algo` key*, not from a parsed location. A real navigation, by
 * contrast, fires `popstate`, the router updates, and `useUrlSync`'s own listener
 * re-applies the URL to the store. Two listeners, one outcome, no loop — which is
 * why `replaceState` rather than `pushState` is used for the per-frame writes.
 *
 * ## Why the router is inside `main.tsx` and not in `App.tsx`
 *
 * Because `App` is the player, and the player is a *route*, not the application.
 * Keeping the router above it means a route change unmounts the whole player —
 * store state, pane flags, the playback clock — rather than leaving a stale
 * visualiser mounted behind a page that no longer shows it.
 */

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);

// Offline support. Registered only in a production build: in dev, Vite's HMR
// client and a cache have no useful relationship, and a cached dev build is a
// debugging session nobody can escape. See public/sw.js for the strategy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus, not a requirement. A browser that refuses
      // the registration still gets a fully working app.
    });
  });
}

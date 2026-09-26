import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support. Registered only in a production build: in dev, Vite's HMR
// client and a cache have no useful relationship, and a cached dev build is a
// debugging session nobody can escape. See public/sw.js for the strategy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus, not a requirement. A browser that refuses
      // the registration still gets a fully working visualiser.
    });
  });
}

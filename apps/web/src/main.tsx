import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App.tsx';
import { applyPageTheme, loadSettings } from './shared/storage/settings.ts';
import './shared/tokens/tokens.css';

// Before the first paint, so a forced theme does not flash the system's one.
applyPageTheme(loadSettings().pageTheme);

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

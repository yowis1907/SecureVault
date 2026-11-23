// First, so it applies before any module creates a schema.
import './lib/zod-config';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme, getThemePreference } from './lib/theme';
import './styles/index.css';

// Applied before the first render. An inline script in index.html would do it earlier, but the
// CSP allows no inline scripts.
applyTheme(getThemePreference());

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

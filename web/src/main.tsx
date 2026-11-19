import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

/** Colour themes for previewing: ?theme=atlas (or ?theme=night to reset). Remembered on this device. */
const THEMES = ['night', 'atlas', 'paper', 'shamrock', 'grape', 'press'];
try {
  const asked = new URLSearchParams(location.search).get('theme');
  if (asked && THEMES.includes(asked)) localStorage.setItem('fewclues.theme', asked);
  const theme = localStorage.getItem('fewclues.theme');
  if (theme && theme !== 'night' && THEMES.includes(theme)) document.documentElement.dataset.theme = theme;
} catch {
  /* storage blocked: default theme */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

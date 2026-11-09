import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Vite dev entry — boots the template + effect sandbox. The full pipeline
// (/generate, /viewer/:id, /studio) runs on the Next.js server app.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

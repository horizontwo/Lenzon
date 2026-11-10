import { createRoot } from 'react-dom/client';
import { PlayApp } from './PlayApp';
import '../index.css';
import './play.css';

// The page behind `lenzon-player play`. Built by vite.play.config.ts into
// dist/play/ with everything bundled, React included, so the command can
// serve it as plain files. No StrictMode: its double mount would arm two
// ScriptPlayers on one Presenter.

createRoot(document.getElementById('root')!).render(<PlayApp />);

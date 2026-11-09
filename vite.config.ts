import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The demo host plays scripts and nothing else. It never calls the Lenzon
// server, so there is no API proxy here. The pipeline UI that did call the
// server now lives in @lenzon/player-pipeline and runs inside apps/server.
export default defineConfig({
  plugins: [react()],
});

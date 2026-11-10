import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The page behind `lenzon-player play`. Unlike the library build, nothing
// is external: React, three, animejs and the rest are bundled in. The
// command serves dist/play/ as plain files, so there is no node_modules
// behind the page to resolve them from.
//
// Runs after vite.lib.config.ts, whose emptyOutDir clears all of dist/.
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the page works from whatever path serves it.
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist/play',
    emptyOutDir: true,
    // One self-contained page. Splitting it would only add requests to a
    // local server.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: 'play.html',
    },
  },
});

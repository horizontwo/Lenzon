import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import pkg from './package.json' with { type: 'json' };

// The library build: what npm publishes and what the server consumes.
// `vite.config.ts` is the demo host for `npm run dev` and is not involved.
//
// Each entry keeps its source path as its name, so dist/ mirrors src/ and
// the .d.ts files tsc writes beside them line up with the JS. The entries
// share modules through chunks rather than each bundling its own copy.
// That matters for the template registry: `./templates` registers every
// template and `./templates/registry` lists them, and the two must see the
// same Map.
//
// Every dependency stays external. A consumer installs three, animejs and
// the rest once, and dedupes them against their own copies.
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  plugins: [
    react(),
    {
      // index.ts deliberately does not import index.css, so the consumer
      // decides where the stylesheet lands. That leaves nothing for Vite to
      // extract, so the stylesheet is copied across as-is.
      name: 'copy-stylesheet',
      writeBundle() {
        copyFileSync('src/index.css', 'dist/styles.css');
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        'templates/index': 'src/templates/index.ts',
        'templates/registry': 'src/templates/registry.ts',
        'player/capture/captureMode': 'src/player/capture/captureMode.ts',
        // Data only, so a server can read the sample narration without
        // loading the templates and their browser-side dependencies.
        'player/samples/index': 'src/player/samples/index.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
});

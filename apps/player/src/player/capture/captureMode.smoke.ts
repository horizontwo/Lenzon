/* eslint-disable no-console */
/**
 * Standalone smoke test for the capture-mode bridge.
 *
 * Run from repo root:
 *   npx tsx apps/player/src/player/capture/captureMode.smoke.ts
 *
 * Exits 0 on success, 1 on first failure.
 *
 * What this checks (deliberately narrow):
 *   - setupCaptureMode() installs window.__capture with the expected shape
 *   - tick() advances the virtual clock
 *   - sceneTimeline() returns a defensive copy
 *   - isComplete() returns false before any player is registered
 *   - calling setupCaptureMode() twice throws
 *
 * What this DOES NOT check (deferred to Step 3 recorder, which exercises
 * the bridge inside real Playwright Chromium against a Vite dev build):
 *   - registerPlayer() event chaining (needs a real ScriptPlayer instance)
 *   - document.fonts.ready integration (needs a real DOM)
 *   - end-to-end isComplete() after a script ends
 *
 * Sets up a minimal DOM-shaped global so the bridge can install. We're not
 * trying to be jsdom — we're proving the module wires up.
 */

// Stub the bare minimum DOM surface the bridge touches.
const fakeWindow = {
  location: { search: '?renderMode=capture' },
} as unknown as Window & typeof globalThis;
const fakeDocument = {
  fonts: { ready: Promise.resolve() },
} as unknown as Document;

(globalThis as unknown as { window: typeof window }).window = fakeWindow;
(globalThis as unknown as { document: typeof document }).document = fakeDocument;

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

async function run() {
  console.log('captureMode smoke test');

  const mod = await import('./captureMode');
  type CaptureBridge = import('./captureMode').CaptureBridge;

  // 1. Predicate reads window.location.search.
  check(
    'isCaptureModeRequested() reads ?renderMode=capture',
    mod.isCaptureModeRequested() === true,
  );

  // 2. setupCaptureMode() installs the global bridge with the expected
  //    shape and returns a registration handle.
  const handle = mod.setupCaptureMode();
  const bridge = (fakeWindow as unknown as { __capture?: CaptureBridge })
    .__capture;
  check('window.__capture is installed', bridge !== undefined);
  check(
    'bridge.tick is a function',
    typeof bridge?.tick === 'function',
  );
  check(
    'bridge.isComplete is a function',
    typeof bridge?.isComplete === 'function',
  );
  check(
    'bridge.sceneTimeline is a function',
    typeof bridge?.sceneTimeline === 'function',
  );
  check(
    'handle.registerPlayer is a function',
    typeof handle.registerPlayer === 'function',
  );

  // 3. isComplete() returns false before any player is registered.
  check(
    'isComplete() is false with no player',
    bridge?.isComplete() === false,
  );

  // 4. tick() advances the virtual clock.
  const before = Date.now();
  bridge?.tick(500);
  const after = Date.now();
  check(
    'tick(500) advances virtual Date.now by 500ms',
    after - before === 500,
    `delta=${after - before}`,
  );

  // 5. sceneTimeline() returns a defensive copy. Mutating the returned
  //    array must not affect future reads.
  const t0 = bridge?.sceneTimeline() ?? [];
  t0.push({
    sceneId: 'mutation',
    startMs: 9999,
    narrationAudioUrl: null,
    narrationDurationMs: null,
  });
  const t1 = bridge?.sceneTimeline() ?? [];
  check(
    'sceneTimeline() returns a defensive copy',
    t1.length === 0,
    `length=${t1.length}`,
  );

  // 6. Second setupCaptureMode() call throws.
  let threw = false;
  try {
    mod.setupCaptureMode();
  } catch {
    threw = true;
  }
  check('second setupCaptureMode() throws', threw);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

run().catch((err) => {
  console.error('unexpected error:', err);
  process.exit(1);
});

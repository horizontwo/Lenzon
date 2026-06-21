/* eslint-disable no-console */
/**
 * Standalone smoke test for the virtual clock.
 *
 * Run from repo root:
 *   npx tsx apps/player/src/player/capture/virtualClock.smoke.ts
 *
 * Lives here (not under a test/ dir) because the player package has no test
 * runner yet; spinning up Vitest for four assertions would be more wiring than
 * the test. When Step 2 introduces the __capture bridge and we need React-tree
 * assertions, we can graduate to a real harness and fold this in.
 *
 * Exits 0 on success, 1 on first failure.
 */

import { installVirtualClock } from './virtualClock';

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

function skip(label: string, reason: string) {
  console.log(`  skip ${label} — ${reason}`);
}

function run() {
  console.log('virtualClock smoke test');
  const hasRAF = typeof globalThis.requestAnimationFrame === 'function';

  // Snapshot a few natives so we can verify uninstall restores them.
  const nativePerformanceNow = performance.now;
  const nativeDateNow = Date.now;
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeRAF = hasRAF ? globalThis.requestAnimationFrame : undefined;

  const clock = installVirtualClock();

  // 1. After install, the natives are replaced.
  check(
    'install replaces performance.now',
    performance.now !== nativePerformanceNow,
  );
  check('install replaces Date.now', Date.now !== nativeDateNow);
  check(
    'install replaces setTimeout',
    globalThis.setTimeout !== nativeSetTimeout,
  );
  if (hasRAF) {
    check(
      'install replaces requestAnimationFrame',
      typeof globalThis.requestAnimationFrame === 'function' &&
        globalThis.requestAnimationFrame !== nativeRAF,
    );
  } else {
    skip(
      'install replaces requestAnimationFrame',
      'rAF not present on this host (expected in plain Node)',
    );
  }

  // 2. tick() advances performance.now and Date.now in lockstep.
  const t0 = performance.now();
  const d0 = Date.now();
  clock.tick(250);
  const t1 = performance.now();
  const d1 = Date.now();
  check(
    'tick(250) advances performance.now by 250ms',
    t1 - t0 === 250,
    `delta=${t1 - t0}`,
  );
  check(
    'tick(250) advances Date.now by 250ms',
    d1 - d0 === 250,
    `delta=${d1 - d0}`,
  );

  // 3. clock.now() agrees with performance.now after tick.
  check(
    'clock.now() matches performance.now',
    clock.now() === performance.now(),
    `clock=${clock.now()} perf=${performance.now()}`,
  );

  // 4. setTimeout fires on tick, not on wall-clock.
  let setTimeoutFired = false;
  globalThis.setTimeout(() => {
    setTimeoutFired = true;
  }, 100);
  check('setTimeout has not fired before tick', !setTimeoutFired);
  clock.tick(99);
  check('setTimeout has not fired before its delay', !setTimeoutFired);
  clock.tick(1);
  check('setTimeout fires exactly at its delay', setTimeoutFired);

  // 5. requestAnimationFrame fires on tick.
  if (hasRAF) {
    let rafFireCount = 0;
    globalThis.requestAnimationFrame(() => {
      rafFireCount++;
    });
    check('rAF has not fired before tick', rafFireCount === 0);
    // sinonjs/fake-timers fires rAF callbacks at 16ms intervals (≈60fps).
    clock.tick(16);
    check('rAF fires after 16ms tick', rafFireCount === 1);

    // 6. Recursive rAF — the Stage / Stage3D pattern. Each callback schedules
    //    the next; verify multiple frames advance under repeated ticks.
    let recursiveFires = 0;
    let stop = false;
    const recurse = () => {
      recursiveFires++;
      if (!stop) globalThis.requestAnimationFrame(recurse);
    };
    globalThis.requestAnimationFrame(recurse);
    clock.tick(16); // frame 1
    clock.tick(16); // frame 2
    clock.tick(16); // frame 3
    stop = true;
    clock.tick(16); // frame 4 — last one, no further self-schedule
    check(
      'recursive rAF advances one frame per 16ms tick',
      recursiveFires === 4,
      `fires=${recursiveFires}`,
    );
  } else {
    skip('rAF behavior under tick', 'rAF not present on this host');
    skip('recursive rAF behavior', 'rAF not present on this host');
  }

  // 7. Uninstall restores natives.
  clock.uninstall();
  check(
    'uninstall restores performance.now',
    performance.now === nativePerformanceNow,
  );
  check('uninstall restores Date.now', Date.now === nativeDateNow);
  check(
    'uninstall restores setTimeout',
    globalThis.setTimeout === nativeSetTimeout,
  );
  if (hasRAF) {
    check(
      'uninstall restores requestAnimationFrame',
      globalThis.requestAnimationFrame === nativeRAF,
    );
  } else {
    skip(
      'uninstall restores requestAnimationFrame',
      'rAF not present on this host',
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

run();

import FakeTimers, {
  type Clock,
  type FakeMethod,
} from '@sinonjs/fake-timers';

export interface VirtualClock {
  now(): number;
  tick(deltaMs: number): void;
  uninstall(): void;
}

// Every timer / clock surface we want under the virtual clock when present in
// the host. sinon throws if asked to fake a missing global, so we filter to
// what's actually available — the recorder runs in headless Chromium (all
// present), the smoke test runs in plain Node (no rAF / rIC), and Step 2 will
// run in a real browser.
const CANDIDATE_TARGETS: FakeMethod[] = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'Date',
  'performance',
  'queueMicrotask',
];

function presentTargets(): FakeMethod[] {
  const host = globalThis as unknown as Record<string, unknown>;
  return CANDIDATE_TARGETS.filter((name) => host[name as string] !== undefined);
}

export function installVirtualClock(): VirtualClock {
  const installed: Clock = FakeTimers.install({
    now: 0,
    toFake: presentTargets(),
    shouldAdvanceTime: false,
    shouldClearNativeTimers: true,
  });

  return {
    now: () => installed.now as number,
    tick: (deltaMs: number) => {
      installed.tick(deltaMs);
    },
    uninstall: () => {
      installed.uninstall();
    },
  };
}

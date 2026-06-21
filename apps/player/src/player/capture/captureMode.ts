import type { PresentationScript, Scene } from '../types';
import type { ScriptPlayer } from '../ScriptPlayer';
import { installVirtualClock, type VirtualClock } from './virtualClock';

/**
 * Capture-mode bridge between the headless recorder and the running player.
 *
 * Lifecycle:
 *   1. setupCaptureMode() installs the virtual clock and exposes
 *      `window.__capture` with `tick`/`isComplete`/`sceneTimeline`/`ready`.
 *   2. Viewer.tsx dynamic-imports this module *before* React hydrates so
 *      timers scheduled at import time on any downstream module land in the
 *      virtual clock instead of wall-clock.
 *   3. Once the ScriptPlayer mounts, Viewer.tsx calls registerPlayer() so we
 *      can subscribe to scene events and report `state === 'ended'` from
 *      isComplete().
 *   4. After fonts settle, ready flips to true. The recorder polls for
 *      ready before its first tick.
 *
 * The bridge is intentionally single-shot — there's exactly one render per
 * page load. Calling setupCaptureMode() twice throws.
 */

export interface SceneTimelineEntry {
  sceneId: string;
  /** Virtual-time start of the scene, in ms. */
  startMs: number;
  /** Optional URL to the per-scene MP3 (used by the audio assembler). */
  narrationAudioUrl: string | null;
  /** Persisted MP3 duration if known; null for legacy/in-flight scripts. */
  narrationDurationMs: number | null;
}

export interface CaptureBridge {
  ready: boolean;
  tick(deltaMs: number): void;
  isComplete(): boolean;
  sceneTimeline(): SceneTimelineEntry[];
}

export interface CaptureHandle {
  /** Wire scene events from the running player. Call once per page load. */
  registerPlayer(player: ScriptPlayer, script: PresentationScript): void;
}

declare global {
  interface Window {
    __capture?: CaptureBridge;
  }
}

let installed = false;

export function setupCaptureMode(): CaptureHandle {
  if (installed) {
    throw new Error('setupCaptureMode() called twice on the same page');
  }
  installed = true;

  const clock: VirtualClock = installVirtualClock();
  const timeline: SceneTimelineEntry[] = [];
  let player: ScriptPlayer | null = null;

  const bridge: CaptureBridge = {
    ready: false,
    tick(deltaMs: number) {
      clock.tick(deltaMs);
    },
    isComplete() {
      return player?.state === 'ended';
    },
    sceneTimeline() {
      // Defensive copy — recorder shouldn't be able to mutate our state.
      return timeline.slice();
    },
  };

  window.__capture = bridge;

  // Fonts. Frame 0 in a fallback font produces a visible pop ~3 frames in
  // when the real font swaps. Wait for `document.fonts.ready` before
  // flipping `ready` so the recorder's first screenshot is on the final
  // typography.
  void document.fonts.ready.then(() => {
    bridge.ready = true;
  });

  return {
    registerPlayer(p, script) {
      if (player) {
        throw new Error('registerPlayer() called twice');
      }
      player = p;

      // Build the timeline incrementally — onSceneEnter fires with a Scene,
      // and clock.now() at that moment is the virtual-time start. Cheaper
      // and more correct than trying to derive starts up-front from
      // narration durations + per-scene transitions.
      const onEnter = (scene: Scene) => {
        timeline.push({
          sceneId: scene.id,
          startMs: clock.now(),
          narrationAudioUrl: scene.narrationAudioUrl ?? null,
          narrationDurationMs: scene.narrationDurationMs ?? null,
        });
      };

      // Hook into existing events without disturbing the Viewer's own
      // handlers — preserve and chain.
      const original = (p as unknown as {
        events: { onSceneEnter?: (s: Scene, i: number) => void };
      }).events;
      const prevSceneEnter = original.onSceneEnter;
      original.onSceneEnter = (scene, index) => {
        prevSceneEnter?.(scene, index);
        onEnter(scene);
      };

      // The script reference is currently unused — kept on the registration
      // surface so Step 3+ can reach metadata (total scene count, intro
      // duration) without a second registration pass.
      void script;
    },
  };
}

/**
 * Read once at module-import time so we can decide *outside* the render
 * tree whether to engage capture mode. Lives here (not in Viewer.tsx) so
 * the same predicate is available wherever capture branching is needed.
 */
export function isCaptureModeRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('renderMode') === 'capture';
  } catch {
    return false;
  }
}

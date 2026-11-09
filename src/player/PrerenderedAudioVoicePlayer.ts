import type { Scene } from './types';
import type { SpeakHandle, VoicePlayer } from './VoicePlayer';

/**
 * PrerenderedAudioVoicePlayer — plays the MP3 that the server rendered
 * ahead of time and stored on CDN.
 *
 * Source of truth: the `narrationAudioUrl` + `narrationDurationMs` fields
 * on each Scene. See docs/lenzon/AUDIO-PERSISTENCE-PLAN.md.
 *
 * Scene lookup: `VoicePlayer.speak()` only receives `text`, not a Scene.
 * `ScriptPlayer` calls `setCurrentScene(scene)` just before `speak()` so
 * we can look up the URL for the scene we're about to narrate. Matching
 * by text is fragile (duplicate narrations collide) — don't.
 *
 * Fallback chain: if the current scene has no `narrationAudioUrl` (legacy
 * script, in-flight render, or render failed), delegate to the `fallback`
 * voice player passed in the constructor. If no fallback is configured,
 * emit a silent handle with a word-count-derived duration so scene
 * advance still works.
 */

export interface PrerenderedAudioVoiceOptions {
  /** Fallback engine for scenes that don't have a pre-rendered URL. */
  fallback?: VoicePlayer;
  /**
   * Words per minute used for the silent no-fallback handle. Default 160,
   * which roughly matches Google Neural2 — so timing feels consistent
   * whether the scene is rendered or silently padded.
   */
  wordsPerMinute?: number;
  /**
   * Capture-mode flag. When true, never instantiate an HTMLAudioElement —
   * report `narrationDurationMs` from the scene and resolve a setTimeout
   * after that many ms. The recorder muxes audio in post from per-scene
   * MP3s; the page itself doesn't need to play them. See
   * docs/lenzon/VIDEO-EXPORT-PLAN.md step 2.
   *
   * Falls back to the word-count silent path for scenes without a
   * persisted duration (legacy scripts, in-flight renders).
   */
  silent?: boolean;
}

interface ActiveAudio {
  kind: 'audio';
  audio: HTMLAudioElement;
  resolveDone: () => void;
  handle: SpeakHandle;
  /** Playback speed for this scene — listeners use it to convert duration. */
  speed: number;
}

interface ActiveFallback {
  kind: 'fallback';
  inner: SpeakHandle;
  resolveDone: () => void;
  handle: SpeakHandle;
}

interface ActiveSilent {
  kind: 'silent';
  timer: number | null;
  resolveDone: () => void;
  handle: SpeakHandle;
  /** ms of playback already consumed before the latest pause. */
  consumedMs: number;
  /** performance.now() when the current timer was scheduled. */
  startedAt: number;
  /** total scheduled ms when timer was set. */
  totalMs: number;
}

type Active = ActiveAudio | ActiveFallback | ActiveSilent;

export class PrerenderedAudioVoicePlayer implements VoicePlayer {
  private fallback: VoicePlayer | null;
  private wordsPerMinute: number;
  private silent: boolean;
  private currentScene: Scene | null = null;
  private active: Active | null = null;
  /**
   * A SINGLE, reused <audio> element — created once, then re-pointed (`.src`)
   * per scene. This is the whole autoplay-policy fix: browsers (and the VS
   * Code webview, which is stricter) only let media play outside a user
   * gesture if THAT element has already played once within a gesture. The old
   * code did `new Audio()` per scene, so scene 1 played (its `play()` was
   * synchronous inside the play-button click) but scene 2+ — advanced from a
   * setTimeout/Promise callback with no gesture on the stack — were rejected
   * with `NotAllowedError`. Reusing one unlocked element keeps the permission.
   * `unlock()` primes it inside the first gesture so even scene 1 is covered.
   */
  private el: HTMLAudioElement | null = null;
  private unlocked = false;

  constructor(opts: PrerenderedAudioVoiceOptions = {}) {
    this.fallback = opts.fallback ?? null;
    this.wordsPerMinute = opts.wordsPerMinute ?? 160;
    this.silent = opts.silent ?? false;
  }

  /**
   * Called by ScriptPlayer immediately before `speak()` so we can pick the
   * right URL. Duck-typed on the ScriptPlayer side — not part of the
   * VoicePlayer interface.
   */
  setCurrentScene(scene: Scene): void {
    this.currentScene = scene;
  }

  /**
   * Prime the reused <audio> element inside a user gesture so later,
   * timer-driven scene transitions can play without a `NotAllowedError`.
   * ScriptPlayer calls this from `play()` (which runs in the click handler).
   * Duck-typed (optional on the VoicePlayer interface) and a no-op in
   * capture/silent mode, where no element is ever created.
   *
   * The unlock trick: call `.play()` once within the gesture and immediately
   * pause. Even with no src that transitions the element to a "user-activated"
   * state the autoplay policy then honors for subsequent programmatic plays.
   */
  unlock(): void {
    if (this.silent || this.unlocked) return;
    const el = this.getElement();
    this.unlocked = true;
    // No src yet → play() rejects harmlessly; the act of calling it inside the
    // gesture is what unlocks the element. Swallow the (expected) rejection.
    void el.play().then(
      () => el.pause(),
      () => {
        /* expected: no src / interrupted — unlock still took effect */
      },
    );
  }

  /**
   * Lazily create the single reused element and attach its listeners ONCE.
   * The listeners read `this.active` so they only act for the current speak —
   * stale events from a torn-down scene are ignored (same guard the old
   * per-element code used, now hoisted to element creation).
   */
  private getElement(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';

    el.addEventListener('loadedmetadata', () => {
      const a = this.active;
      if (a?.kind !== 'audio' || a.audio !== el) return;
      if (isFinite(el.duration) && el.duration > 0) {
        a.handle.durationMs = Math.round((el.duration * 1000) / a.speed);
        a.handle.hasAccurateDuration = true;
      }
    });
    el.addEventListener('ended', () => this.settleAudio(el));
    el.addEventListener('error', () => this.settleAudio(el));

    this.el = el;
    return el;
  }

  /** Resolve the current audio speak if `el` is still the active source. */
  private settleAudio(el: HTMLAudioElement): void {
    const a = this.active;
    if (a?.kind !== 'audio' || a.audio !== el) return;
    this.active = null;
    a.resolveDone();
  }

  speak(text: string, opts?: { speed?: number }): SpeakHandle {
    this.stop();

    const speed = opts?.speed ?? 1.0;
    const scene = this.currentScene;
    const url = scene?.narrationAudioUrl;

    // Capture-mode short-circuit: don't construct an <audio> element. Use
    // the persisted duration if we have it; otherwise fall through to the
    // word-count silent path. The recorder muxes audio in post.
    if (this.silent) {
      const knownMs = scene?.narrationDurationMs;
      if (knownMs && knownMs > 0) {
        return this.speakSilentForMs(Math.round(knownMs / speed));
      }
      return this.speakSilent(text, speed);
    }

    if (url) {
      return this.speakFromUrl(url, scene, speed);
    }

    if (this.fallback) {
      return this.speakFromFallback(text, speed);
    }

    return this.speakSilent(text, speed);
  }

  pause(): void {
    const a = this.active;
    if (!a) return;
    switch (a.kind) {
      case 'audio':
        a.audio.pause();
        return;
      case 'fallback':
        this.fallback?.pause();
        return;
      case 'silent':
        if (a.timer !== null) {
          window.clearTimeout(a.timer);
          a.timer = null;
          a.consumedMs += performance.now() - a.startedAt;
        }
        return;
    }
  }

  resume(): void {
    const a = this.active;
    if (!a) return;
    switch (a.kind) {
      case 'audio':
        void a.audio.play().catch(() => {});
        return;
      case 'fallback':
        this.fallback?.resume();
        return;
      case 'silent': {
        if (a.timer !== null) return;
        const remaining = Math.max(0, a.totalMs - a.consumedMs);
        a.startedAt = performance.now();
        a.timer = window.setTimeout(() => this.finishSilent(a), remaining);
        return;
      }
    }
  }

  stop(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    switch (a.kind) {
      case 'audio': {
        const audio = a.audio;
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
        a.resolveDone();
        return;
      }
      case 'fallback':
        this.fallback?.stop();
        a.resolveDone();
        return;
      case 'silent':
        if (a.timer !== null) window.clearTimeout(a.timer);
        a.resolveDone();
        return;
    }
  }

  // --- internals ---

  private speakFromUrl(url: string, scene: Scene, speed: number): SpeakHandle {
    // Reuse the single unlocked element; just re-point it. Listeners are
    // attached once in getElement() and scoped to `this.active`.
    const audio = this.getElement();
    audio.playbackRate = speed;

    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    const forecast = scene.narrationDurationMs
      ? Math.round(scene.narrationDurationMs / speed)
      : this.wordCountForecast(scene.narration, speed);

    const handle: SpeakHandle = {
      durationMs: forecast,
      // True when we have a measured server-side duration; refined from
      // loadedmetadata if not.
      hasAccurateDuration: scene.narrationDurationMs != null,
      done,
      cancel: () => this.stop(),
    };

    const active: ActiveAudio = {
      kind: 'audio',
      audio,
      resolveDone,
      handle,
      speed,
    };
    this.active = active;

    audio.src = url;
    // load() so a re-pointed element drops the previous track's buffered state
    // before the new play(); avoids a stale `ended`/`error` from the old src.
    audio.load();
    void audio.play().catch((err) => {
      // The element is unlocked (see unlock()/reuse), so a NotAllowedError
      // should no longer happen here. Any rejection (e.g. an AbortError from a
      // rapid re-point, or a genuine media error) just settles the scene so
      // playback advances rather than hanging.
      if ((err as Error)?.name !== 'AbortError') {
        console.warn(
          '[PrerenderedAudioVoicePlayer] play() rejected:',
          (err as Error)?.name,
          (err as Error)?.message,
        );
      }
      this.settleAudio(audio);
    });

    return handle;
  }

  private speakFromFallback(text: string, speed: number): SpeakHandle {
    const fallback = this.fallback!;
    const inner = fallback.speak(text, { speed });

    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    const handle: SpeakHandle = {
      get durationMs() {
        return inner.durationMs;
      },
      get hasAccurateDuration() {
        return inner.hasAccurateDuration;
      },
      done,
      cancel: () => this.stop(),
    };

    const active: ActiveFallback = { kind: 'fallback', inner, resolveDone, handle };
    this.active = active;

    void inner.done.then(() => {
      if (this.active !== active) return;
      this.active = null;
      resolveDone();
    });

    return handle;
  }

  private speakSilent(text: string, speed: number): SpeakHandle {
    return this.speakSilentForMs(this.wordCountForecast(text, speed));
  }

  private speakSilentForMs(durationMs: number): SpeakHandle {
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => (resolveDone = r));

    const handle: SpeakHandle = {
      durationMs,
      hasAccurateDuration: true,
      done,
      cancel: () => this.stop(),
    };

    const active: ActiveSilent = {
      kind: 'silent',
      timer: null,
      resolveDone,
      handle,
      consumedMs: 0,
      startedAt: performance.now(),
      totalMs: durationMs,
    };
    active.timer = window.setTimeout(() => this.finishSilent(active), durationMs);
    this.active = active;

    return handle;
  }

  private finishSilent(active: ActiveSilent): void {
    if (this.active !== active) return;
    this.active = null;
    active.resolveDone();
  }

  private wordCountForecast(text: string, speed: number): number {
    const words = Math.max(1, text.trim().split(/\s+/).length);
    return Math.round((words / this.wordsPerMinute) * 60_000 / speed);
  }
}

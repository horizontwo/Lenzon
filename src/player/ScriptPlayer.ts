import type { Presenter } from '../service/presenter';
import type { TemplateHandle } from '../templates';
import { getDefaultIntroSrc, getDefaultOutroSrc, type ChromeConfig } from './chrome';
import type { Beat, PresentationScript, Scene, TransitionSpec } from './types';
import type { SpeakHandle, VoicePlayer } from './VoicePlayer';

export type PlayerState = 'idle' | 'playing' | 'paused' | 'ended';

/**
 * Where in the bookended playback we are. `intro` and `outro` wrap the
 * `scenes[]` walk with branding chrome (Lottie) supplied by ChromeConfig.
 */
export type PlayerPhase = 'idle' | 'intro' | 'scene' | 'outro' | 'ended';

export interface ProgressInfo {
  sceneIndex: number;
  sceneId: string | null;
  total: number;
  elapsedMs: number;
  sceneDurationMs: number;
  state: PlayerState;
  phase: PlayerPhase;
}

export interface ScriptPlayerEvents {
  onSceneEnter?: (scene: Scene, index: number) => void;
  onSceneExit?: (scene: Scene, index: number) => void;
  onStateChange?: (state: PlayerState) => void;
  onEnd?: () => void;
}

export interface ScriptPlayerConfig {
  chrome?: ChromeConfig;
}

/**
 * How long the final scene will wait past its scheduled end for narration
 * audio to actually finish. Covers the common drift — encoder padding, or a
 * server-side duration that rounds a shade short — without letting a voice
 * that never resolves `done` hang the player before 'ended'.
 */
const FINAL_NARRATION_GRACE_MS = 2_000;

/**
 * Reads a PresentationScript and drives the Presenter scene-by-scene.
 * Pure orchestration — doesn't know about templates or voice internals.
 *
 * Intentionally loose: this is Phase 1, optimized for dialing in feel.
 * We lean on setTimeout (not rAF) because scene cadence is seconds-scale
 * and we want simple pause/resume semantics.
 */
export class ScriptPlayer {
  private script: PresentationScript;
  private presenter: Presenter;
  private voice: VoicePlayer;
  private events: ScriptPlayerEvents;

  private sceneIndex = 0;
  private _state: PlayerState = 'idle';
  private phase: PlayerPhase = 'idle';
  private chrome: ChromeConfig;
  private currentHandle: TemplateHandle | null = null;

  private sceneTimer: number | null = null;
  private beatTimers: number[] = [];

  /** For progress reporting / pause accounting. */
  private sceneStartedAt = 0;
  private sceneDurationMs = 0;
  private pauseOffsetMs = 0;
  /** Snapshot of beats not yet fired, with their absolute remaining ms. */
  private pendingBeats: Array<{ beat: Beat; remainingMs: number }> = [];

  /**
   * Incremented every time a scene is entered or torn down. Promise-driven
   * advance (Web Speech path) captures this at scene start and only fires
   * if it still matches — guards against a late onend from a cancelled scene.
   */
  private sceneEpoch = 0;
  /**
   * For accurate-duration voices, advance is a single setTimeout we can
   * clear on pause/seek. For Web Speech it's a promise+floor timer pair.
   */
  private advanceMode: 'timer' | 'promise' = 'timer';
  private narrationDoneAt = 0;
  private holdFloorMs = 0;
  private narrationSettled = false;
  /**
   * The in-flight narration for the current scene, or null once it has
   * settled. Held so the final scene can wait for real end-of-audio before
   * teardown cuts it — see finishAfterNarration().
   */
  private activeNarration: SpeakHandle | null = null;
  /**
   * Set when the final scene's narration wait was interrupted by a pause.
   * resume() picks it up so the run still closes on the audio's own terms
   * rather than being abandoned mid-tail.
   */
  private pendingFinalClose = false;

  constructor(
    script: PresentationScript,
    presenter: Presenter,
    voice: VoicePlayer,
    events: ScriptPlayerEvents = {},
    config: ScriptPlayerConfig = {}
  ) {
    this.script = script;
    this.presenter = presenter;
    this.voice = voice;
    this.events = events;
    this.chrome = config.chrome ?? {};
  }

  private resolveIntroSrc(): string | null {
    const v = this.chrome.intro;
    if (v === false) return null;
    if (typeof v === 'string') return v;
    return getDefaultIntroSrc();
  }

  private resolveOutroSrc(): string | null {
    const v = this.chrome.outro;
    if (v === false) return null;
    if (typeof v === 'string') return v;
    return getDefaultOutroSrc();
  }

  get state(): PlayerState {
    return this._state;
  }

  get progress(): ProgressInfo {
    const inScene = this.phase === 'scene';
    const scene = inScene ? this.script.scenes[this.sceneIndex] ?? null : null;
    const elapsed =
      !inScene
        ? 0
        : this._state === 'paused'
          ? this.pauseOffsetMs
          : this._state === 'playing'
            ? performance.now() - this.sceneStartedAt + this.pauseOffsetMs
            : 0;
    return {
      sceneIndex: this.sceneIndex,
      sceneId: scene?.id ?? null,
      total: this.script.scenes.length,
      elapsedMs: elapsed,
      sceneDurationMs: inScene ? this.sceneDurationMs : 0,
      state: this._state,
      phase: this.phase,
    };
  }

  /** Start (or resume) playback. */
  play(): void {
    // Prime the voice player's audio element inside this user gesture so
    // later, timer-driven scene transitions can play without an autoplay
    // NotAllowedError (esp. in the stricter VS Code webview). Duck-typed —
    // only PrerenderedAudioVoicePlayer implements it; others no-op.
    (this.voice as { unlock?: () => void }).unlock?.();

    if (this._state === 'playing') return;
    if (this._state === 'paused') {
      this.resumeScene();
      return;
    }
    if (this._state === 'ended') {
      this.sceneIndex = 0;
      this.phase = 'idle';
    }
    if (this.phase === 'idle') {
      const intro = this.resolveIntroSrc();
      if (intro) {
        this.enterIntro(intro);
        return;
      }
    }
    void this.enterScene(this.sceneIndex);
  }

  pause(): void {
    if (this._state !== 'playing') return;

    if (this.phase === 'intro' || this.phase === 'outro') {
      this.presenter.pauseLottie();
      this.setState('paused');
      return;
    }

    if (this.sceneTimer !== null) {
      window.clearTimeout(this.sceneTimer);
      this.sceneTimer = null;
    }
    for (const id of this.beatTimers) window.clearTimeout(id);
    this.beatTimers = [];

    this.pauseOffsetMs += performance.now() - this.sceneStartedAt;

    // Re-snapshot remaining beats relative to pauseOffset.
    this.pendingBeats = this.pendingBeats
      .filter((p) => {
        const beatAt = p.beat.at * 1000;
        return beatAt > this.pauseOffsetMs;
      })
      .map((p) => ({ beat: p.beat, remainingMs: p.beat.at * 1000 - this.pauseOffsetMs }));

    this.voice.pause();
    this.setState('paused');
  }

  /** Jump to a scene by index or id. Keeps current play/pause state. */
  seek(target: number | string): void {
    const idx =
      typeof target === 'number'
        ? target
        : this.script.scenes.findIndex((s) => s.id === target);
    if (idx < 0 || idx >= this.script.scenes.length) return;

    const wasPlaying = this._state === 'playing' || this._state === 'paused';
    this.teardownScene();
    this.sceneIndex = idx;
    if (wasPlaying) {
      void this.enterScene(idx);
    } else {
      // Idle seek — render the scene but don't start timers. Useful for
      // manually stepping through scenes while tuning.
      this.renderSceneOnly(this.script.scenes[idx]);
    }
  }

  next(): void {
    if (this.phase === 'intro') {
      this.teardownScene();
      void this.enterScene(0);
      return;
    }
    if (this.phase === 'outro') {
      this.end();
      return;
    }
    if (this.sceneIndex >= this.script.scenes.length - 1) {
      const outro = this.resolveOutroSrc();
      if (outro) {
        this.enterOutro(outro);
      } else {
        this.end();
      }
      return;
    }
    this.seek(this.sceneIndex + 1);
  }

  prev(): void {
    if (this.phase === 'intro') return;
    if (this.phase === 'outro') {
      this.teardownScene();
      void this.enterScene(this.script.scenes.length - 1);
      return;
    }
    if (this.sceneIndex <= 0) return;
    this.seek(this.sceneIndex - 1);
  }

  /** Stop playback entirely and clear the stage. */
  stop(): void {
    this.teardownScene();
    this.presenter.clear();
    this.sceneIndex = 0;
    this.phase = 'idle';
    this.setState('idle');
  }

  // --- internals ---

  /**
   * Play the intro logo over the first scene rather than over an empty
   * stage. We pre-render scene 0's card into the DOM layer (so frame 0 is
   * the fully-composed title card, never black), then play the logo as a
   * transparent overlay on the chrome layer above it. When the logo
   * completes we "start" scene 0 in place — narration/hold/beats — without
   * re-presenting the card (which would flash and re-fire its reveal).
   *
   * If there is no scene 0, fall back to the old behavior: play the intro
   * over the cleared stage, then end.
   */
  private enterIntro(src: string): void {
    this.teardownScene();
    this.presenter.clear();
    this.phase = 'intro';

    const scene0 = this.script.scenes[0];
    if (scene0) {
      this.sceneIndex = 0;
      // Pre-render the card beneath the overlay. No onSceneEnter / timers
      // yet — those start at the handoff so the timeline and narration
      // align to when the card is revealed, not to frame 0.
      this.currentHandle = this.presenter.present(scene0.primitive);
    }

    const epoch = ++this.sceneEpoch;
    this.setState('playing');
    this.presenter.showLottie(
      src,
      () => {
        if (this.sceneEpoch !== epoch) return;
        if (!scene0) {
          this.end();
          return;
        }
        // Reveal-and-run: the card is already mounted, so hand off into
        // scene 0 in place. Keep phase transition explicit.
        this.presenter.hideLottie();
        this.phase = 'scene';
        this.startSceneTimers(scene0, 0, { fireEnter: true });
      },
      { transparent: true }
    );
  }

  private enterOutro(src: string): void {
    this.teardownScene();
    this.presenter.clear();
    this.phase = 'outro';
    const epoch = ++this.sceneEpoch;
    this.setState('playing');
    this.presenter.showLottie(src, () => {
      if (this.sceneEpoch !== epoch) return;
      this.end();
    });
  }

  private async enterScene(index: number): Promise<void> {
    const scene = this.script.scenes[index];
    if (!scene) {
      this.end();
      return;
    }
    this.phase = 'scene';

    // Incoming scene's transition governs both halves of the handoff.
    const spec = scene.transition ?? this.script.defaults.transition;
    const isFirstScene = this.currentHandle === null;
    const epochBeforeOut = this.sceneEpoch;

    if (!isFirstScene) {
      await this.transitionOut(spec);
      // If another teardown/seek happened during the out-transition, abort.
      if (this.sceneEpoch !== epochBeforeOut) return;
    }

    this.teardownScene(); // increments sceneEpoch
    this.presenter.clear();
    this.sceneIndex = index;
    const epochThisScene = this.sceneEpoch;

    this.currentHandle = this.presenter.present(scene.primitive);

    if (!isFirstScene) {
      this.events.onSceneEnter?.(scene, index);
      await this.transitionIn(spec);
      if (this.sceneEpoch !== epochThisScene) return;
    }

    // First scene fires onSceneEnter inside startSceneTimers so the intro
    // composite can render the card early (no onSceneEnter) and only
    // "enter" it — for timeline/audio alignment — once the logo settles.
    this.startSceneTimers(scene, index, { fireEnter: isFirstScene });
  }

  /**
   * Start narration, hold accounting, beats, and the scene-advance timers
   * against the already-mounted `currentHandle`. Split out of `enterScene`
   * so the intro composite can pre-render scene 0's card (under the logo
   * overlay) and then "start" it here — without re-presenting the template
   * (which would flash and re-fire the stagger reveal).
   *
   * `fireEnter` controls whether onSceneEnter is emitted here. The normal
   * multi-scene path fires it at present()-time; the first scene (both the
   * plain first-scene path and the intro handoff) fires it here so the
   * scene-0 timeline start aligns with when narration actually begins.
   */
  private startSceneTimers(
    scene: Scene,
    index: number,
    opts: { fireEnter: boolean } = { fireEnter: false }
  ): void {
    if (opts.fireEnter) this.events.onSceneEnter?.(scene, index);

    // Duck-typed hook: voice players that need the current scene (e.g.
    // PrerenderedAudioVoicePlayer, which resolves narrationAudioUrl per
    // scene) implement setCurrentScene. Existing players don't, which is
    // fine — the optional-chain is the whole back-compat story.
    (this.voice as { setCurrentScene?: (scene: Scene) => void }).setCurrentScene?.(scene);

    const narration = this.voice.speak(scene.narration, {
      speed: this.script.defaults.voice.speed,
    });
    const narrationMs = narration.durationMs;
    const holdMs = scene.holdSeconds * 1000;
    this.activeNarration = narration;

    this.pauseOffsetMs = 0;
    this.sceneStartedAt = performance.now();
    this.narrationSettled = false;
    this.holdFloorMs = holdMs;

    this.pendingBeats =
      scene.beats?.map((b) => ({ beat: b, remainingMs: b.at * 1000 })) ?? [];

    this.scheduleBeats();

    const epoch = ++this.sceneEpoch;
    if (narration.hasAccurateDuration) {
      // Stub / pre-generated audio: durationMs is truth. Single timer drives
      // advance; producer's holdSeconds acts as a minimum floor.
      this.advanceMode = 'timer';
      this.sceneDurationMs = Math.max(narrationMs, holdMs);
      this.scheduleAdvance(this.sceneDurationMs);
    } else {
      // Web Speech: durationMs is a forecast. Advance when audio actually
      // ends AND the hold floor has elapsed. Track a provisional duration
      // for progress reporting; it's refined when `done` resolves.
      this.advanceMode = 'promise';
      this.sceneDurationMs = Math.max(narrationMs, holdMs);
      narration.done.then(() => {
        if (this.sceneEpoch !== epoch) return;
        this.activeNarration = null;
        this.narrationSettled = true;
        this.narrationDoneAt = performance.now() - this.sceneStartedAt + this.pauseOffsetMs;
        // Update reported duration to reflect real audio end when it's longer
        // than our forecast so the progress bar doesn't overshoot.
        this.sceneDurationMs = Math.max(this.narrationDoneAt, holdMs);
        this.maybeAdvanceAfterNarration(epoch);
      });
      // The hold floor still needs its own timer in case audio finishes first.
      this.scheduleHoldFloor(holdMs, epoch);
    }
    this.setState('playing');
  }

  /**
   * Web Speech advance path: fires when BOTH the real audio has ended and
   * the producer's holdSeconds floor has elapsed.
   */
  private maybeAdvanceAfterNarration(epoch: number): void {
    if (this.sceneEpoch !== epoch) return;
    if (!this.narrationSettled) return;
    const elapsed = performance.now() - this.sceneStartedAt + this.pauseOffsetMs;
    const remainingFloor = this.holdFloorMs - elapsed;
    if (remainingFloor <= 0) {
      this.advanceNow();
    }
    // else: the hold-floor timer will fire advanceNow when it expires.
  }

  private scheduleHoldFloor(holdMs: number, epoch: number): void {
    const elapsed = performance.now() - this.sceneStartedAt + this.pauseOffsetMs;
    const remaining = Math.max(0, holdMs - elapsed);
    this.sceneTimer = window.setTimeout(() => {
      if (this.sceneEpoch !== epoch) return;
      if (this.narrationSettled) {
        this.advanceNow();
      }
      // else: narration still playing; `done` handler will advance when it settles.
    }, remaining);
  }

  private advanceNow(): void {
    this.events.onSceneExit?.(this.script.scenes[this.sceneIndex], this.sceneIndex);
    if (this.sceneIndex >= this.script.scenes.length - 1) {
      // Last scene. Nothing follows that would mask a cut, and teardown calls
      // voice.stop(), so ending exactly on schedule truncates any audio still
      // playing. On the accurate-duration path `durationMs` can still run a
      // shade short of the real file — it is set from the server's stored
      // duration before the audio element has loaded, and the loadedmetadata
      // correction may land after the advance was already scheduled.
      //
      // Only the automatic path waits. next()/seek() do not route through
      // here, so an explicit skip still cuts immediately, which is what the
      // viewer asked for.
      void this.finishAfterNarration();
    } else {
      void this.enterScene(this.sceneIndex + 1);
    }
  }

  /**
   * Close out the run, giving narration a bounded chance to finish first.
   * Waits on the live handle's `done` — the interface's documented signal for
   * real end-of-audio — capped by FINAL_NARRATION_GRACE_MS so a voice that
   * never resolves cannot strand the player short of 'ended'.
   */
  private async finishAfterNarration(): Promise<void> {
    const narration = this.activeNarration;
    const epoch = this.sceneEpoch;

    if (narration) {
      let graceTimer: number | null = null;
      await Promise.race([
        narration.done,
        new Promise<void>((resolve) => {
          graceTimer = window.setTimeout(resolve, FINAL_NARRATION_GRACE_MS);
        }),
      ]);
      if (graceTimer !== null) window.clearTimeout(graceTimer);

      // A seek, next, or stop during the wait bumps the epoch and supersedes
      // this close-out.
      if (this.sceneEpoch !== epoch) return;

      // A pause does NOT bump the epoch, and pausing suspends audio without
      // resolving `done`. Ending here would cut the very tail this wait
      // exists to protect, so hand off to resume() instead.
      if (this._state !== 'playing') {
        this.pendingFinalClose = true;
        return;
      }
    }

    const outro = this.resolveOutroSrc();
    if (outro) {
      this.enterOutro(outro);
    } else {
      this.end();
    }
  }

  private resumeScene(): void {
    if (this.phase === 'intro' || this.phase === 'outro') {
      this.presenter.resumeLottie();
      this.setState('playing');
      return;
    }
    // The final scene was already past its scheduled end and was waiting on
    // narration when the pause landed. Resume the audio and re-enter the wait
    // rather than restarting scene timers for a scene that is over.
    if (this.pendingFinalClose) {
      this.pendingFinalClose = false;
      this.setState('playing');
      this.voice.resume();
      void this.finishAfterNarration();
      return;
    }
    this.sceneStartedAt = performance.now();
    this.scheduleBeats();
    if (this.advanceMode === 'timer') {
      const remaining = this.sceneDurationMs - this.pauseOffsetMs;
      this.scheduleAdvance(Math.max(0, remaining));
    } else {
      // Promise path: if narration already ended during pause, only the hold
      // floor is left. Otherwise reschedule the floor; the original `done`
      // promise is still bound to the same epoch and will fire when speech
      // resumes and finishes.
      const epoch = this.sceneEpoch;
      if (this.narrationSettled) {
        const remainingFloor = this.holdFloorMs - this.pauseOffsetMs;
        if (remainingFloor <= 0) {
          this.advanceNow();
          return;
        }
        this.sceneTimer = window.setTimeout(() => {
          if (this.sceneEpoch !== epoch) return;
          this.advanceNow();
        }, remainingFloor);
      } else {
        this.scheduleHoldFloor(this.holdFloorMs, epoch);
      }
    }
    this.voice.resume();
    this.setState('playing');
  }

  private scheduleBeats(): void {
    for (const p of this.pendingBeats) {
      const id = window.setTimeout(() => this.fireBeat(p.beat), p.remainingMs);
      this.beatTimers.push(id);
    }
  }

  private scheduleAdvance(ms: number): void {
    this.sceneTimer = window.setTimeout(() => {
      this.advanceNow();
    }, ms);
  }

  private fireBeat(beat: Beat): void {
    const action = beat.action;
    switch (action.type) {
      case 'emphasize':
        this.currentHandle?.emphasize?.(action.target);
        break;
      case 'highlight-line':
        // Templates (e.g. code-zoom) accept a string target that encodes a line.
        this.currentHandle?.emphasize?.(String(action.line));
        break;
      case 'reveal':
      case 'annotate':
      case 'fx':
        // Phase 1: log-only. Wire these as the Producer starts emitting them.
        // eslint-disable-next-line no-console
        console.debug('[ScriptPlayer] beat not yet implemented', action);
        break;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  /**
   * Animate the outgoing scene away before teardown. Runs on the stageRoot
   * (wraps canvas + DOM + 3D) so all layers move together.
   */
  private async transitionOut(spec: TransitionSpec): Promise<void> {
    if (spec.type === 'cut') return;
    const root = this.presenter.stageRoot;
    root.style.transition = `opacity ${spec.durationMs}ms ease, transform ${spec.durationMs}ms ease`;
    switch (spec.type) {
      case 'fade':
      case 'dissolve':
        root.style.opacity = '0';
        break;
      case 'slide-left':
        root.style.transform = 'translateX(-100%)';
        break;
      case 'slide-right':
        root.style.transform = 'translateX(100%)';
        break;
      case 'zoom-in':
        root.style.transform = 'scale(1.08)';
        root.style.opacity = '0';
        break;
    }
    await this.wait(spec.durationMs);
  }

  /**
   * Animate the incoming scene in. Snaps to the entry state (no transition),
   * then releases to neutral on the next frame so the browser actually
   * animates the change instead of jumping.
   */
  private async transitionIn(spec: TransitionSpec): Promise<void> {
    if (spec.type === 'cut') return;
    const root = this.presenter.stageRoot;
    root.style.transition = 'none';
    switch (spec.type) {
      case 'fade':
      case 'dissolve':
        root.style.opacity = '0';
        root.style.transform = 'none';
        break;
      case 'slide-left':
        root.style.transform = 'translateX(100%)';
        root.style.opacity = '1';
        break;
      case 'slide-right':
        root.style.transform = 'translateX(-100%)';
        root.style.opacity = '1';
        break;
      case 'zoom-in':
        root.style.transform = 'scale(0.92)';
        root.style.opacity = '0';
        break;
    }
    // Force a reflow so the browser registers the entry state before we
    // swap transitions back on.
    void root.offsetHeight;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    root.style.transition = `opacity ${spec.durationMs}ms ease, transform ${spec.durationMs}ms ease`;
    root.style.opacity = '1';
    root.style.transform = 'none';
    await this.wait(spec.durationMs);
    // Clear inline styles so they don't interfere with future transitions
    // or any CSS the app might apply.
    root.style.transition = '';
    root.style.opacity = '';
    root.style.transform = '';
  }

  private renderSceneOnly(scene: Scene): void {
    this.presenter.clear();
    this.currentHandle = this.presenter.present(scene.primitive);
    this.events.onSceneEnter?.(scene, this.sceneIndex);
  }

  private teardownScene(): void {
    this.sceneEpoch++;
    if (this.sceneTimer !== null) {
      window.clearTimeout(this.sceneTimer);
      this.sceneTimer = null;
    }
    for (const id of this.beatTimers) window.clearTimeout(id);
    this.beatTimers = [];
    this.pendingBeats = [];
    this.narrationSettled = false;
    this.activeNarration = null;
    this.pendingFinalClose = false;
    this.voice.stop();
    this.presenter.hideLottie();
    this.currentHandle?.dismiss();
    this.currentHandle = null;
  }

  private end(): void {
    this.teardownScene();
    this.phase = 'ended';
    this.setState('ended');
    this.events.onEnd?.();
  }

  private setState(s: PlayerState): void {
    if (this._state === s) return;
    this._state = s;
    this.events.onStateChange?.(s);
  }
}

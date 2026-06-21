import { useCallback, useEffect, useRef, useState } from 'react';
import { Presentation } from './react/Presentation';
import type { Presenter } from './service/presenter';
import {
  ScriptPlayer,
  StubVoicePlayer,
  WebSpeechVoicePlayer,
  GoogleCloudVoicePlayer,
  PrerenderedAudioVoicePlayer,
  type PlayerState,
  type PresentationScript,
  type VoicePlayer,
} from './player';
import type { CaptureHandle } from './player/capture/captureMode';
import {
  fetchViewerScript,
  ViewerAuthError,
  ViewerForbiddenError,
  ViewerNotFoundError,
} from './pipeline/api';

// Capture mode is detected client-side only. Doing this at module scope
// breaks SSR hydration: server renders with capture=false, client renders
// with capture=true, React errors on the data-render-mode mismatch and
// bails out of hydrating the subtree (which means setupCaptureMode never
// runs and the recorder hangs at __capture.ready). Detection now lives
// inside a useEffect that fires post-hydration.
function detectCaptureMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('renderMode') === 'capture';
  } catch {
    return false;
  }
}

/**
 * Viewer-mode surface — read-only Script playback, cross-origin safe.
 *
 * Zero author affordances: no PipelinePanel, no TriageModal, no flag
 * button, no sample-script loaders, no voice/wpm controls. No calls to
 * /api/triage, /api/analyze, /api/script, /api/auth/me, /api/credits,
 * or /api/notes — just the single replay fetch.
 *
 * Route: /viewer/:scriptId (?token=… for unlisted). See
 * docs/lenzon/EMBED-AND-AUTH-PLAN.md.
 */

type VoiceMode = 'off' | 'webspeech' | 'google-neural2' | 'google-chirp3';
// Guarded for non-Vite hosts (e.g. Next SSR) where `import.meta.env` is undefined.
const SERVER_URL = ((import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL ?? '').replace(/\/$/, '');

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: 'not_found' | 'unauthorized' | 'forbidden' | 'unknown'; message?: string }
  | { kind: 'ready'; script: PresentationScript };

interface ViewerProps {
  scriptId: string;
  token: string | null;
  /**
   * Render-worker capture token. When set, the script-fetch endpoint
   * grants one-shot read access to the recorder for an otherwise-private
   * script. Distinct from `token` (the share token) so the two systems
   * can't collide. Only ever set when the URL has `?renderMode=capture`.
   */
  captureToken?: string | null;
  /**
   * Voice engine. Defaults to 'off' (silent stub) — embeds on unknown
   * pages shouldn't autoplay audio by surprise. Hosts that want voice
   * can pass their preferred engine.
   */
  voice?: VoiceMode;
  wordsPerMinute?: number;
  /**
   * Chrome mode for the viewer's own controls.
   *  - 'full' (default): render the built-in `.sb-toolbar`
   *    (play/pause/prev/next + position label). Used by the bare
   *    /viewer/[id] route and standalone embeds.
   *  - 'minimal': suppress the built-in toolbar. Used when an outer shell
   *    (ViewerShell) owns the chrome and supplies its own controls, so the
   *    two don't stack. Playback still works via user gesture once the
   *    shell wires controls; until then the viewer plays on `play()` only.
   * Loading/error status and the stage host are unaffected by this prop.
   */
  chrome?: 'full' | 'minimal';
  /**
   * Scene-position subscription. Fired whenever the active scene changes
   * (and once on player mount). Lets an outer shell (ViewerShell) render a
   * live scene list / progress without owning the player. Mirrors the
   * internal `scenePos` state.
   */
  onScenePos?: (pos: { index: number; total: number; id: string }) => void;
  /**
   * Control surface handoff. Called once the ScriptPlayer is mounted, with
   * the player's navigation methods, so an outer shell can drive playback
   * (e.g. a clickable scene list calling `seek(index)`). `seek` maps to
   * ScriptPlayer.seek — a direct jump to a scene index (or id). Called again
   * with `null` on player teardown so the shell can drop stale handles.
   */
  onControls?: (
    controls: {
      seek: (target: number | string) => void;
      next: () => void;
      prev: () => void;
      play: () => void;
      pause: () => void;
    } | null,
  ) => void;
}

export function Viewer({
  scriptId,
  token,
  captureToken = null,
  voice = 'off',
  wordsPerMinute = 150,
  chrome = 'full',
  onScenePos,
  onControls,
}: ViewerProps) {
  const presenterRef = useRef<Presenter | null>(null);
  const playerRef = useRef<ScriptPlayer | null>(null);
  // Stash the shell callbacks in refs so the player-mount effect doesn't list
  // them as deps (a new closure each render would otherwise tear down and
  // rebuild the player). The effect reads .current at fire time.
  const onScenePosRef = useRef(onScenePos);
  onScenePosRef.current = onScenePos;
  const onControlsRef = useRef(onControls);
  onControlsRef.current = onControls;
  // captureHandleRef holds the bridge once setupCaptureMode resolves. The
  // player-mount effect reads it via the ref so it doesn't have to
  // re-trigger when the handle arrives.
  const captureHandleRef = useRef<CaptureHandle | null>(null);
  const [presenterReady, setPresenterReady] = useState(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [scenePos, setScenePos] = useState<{ index: number; total: number; id: string }>({
    index: 0,
    total: 0,
    id: '',
  });
  // SSR renders with capture=false; client first-render also returns false
  // (the initializer is identical on both sides). The useEffect below
  // flips it to the URL-derived value on the client, triggering a second
  // render. This avoids the data-render-mode hydration mismatch.
  const [captureMode, setCaptureMode] = useState(false);

  useEffect(() => {
    const isCapture = detectCaptureMode();
    if (!isCapture) return;
    setCaptureMode(true);
    // Dynamic import keeps @sinonjs/fake-timers (~25 KB) out of the
    // default viewer bundle.
    let cancelled = false;
    void import('./player/capture/captureMode').then((m) => {
      if (cancelled) return;
      captureHandleRef.current = m.setupCaptureMode();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReady = useCallback((presenter: Presenter) => {
    presenterRef.current = presenter;
    setPresenterReady(true);
  }, []);

  // Fetch once per scriptId/token/captureToken.
  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    fetchViewerScript(scriptId, token, captureToken)
      .then((script) => {
        if (cancelled) return;
        setLoad({ kind: 'ready', script });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ViewerNotFoundError) {
          setLoad({ kind: 'error', status: 'not_found' });
        } else if (err instanceof ViewerAuthError) {
          setLoad({ kind: 'error', status: 'unauthorized' });
        } else if (err instanceof ViewerForbiddenError) {
          setLoad({ kind: 'error', status: 'forbidden' });
        } else {
          setLoad({
            kind: 'error',
            status: 'unknown',
            message: (err as Error).message,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId, token, captureToken]);

  // Mount the ScriptPlayer once both the presenter and the script are
  // available. Teardown on unmount.
  useEffect(() => {
    if (!presenterReady) return;
    if (load.kind !== 'ready') return;
    const p = presenterRef.current;
    if (!p) return;

    const script = load.script;

    // Pre-rendered audio is the default path. The `voice` prop now names
    // the FALLBACK engine used for scenes without a narrationAudioUrl
    // (legacy scripts, in-flight renders, or failed renders). When the
    // host asks for silence (`voice='off'`) we skip the audio layer
    // entirely and play silent timers via StubVoicePlayer — matches the
    // prior behavior where 'off' meant "no sound."
    //
    // Capture mode forces PrerenderedAudioVoicePlayer into silent mode
    // regardless of `voice`: the recorder muxes audio in post from the
    // per-scene MP3s, so the page itself shouldn't instantiate any
    // <audio> elements.
    const voicePlayer: VoicePlayer = captureMode
      ? new PrerenderedAudioVoicePlayer({ silent: true, wordsPerMinute })
      : voice === 'off'
        ? new StubVoicePlayer()
        : new PrerenderedAudioVoicePlayer({
            fallback:
              voice === 'webspeech'
                ? new WebSpeechVoicePlayer({ lang: 'en-US', wordsPerMinute })
                : new GoogleCloudVoicePlayer({
                    serverUrl: SERVER_URL,
                    wordsPerMinute,
                    // Match the live fallback voice to the script's chosen
                    // voice so a Chirp script doesn't play Neural-2 live
                    // until pre-render lands.
                    voiceName: script.defaults.voice.voiceId,
                  }),
            wordsPerMinute,
          });


    const player = new ScriptPlayer(script, p, voicePlayer, {
      onSceneEnter: (scene, index) => {
        const pos = { index, total: script.scenes.length, id: scene.id };
        setScenePos(pos);
        onScenePosRef.current?.(pos);
      },
      onStateChange: setPlayerState,
    });
    playerRef.current = player;

    // Hand the shell a stable control surface so it can drive playback
    // (clickable scene list → seek). Cleared on teardown below.
    onControlsRef.current?.({
      seek: (target) => player.seek(target),
      next: () => player.next(),
      prev: () => player.prev(),
      play: () => player.play(),
      pause: () => player.pause(),
    });

    // Hook the capture bridge to the running player. The capture-mode
    // effect dynamic-imports captureMode.ts and stores the handle on the
    // ref; we poll briefly here in case this effect fires before that
    // import resolves. Recorder needs scene events to build the timeline
    // and `state === 'ended'` to terminate.
    if (captureMode) {
      const tryRegister = (attempt = 0): void => {
        const handle = captureHandleRef.current;
        if (handle) {
          handle.registerPlayer(player, script);
          // Auto-play in capture mode. Browser launch flag
          // --autoplay-policy=no-user-gesture-required (set by the
          // recorder) means this won't be blocked.
          player.play();
          return;
        }
        if (attempt > 100) {
          // ~10s with 100ms intervals; if the handle never landed,
          // something is broken upstream and we shouldn't silently hang.
          console.error('[Viewer] capture handle never resolved');
          return;
        }
        window.setTimeout(() => tryRegister(attempt + 1), 100);
      };
      tryRegister();
    }
    const initialPos = {
      index: 0,
      total: script.scenes.length,
      id: script.scenes[0]?.id ?? '',
    };
    setScenePos(initialPos);
    onScenePosRef.current?.(initialPos);

    return () => {
      player.stop();
      playerRef.current = null;
      onControlsRef.current?.(null);
    };
  }, [presenterReady, load, voice, wordsPerMinute, captureMode]);

  const play = () => playerRef.current?.play();
  const pause = () => playerRef.current?.pause();
  const next = () => playerRef.current?.next();
  const prev = () => playerRef.current?.prev();

  return (
    <div
      className="sb-app sb-viewer"
      data-render-mode={captureMode ? 'capture' : undefined}
    >
      {load.kind === 'loading' && (
        <div className="sb-viewer-status">Loading…</div>
      )}
      {load.kind === 'error' && (
        <div className="sb-viewer-status sb-viewer-error">
          {errorCopy(load.status, load.message)}
        </div>
      )}
      {load.kind === 'ready' && chrome === 'full' && (
        <header className="sb-toolbar">
          <div className="sb-toolbar-group">
            <button
              disabled={!presenterReady || playerState === 'playing'}
              onClick={play}
            >
              ▶ play
            </button>
            <button
              disabled={playerState !== 'playing'}
              onClick={pause}
            >
              ❚❚ pause
            </button>
            <button disabled={!presenterReady} onClick={prev}>
              ◀ prev
            </button>
            <button disabled={!presenterReady} onClick={next}>
              next ▶
            </button>
            {scenePos.total > 0 && (
              <span className="sb-toolbar-label">
                {scenePos.index + 1}/{scenePos.total} · {playerState}
              </span>
            )}
          </div>
        </header>
      )}
      <main className="sb-stage-host">
        <Presentation onReady={handleReady} />
        {/* Minimal-chrome mode (shell-wrapped or bare embed) hides the full
            toolbar above, but the player still needs a play affordance —
            nothing autoplays outside capture mode. This compact bar overlays
            the bottom of the stage so a framed mini-player is immediately
            playable without the full toolbar competing with the shell. */}
        {load.kind === 'ready' && chrome === 'minimal' && !captureMode && (
          <div className="sb-viewer-minibar">
            <button
              className="sb-viewer-minibar-btn sb-viewer-minibar-btn-play"
              disabled={!presenterReady}
              onClick={playerState === 'playing' ? pause : play}
              aria-label={playerState === 'playing' ? 'Pause' : 'Play'}
            >
              {playerState === 'playing' ? '❚❚' : '▶'}
            </button>
            <button
              className="sb-viewer-minibar-btn"
              disabled={!presenterReady}
              onClick={prev}
              aria-label="Previous scene"
            >
              ◀
            </button>
            <button
              className="sb-viewer-minibar-btn"
              disabled={!presenterReady}
              onClick={next}
              aria-label="Next scene"
            >
              ▶
            </button>
            {scenePos.total > 0 && (
              <span className="sb-viewer-minibar-label">
                {scenePos.index + 1}/{scenePos.total}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function errorCopy(
  status: 'not_found' | 'unauthorized' | 'forbidden' | 'unknown',
  message?: string,
): string {
  switch (status) {
    case 'not_found':
      return 'Script not found.';
    case 'unauthorized':
      return 'This script is unlisted. A share link with a valid token is required.';
    case 'forbidden':
      return 'The share token is invalid or has been rotated.';
    default:
      return message ? `Error loading script: ${message}` : 'Error loading script.';
  }
}

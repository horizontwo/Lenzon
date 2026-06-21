'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Presentation,
  Presenter,
  type TextBoxHandle,
  getTemplate,
  type TemplateHandle,
  ScriptPlayer,
  StubVoicePlayer,
  WebSpeechVoicePlayer,
  GoogleCloudVoicePlayer,
  sampleScripts,
  type PlayerState,
  type PresentationScript,
  type VoicePlayer,
} from '@lenzon/player';
import { PipelinePanel } from '@lenzon/player/pipeline/PipelinePanel';
import { postNote } from '@lenzon/player/pipeline/api';
import '@lenzon/player/styles.css';

type VoiceMode = 'off' | 'webspeech' | 'google-neural2' | 'google-chirp3';
// Next.js host serves the API on the same origin.
const SERVER_URL = '';

type StackStamp = {
  producerVersion: string;
  templateVersions: Record<string, string>;
};

export default function StudioClient() {
  const presenterRef = useRef<Presenter | null>(null);
  const lastBoxRef = useRef<TextBoxHandle | null>(null);
  const lastTemplateRef = useRef<TemplateHandle | null>(null);
  const playerRef = useRef<ScriptPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [scenePos, setScenePos] = useState<{ index: number; total: number; id: string }>({
    index: 0,
    total: 0,
    id: '',
  });
  const [loadedScript, setLoadedScript] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('off');
  const [wpm, setWpm] = useState(150);
  const [stackStamp, setStackStamp] = useState<StackStamp | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stack-stamp')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StackStamp | null) => {
        if (!cancelled && data) setStackStamp(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const currentScriptRef = useRef<PresentationScript | null>(null);
  const currentScriptIdRef = useRef<string | null>(null);
  const currentAnalysisIdRef = useRef<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState('');
  const [flagSuspect, setFlagSuspect] = useState<
    'analysis' | 'script' | 'template' | null
  >(null);
  const [flagSaving, setFlagSaving] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flagSaved, setFlagSaved] = useState<string | null>(null);

  const handleReady = useCallback((presenter: Presenter) => {
    presenterRef.current = presenter;
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, []);

  const teardownPlayer = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlayerState('idle');
  };

  const clearAll = () => {
    lastTemplateRef.current?.dismiss();
    lastBoxRef.current?.dismiss();
    lastBoxRef.current = null;
    lastTemplateRef.current = null;
    presenterRef.current?.clear();
  };

  const loadScriptObject = useCallback(
    (
      script: PresentationScript,
      label: string,
      meta?: { scriptId?: string | null; analysisId?: string | null },
    ) => {
      const p = presenterRef.current;
      if (!p) return;
      teardownPlayer();
      clearAll();

      const voice: VoicePlayer =
        voiceMode === 'webspeech'
          ? new WebSpeechVoicePlayer({ lang: 'en-US', wordsPerMinute: wpm })
          : voiceMode === 'google-neural2' || voiceMode === 'google-chirp3'
            ? new GoogleCloudVoicePlayer({
                serverUrl: SERVER_URL,
                wordsPerMinute: wpm,
                voiceName:
                  voiceMode === 'google-chirp3'
                    ? 'en-US-Chirp3-HD-Erinome'
                    : 'en-US-Neural2-F',
              })
            : new StubVoicePlayer();
      const player = new ScriptPlayer(script, p, voice, {
        onSceneEnter: (scene, index) =>
          setScenePos({ index, total: script.scenes.length, id: scene.id }),
        onStateChange: setPlayerState,
      });
      playerRef.current = player;
      currentScriptRef.current = script;
      currentScriptIdRef.current = meta?.scriptId ?? null;
      currentAnalysisIdRef.current = meta?.analysisId ?? null;
      setLoadedScript(label);
      setScenePos({ index: 0, total: script.scenes.length, id: script.scenes[0]?.id ?? '' });
    },
    [voiceMode, wpm],
  );

  const loadScript = (key: keyof typeof sampleScripts) => {
    loadScriptObject(sampleScripts[key], key);
  };

  const openFlag = () => {
    if (!loadedScript) return;
    playerRef.current?.pause();
    setFlagText('');
    setFlagSuspect(null);
    setFlagError(null);
    setFlagSaved(null);
    setFlagOpen(true);
  };

  const submitFlag = async () => {
    const script = currentScriptRef.current;
    if (!script) return;
    const scriptId = currentScriptIdRef.current;
    if (!scriptId) {
      setFlagError('flagging requires a persisted script (sample scripts cannot be flagged)');
      return;
    }
    const text = flagText.trim();
    if (!text) {
      setFlagError('note is required');
      return;
    }
    const scene = script.scenes[scenePos.index];
    if (!scene) {
      setFlagError('no active scene');
      return;
    }
    setFlagSaving(true);
    setFlagError(null);
    try {
      const templateId = scene.primitive?.template ?? 'unknown';
      const saved = await postNote({
        scriptId,
        scriptLabel: loadedScript,
        analysisId: currentAnalysisIdRef.current,
        repoUrl: script.meta?.repoUrl ?? null,
        sceneIndex: scenePos.index,
        sceneId: scene.id,
        sceneTemplate: templateId,
        note: text,
        suspectArea: flagSuspect,
        templateVersionAtCapture: getTemplate(templateId)?.version ?? null,
      });
      setFlagSaved(saved.id);
      setFlagOpen(false);
    } catch (e) {
      setFlagError((e as Error).message);
    } finally {
      setFlagSaving(false);
    }
  };

  const playerPlay = () => playerRef.current?.play();
  const playerPause = () => playerRef.current?.pause();
  const playerNext = () => playerRef.current?.next();
  const playerPrev = () => playerRef.current?.prev();
  const playerStop = () => {
    playerRef.current?.stop();
    setLoadedScript(null);
  };

  return (
    <div className="sb-app">
      <header className="sb-toolbar">
        <h1>Lenzon</h1>
        <div className="sb-toolbar-group">
          <span className="sb-toolbar-label">Script</span>
          <label
            className="sb-toolbar-label"
            title="Voice engine. Takes effect on next script load."
          >
            voice
            <select
              disabled={!ready}
              value={voiceMode}
              onChange={(e) => setVoiceMode(e.target.value as VoiceMode)}
              style={{ marginLeft: 6 }}
            >
              <option value="off">off (stub)</option>
              <option value="webspeech">browser (Web Speech)</option>
              <option value="google-chirp3">Google Chirp 3 HD (Erinome)</option>
              <option value="google-neural2">Google Neural2</option>
            </select>
          </label>
          <label className="sb-toolbar-label" title="Lower wpm = scenes hold longer to let slower voices finish.">
            wpm
            <input
              type="number"
              min={100}
              max={260}
              step={5}
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value))}
              style={{ width: 64, marginLeft: 6 }}
            />
          </label>
          <button disabled={!ready} onClick={() => loadScript('quick')}>
            load: quick
          </button>
          <button disabled={!ready} onClick={() => loadScript('mixed')}>
            load: mixed
          </button>
          <button disabled={!ready} onClick={() => loadScript('beatHeavy')}>
            load: beat-heavy
          </button>
          <button disabled={!loadedScript || playerState === 'playing'} onClick={playerPlay}>
            ▶ play
          </button>
          <button disabled={playerState !== 'playing'} onClick={playerPause}>
            ❚❚ pause
          </button>
          <button disabled={!loadedScript} onClick={playerPrev}>
            ◀ prev
          </button>
          <button disabled={!loadedScript} onClick={playerNext}>
            next ▶
          </button>
          <button disabled={!loadedScript} onClick={playerStop}>
            stop
          </button>
          <button
            disabled={!loadedScript}
            onClick={openFlag}
            title="Pause and capture a note about the current scene."
          >
            🚩 flag
          </button>
          {flagSaved && (
            <span className="sb-toolbar-label" style={{ color: '#6ee7b7' }}>
              note saved
            </span>
          )}
          {loadedScript && (
            <span className="sb-toolbar-label">
              [{loadedScript}] {scenePos.index + 1}/{scenePos.total} · {scenePos.id} ·{' '}
              {playerState}
            </span>
          )}
        </div>
        <div className="sb-toolbar-group">
          <button disabled={!ready} onClick={clearAll}>clear</button>
          <a
            href="/studio2"
            className="sb-toolbar-label"
            style={{ textDecoration: 'underline' }}
          >
            ← /studio2
          </a>
        </div>
      </header>
      <PipelinePanel
        canPlay={ready}
        onPlayScript={(s, meta) => loadScriptObject(s, 'pipeline', meta)}
      />
      <StackStampStrip
        stamp={stackStamp}
        sceneTemplateId={
          currentScriptRef.current?.scenes[scenePos.index]?.primitive?.template ?? null
        }
      />
      <main className="sb-stage-host">
        <Presentation onReady={handleReady} />
      </main>
      {flagOpen && (
        <div className="sb-flag-backdrop" onClick={() => !flagSaving && setFlagOpen(false)}>
          <div className="sb-flag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sb-flag-title">🚩 Flag this scene</div>
            <div className="sb-flag-context">
              <div>
                <span className="sb-flag-key">script:</span> {loadedScript ?? '—'}
              </div>
              <div>
                <span className="sb-flag-key">scene:</span> {scenePos.index + 1}/
                {scenePos.total} · {scenePos.id}
              </div>
              <div>
                <span className="sb-flag-key">template:</span>{' '}
                {currentScriptRef.current?.scenes[scenePos.index]?.primitive?.template ??
                  'unknown'}
                {(() => {
                  const tid =
                    currentScriptRef.current?.scenes[scenePos.index]?.primitive?.template;
                  const ver = tid ? getTemplate(tid)?.version : null;
                  return ver ? ` @ ${ver}` : '';
                })()}
              </div>
              {stackStamp && (
                <div>
                  <span className="sb-flag-key">producer:</span>{' '}
                  {stackStamp.producerVersion}
                </div>
              )}
              {currentScriptIdRef.current && (
                <div>
                  <span className="sb-flag-key">scriptId:</span>{' '}
                  {currentScriptIdRef.current}
                </div>
              )}
              {currentAnalysisIdRef.current && (
                <div>
                  <span className="sb-flag-key">analysisId:</span>{' '}
                  {currentAnalysisIdRef.current}
                </div>
              )}
            </div>
            <div className="sb-flag-suspect">
              <span className="sb-flag-suspect-label">suspect:</span>
              {(['analysis', 'script', 'template'] as const).map((area) => (
                <button
                  key={area}
                  type="button"
                  className={`sb-flag-suspect-pill${flagSuspect === area ? ' sb-flag-suspect-pill-on' : ''}`}
                  onClick={() => setFlagSuspect(flagSuspect === area ? null : area)}
                >
                  {area}
                </button>
              ))}
              <span className="sb-flag-suspect-hint">
                {flagSuspect ? '' : '(optional — leave blank if unsure)'}
              </span>
            </div>
            <textarea
              className="sb-flag-textarea"
              placeholder="What's wrong? (e.g. 'word too small', 'nothing rendered', 'text cut off')"
              autoFocus
              value={flagText}
              onChange={(e) => setFlagText(e.target.value)}
              rows={5}
            />
            {flagError && <div className="sb-flag-error">{flagError}</div>}
            <div className="sb-flag-actions">
              <button
                disabled={flagSaving}
                onClick={() => setFlagOpen(false)}
              >
                cancel
              </button>
              <button
                disabled={flagSaving || !flagText.trim()}
                onClick={submitFlag}
              >
                {flagSaving ? 'saving…' : 'save note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StackStampStrip({
  stamp,
  sceneTemplateId,
}: {
  stamp: StackStamp | null;
  sceneTemplateId: string | null;
}) {
  if (!stamp) return null;
  const sceneVersion = sceneTemplateId
    ? (stamp.templateVersions[sceneTemplateId] ?? null)
    : null;
  return (
    <div className="sb-stack-stamp">
      <span className="sb-stack-stamp-label">stack</span>
      <span className="sb-stack-stamp-item">
        <span className="sb-stack-stamp-key">producer</span>
        <code>{stamp.producerVersion}</code>
      </span>
      {sceneTemplateId ? (
        <span className="sb-stack-stamp-item">
          <span className="sb-stack-stamp-key">template</span>
          <code>
            {sceneTemplateId}
            {sceneVersion ? `@${sceneVersion}` : ''}
          </code>
        </span>
      ) : (
        <span className="sb-stack-stamp-item sb-stack-stamp-muted">
          load a script to see the scene's template version
        </span>
      )}
    </div>
  );
}

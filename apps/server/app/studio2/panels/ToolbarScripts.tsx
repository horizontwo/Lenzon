'use client';

import { useStudio } from '../StudioProvider';
import type { useScriptPlayer } from '../hooks/useScriptPlayer';

type PlayerApi = ReturnType<typeof useScriptPlayer>;

export function ToolbarScripts({
  player,
  onOpenFlag,
  onOpenExport,
}: {
  player: PlayerApi;
  onOpenFlag: () => void;
  onOpenExport: () => void;
}) {
  const { ready } = useStudio();
  const {
    playerState,
    scenePos,
    loadedScript,
    loadedScriptId,
    voiceMode,
    setVoiceMode,
    wpm,
    setWpm,
    play,
    pause,
    next,
    prev,
    stop,
  } = player;

  return (
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
          onChange={(e) =>
            setVoiceMode(e.target.value as PlayerApi['voiceMode'])
          }
          style={{ marginLeft: 6 }}
        >
          <option value="off">off (stub)</option>
          <option value="webspeech">browser (Web Speech)</option>
          <option value="google-chirp3">Google Chirp 3 HD (Erinome)</option>
          <option value="google-neural2">Google Neural2</option>
        </select>
      </label>
      <label
        className="sb-toolbar-label"
        title="Lower wpm = scenes hold longer to let slower voices finish."
      >
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
      <button
        disabled={!loadedScript || playerState === 'playing'}
        onClick={play}
      >
        ▶ play
      </button>
      <button disabled={playerState !== 'playing'} onClick={pause}>
        ❚❚ pause
      </button>
      <button disabled={!loadedScript} onClick={prev}>
        ◀ prev
      </button>
      <button disabled={!loadedScript} onClick={next}>
        next ▶
      </button>
      <button disabled={!loadedScript} onClick={stop}>
        stop
      </button>
      <button
        disabled={!loadedScript}
        onClick={onOpenFlag}
        title="Pause and capture a note about the current scene."
      >
        🚩 flag
      </button>
      <button
        disabled={!loadedScriptId}
        onClick={onOpenExport}
        title="Render this script to MP4 (admin only — runs a Fargate worker)."
      >
        ⤓ export
      </button>
      {loadedScript && (
        <span className="sb-toolbar-label">
          [{loadedScript}] {scenePos.index + 1}/{scenePos.total} ·{' '}
          {scenePos.id} · {playerState}
        </span>
      )}
    </div>
  );
}

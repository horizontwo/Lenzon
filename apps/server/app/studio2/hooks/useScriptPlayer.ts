'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleCloudVoicePlayer,
  ScriptPlayer,
  StubVoicePlayer,
  WebSpeechVoicePlayer,
  type PlayerState,
  type PresentationScript,
  type VoicePlayer,
} from '@lenzon/player';
import { useStudio } from '../StudioProvider';

export type VoiceMode = 'off' | 'webspeech' | 'google-neural2' | 'google-chirp3';

export type ScenePos = { index: number; total: number; id: string };

export type CapturedStamp = {
  producerVersion: string | null;
  templateVersions: Record<string, string> | null;
};

// Next.js host serves the API on the same origin.
const SERVER_URL = '';

function buildVoicePlayer(mode: VoiceMode, wpm: number): VoicePlayer {
  if (mode === 'webspeech') {
    return new WebSpeechVoicePlayer({ lang: 'en-US', wordsPerMinute: wpm });
  }
  if (mode === 'google-neural2' || mode === 'google-chirp3') {
    return new GoogleCloudVoicePlayer({
      serverUrl: SERVER_URL,
      wordsPerMinute: wpm,
      voiceName:
        mode === 'google-chirp3'
          ? 'en-US-Chirp3-HD-Erinome'
          : 'en-US-Neural2-F',
    });
  }
  return new StubVoicePlayer();
}

export function useScriptPlayer() {
  const {
    presenterRef,
    currentScriptRef,
    currentScriptIdRef,
    currentAnalysisIdRef,
    clearAll,
  } = useStudio();

  const playerRef = useRef<ScriptPlayer | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [scenePos, setScenePos] = useState<ScenePos>({
    index: 0,
    total: 0,
    id: '',
  });
  const [loadedScript, setLoadedScript] = useState<string | null>(null);
  const [loadedScriptId, setLoadedScriptId] = useState<string | null>(null);
  const [capturedStamp, setCapturedStamp] = useState<CapturedStamp | null>(
    null,
  );
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('google-chirp3');
  const [wpm, setWpm] = useState(150);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, []);

  const teardown = useCallback(() => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlayerState('idle');
  }, []);

  const loadScriptObject = useCallback(
    (
      script: PresentationScript,
      label: string,
      meta?: {
        scriptId?: string | null;
        analysisId?: string | null;
        capturedStamp?: CapturedStamp | null;
      },
    ) => {
      const presenter = presenterRef.current;
      if (!presenter) return;
      teardown();
      clearAll();

      const voice = buildVoicePlayer(voiceMode, wpm);
      const player = new ScriptPlayer(script, presenter, voice, {
        onSceneEnter: (scene, index) =>
          setScenePos({ index, total: script.scenes.length, id: scene.id }),
        onStateChange: setPlayerState,
      });
      playerRef.current = player;
      currentScriptRef.current = script;
      currentScriptIdRef.current = meta?.scriptId ?? null;
      currentAnalysisIdRef.current = meta?.analysisId ?? null;
      setCapturedStamp(meta?.capturedStamp ?? null);
      setLoadedScript(label);
      setLoadedScriptId(meta?.scriptId ?? null);
      setScenePos({
        index: 0,
        total: script.scenes.length,
        id: script.scenes[0]?.id ?? '',
      });
    },
    [
      presenterRef,
      currentScriptRef,
      currentScriptIdRef,
      currentAnalysisIdRef,
      clearAll,
      teardown,
      voiceMode,
      wpm,
    ],
  );

  const play = useCallback(() => playerRef.current?.play(), []);
  const pause = useCallback(() => playerRef.current?.pause(), []);
  const next = useCallback(() => playerRef.current?.next(), []);
  const prev = useCallback(() => playerRef.current?.prev(), []);
  const stop = useCallback(() => {
    playerRef.current?.stop();
    setLoadedScript(null);
    setLoadedScriptId(null);
    setCapturedStamp(null);
  }, []);

  return {
    playerRef,
    playerState,
    scenePos,
    loadedScript,
    loadedScriptId,
    capturedStamp,
    voiceMode,
    setVoiceMode,
    wpm,
    setWpm,
    loadScriptObject,
    play,
    pause,
    next,
    prev,
    stop,
  };
}

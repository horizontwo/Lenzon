import { useCallback, useEffect, useRef, useState } from 'react';
import { Presentation } from '../react/Presentation';
import type { Presenter } from '../service/presenter';
import { ScriptPlayer, type PlayerState } from '../player/ScriptPlayer';
import { PrerenderedAudioVoicePlayer } from '../player/PrerenderedAudioVoicePlayer';
import { StubVoicePlayer, WebSpeechVoicePlayer, type VoicePlayer } from '../player/VoicePlayer';
import type { PresentationScript } from '../player/types';
import { getTemplate } from '../templates';

type Load =
  | { kind: 'loading' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'ready'; script: PresentationScript };

/**
 * Plays the one script the command serves at `script.json`.
 *
 * The command only checks that the file is JSON with scenes. The template
 * check happens here, because only the page has the registry. A script
 * naming an unknown template is listed and never played, so a typo shows
 * up as a scene id rather than a blank stage halfway through.
 */
export function PlayApp() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [state, setState] = useState<PlayerState>('idle');
  const [scene, setScene] = useState(0);
  const playerRef = useRef<ScriptPlayer | null>(null);

  useEffect(() => {
    fetch('script.json', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`the command answered ${res.status}`);
        return res.text();
      })
      .then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          setLoad({ kind: 'invalid', problems: [`The file is not valid JSON: ${(err as Error).message}`] });
          return;
        }
        const problems = checkScript(parsed);
        setLoad(problems.length ? { kind: 'invalid', problems } : { kind: 'ready', script: parsed as PresentationScript });
      })
      .catch((err: Error) => setLoad({ kind: 'invalid', problems: [`Could not load the script: ${err.message}`] }));
  }, []);

  const script = load.kind === 'ready' ? load.script : null;

  useEffect(() => {
    if (script) document.title = script.meta?.title || 'Lenzon player';
  }, [script]);

  const handleReady = useCallback(
    (presenter: Presenter) => {
      if (!script) return;
      playerRef.current = new ScriptPlayer(script, presenter, buildVoice(), {
        onSceneEnter: (_s, index) => setScene(index),
        onStateChange: setState,
      });
    },
    [script],
  );

  // Speech needs a click before it will start, so nothing plays until the
  // button is pressed. After that the button is pause and resume.
  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.state === 'playing') player.pause();
    else player.play();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  if (load.kind === 'loading') return <div className="lp-page" />;

  if (load.kind === 'invalid') {
    return (
      <div className="lp-page">
        <div className="lp-problems">
          <h1>This script cannot play yet</h1>
          <ul>
            {load.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p>Fix the file, then reload this page.</p>
        </div>
      </div>
    );
  }

  const total = load.script.scenes.length;
  return (
    <div className="lp-page">
      <div className="lp-stage">
        <Presentation onReady={handleReady} />
      </div>
      <div className="lp-controls">
        <button type="button" onClick={toggle}>
          {state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : state === 'ended' ? 'Play again' : 'Play'}
        </button>
        <span className="lp-count">
          {state === 'idle' ? `${total} scenes` : `Scene ${scene + 1} of ${total}`}
        </span>
        <span className="lp-title">{load.script.meta?.title}</span>
      </div>
    </div>
  );
}

/**
 * Audio files where a scene has one, and the browser's voice where it does
 * not. The prerendered player already falls back scene by scene, so a
 * script can mix the two. `?silent` plays on a timer with no voice at all.
 */
function buildVoice(): VoicePlayer {
  if (new URLSearchParams(window.location.search).has('silent')) return new StubVoicePlayer();
  let speech: VoicePlayer;
  try {
    speech = new WebSpeechVoicePlayer();
  } catch {
    speech = new StubVoicePlayer();
  }
  return new PrerenderedAudioVoicePlayer({ fallback: speech });
}

function checkScript(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['The file is not a JSON object.'];
  const scenes = (value as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return ['The script has no `scenes` list, or it is empty.'];

  const problems: string[] = [];
  scenes.forEach((s, i) => {
    const scene = s as { id?: unknown; primitive?: { template?: unknown } };
    const name = typeof scene.id === 'string' ? `Scene "${scene.id}"` : `Scene ${i + 1}`;
    const template = scene.primitive?.template;
    if (typeof template !== 'string') problems.push(`${name} has no \`primitive.template\`.`);
    else if (!getTemplate(template)) problems.push(`${name} names an unknown template, "${template}".`);
  });
  return problems;
}

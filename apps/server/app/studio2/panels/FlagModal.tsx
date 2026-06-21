'use client';

import { useState } from 'react';
import { getTemplate } from '@lenzon/player';
import { postNote } from '@lenzon/player/pipeline/api';
import { useStudio } from '../StudioProvider';
import type { ScenePos } from '../hooks/useScriptPlayer';

type Suspect = 'analysis' | 'script' | 'template';

export function FlagModal({
  open,
  onClose,
  onSaved,
  loadedScript,
  scenePos,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  loadedScript: string | null;
  scenePos: ScenePos;
}) {
  const { currentScriptRef, currentScriptIdRef, currentAnalysisIdRef } =
    useStudio();
  const [text, setText] = useState('');
  const [suspect, setSuspect] = useState<Suspect | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const script = currentScriptRef.current;
  const scene = script?.scenes[scenePos.index] ?? null;
  const templateId = scene?.primitive?.template ?? 'unknown';
  const templateVersion = templateId
    ? (getTemplate(templateId)?.version ?? null)
    : null;

  const resetAndClose = () => {
    setText('');
    setSuspect(null);
    setError(null);
    setSaving(false);
    onClose();
  };

  const submit = async () => {
    if (!script) return;
    const scriptId = currentScriptIdRef.current;
    if (!scriptId) {
      setError(
        'flagging requires a persisted script (sample scripts cannot be flagged)',
      );
      return;
    }
    const body = text.trim();
    if (!body) {
      setError('note is required');
      return;
    }
    if (!scene) {
      setError('no active scene');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await postNote({
        scriptId,
        scriptLabel: loadedScript,
        analysisId: currentAnalysisIdRef.current,
        repoUrl: script.meta?.repoUrl ?? null,
        sceneIndex: scenePos.index,
        sceneId: scene.id,
        sceneTemplate: templateId,
        note: body,
        suspectArea: suspect,
        templateVersionAtCapture: templateVersion,
      });
      onSaved(saved.id);
      resetAndClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="sb-flag-backdrop"
      onClick={() => !saving && resetAndClose()}
    >
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
            <span className="sb-flag-key">template:</span> {templateId}
            {templateVersion ? ` @ ${templateVersion}` : ''}
          </div>
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
              className={`sb-flag-suspect-pill${suspect === area ? ' sb-flag-suspect-pill-on' : ''}`}
              onClick={() => setSuspect(suspect === area ? null : area)}
            >
              {area}
            </button>
          ))}
          <span className="sb-flag-suspect-hint">
            {suspect ? '' : '(optional — leave blank if unsure)'}
          </span>
        </div>
        <textarea
          className="sb-flag-textarea"
          placeholder="What's wrong? (e.g. 'word too small', 'nothing rendered', 'text cut off')"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
        />
        {error && <div className="sb-flag-error">{error}</div>}
        <div className="sb-flag-actions">
          <button disabled={saving} onClick={resetAndClose}>
            cancel
          </button>
          <button disabled={saving || !text.trim()} onClick={submit}>
            {saving ? 'saving…' : 'save note'}
          </button>
        </div>
      </div>
    </div>
  );
}

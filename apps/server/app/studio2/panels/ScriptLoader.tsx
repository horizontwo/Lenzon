'use client';

import { useCallback, useEffect, useState } from 'react';
import { getScript, listScripts } from '@lenzon/player/pipeline/api';
import type { ScriptSummary } from '@lenzon/shared-types';
import { useStudio } from '../StudioProvider';
import type { useScriptPlayer } from '../hooks/useScriptPlayer';

type PlayerApi = ReturnType<typeof useScriptPlayer>;

export function ScriptLoader({ player }: { player: PlayerApi }) {
  const { ready } = useStudio();
  const [items, setItems] = useState<ScriptSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListError(null);
    try {
      const rows = await listScripts();
      setItems(rows);
      if (rows.length > 0 && !selectedId) setSelectedId(rows[0].id);
    } catch (e) {
      setListError((e as Error).message);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadSelected = async () => {
    if (!selectedId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const record = await getScript(selectedId);
      if (!record.data) {
        throw new Error(`script ${record.id} has no data (status=${record.status})`);
      }
      player.loadScriptObject(record.data, record.label || record.id, {
        scriptId: record.id,
        analysisId: record.analysisId,
        capturedStamp: {
          producerVersion: record.producerVersion,
          templateVersions: record.playerTemplateVersions,
        },
      });
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sb-toolbar-group">
      <span className="sb-toolbar-label">Saved scripts</span>
      <select
        className="sb-template-select"
        disabled={!ready || !items || items.length === 0}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {!items && <option value="">loading…</option>}
        {items && items.length === 0 && (
          <option value="">no saved scripts</option>
        )}
        {items?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.repoUrl} — {s.label || s.id} · {s.persona} · {s.status}
          </option>
        ))}
      </select>
      <button
        disabled={!ready || !selectedId || loading}
        onClick={loadSelected}
      >
        {loading ? 'loading…' : 'load'}
      </button>
      <button onClick={() => void refresh()} title="refresh list">
        ⟲
      </button>
      {listError && (
        <span className="sb-toolbar-label" style={{ color: '#f87171' }}>
          list failed: {listError}
        </span>
      )}
      {loadError && (
        <span className="sb-toolbar-label" style={{ color: '#f87171' }}>
          {loadError}
        </span>
      )}
    </div>
  );
}

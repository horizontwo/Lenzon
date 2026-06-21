'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationScript } from '@lenzon/shared-types';
import { parsePrUrl } from '@lenzon/player/pipeline/parsePrUrl';
import type { useScriptPlayer } from '../hooks/useScriptPlayer';

/**
 * Studio v2 "pr" tab — dev/test trigger for the PR explainer pipeline
 * (PR-EXPLAINER-LENS Phase 6/7). Posts (repoUrl, prNumber) to /api/pr/analyze,
 * polls /api/analyze/[id] for live phase transitions, surfaces both Managed
 * Agents session ids for cross-referencing, and offers a one-click
 * "render PresentationScript" step once the analysis row is ready.
 *
 * Public-repo PRs only in v1. Private-PR support is gated on the auth
 * substrate from Appendix A.
 */

type PlayerApi = ReturnType<typeof useScriptPlayer>;

interface ToolbarPrProps {
  player: PlayerApi;
  /** Switch the parent shell back to the scripts tab once a script loads,
   *  so the existing playback toolbar is visible. */
  onScriptLoaded: () => void;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'tracking'; analysisId: string }
  | { kind: 'error'; message: string };

interface AnalysisPoll {
  id: string;
  status: 'running' | 'ready' | 'error' | string;
  phase: 'cloning' | 'triaging' | 'analyzing' | null;
  error: string | null;
  data: unknown | null;
  // PR extras (additive; absent on repo-scan rows)
  kind?: 'pr' | 'repo';
  prNumber?: number | null;
  baseSha?: string | null;
  headSha?: string | null;
  analysisSessionId?: string | null;
  prTriageSessionId?: string | null;
  prTriageReport?: {
    changedFileCount?: number;
    approxChangedLines?: number;
    focusAreas?: Array<{ name: string }>;
  } | null;
}

const POLL_INTERVAL_MS = 2500;

export function ToolbarPr({ player, onScriptLoaded }: ToolbarPrProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [baseRef, setBaseRef] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [estimate, setEstimate] = useState<{
    credits: number;
    reasoning?: string;
  } | null>(null);
  const [poll, setPoll] = useState<AnalysisPoll | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<
    | { kind: 'idle' }
    | { kind: 'rendering' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (analysisId: string) => {
      stopPolling();
      const tick = async () => {
        try {
          const res = await fetch(`/api/analyze/${analysisId}`, {
            cache: 'no-store',
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const body = (await res.json()) as AnalysisPoll;
          setPoll(body);
          setPollError(null);
          if (body.status === 'running') {
            pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
          }
        } catch (e) {
          setPollError((e as Error).message);
          pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      void tick();
    },
    [stopPolling],
  );

  /** Pasting a full PR URL into repoUrl auto-splits it into repoUrl + prNumber. */
  const onRepoUrlChange = (value: string) => {
    const parsed = parsePrUrl(value);
    if (parsed) {
      setRepoUrl(parsed.repoUrl);
      setPrNumber(String(parsed.prNumber));
      return;
    }
    setRepoUrl(value);
  };

  const submit = async () => {
    // Accept a full PR URL in the repoUrl field as a fallback (e.g. if the
    // value was set programmatically and never went through onRepoUrlChange).
    const parsed = parsePrUrl(repoUrl);
    const effectiveRepoUrl = parsed ? parsed.repoUrl : repoUrl.trim();
    const n = parsed ? parsed.prNumber : Number(prNumber.trim());
    if (!effectiveRepoUrl || !Number.isInteger(n) || n <= 0) {
      setState({
        kind: 'error',
        message:
          'Enter a repoUrl + prNumber, or paste a full PR URL (…/pull/123).',
      });
      return;
    }
    setState({ kind: 'submitting' });
    setPoll(null);
    setPollError(null);
    setRenderState({ kind: 'idle' });
    try {
      const res = await fetch('/api/pr/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repoUrl: effectiveRepoUrl,
          prNumber: n,
          ...(baseRef.trim() ? { baseRef: baseRef.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        estimate?: { credits: number; reasoning?: string };
      };
      if (!res.ok || !body.id) {
        setState({
          kind: 'error',
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setEstimate(body.estimate ?? null);
      setState({ kind: 'tracking', analysisId: body.id });
      startPolling(body.id);
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const renderScript = async () => {
    if (state.kind !== 'tracking' || !poll || poll.status !== 'ready' || !poll.data) {
      return;
    }
    setRenderState({ kind: 'rendering' });
    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          analysis: poll.data,
          analysisId: poll.id,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        data?: PresentationScript;
        producerVersion?: string;
        playerTemplateVersions?: Record<string, string>;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !body.data) {
        throw new Error(body.error ?? body.detail ?? `HTTP ${res.status}`);
      }
      const label = `PR #${poll.prNumber ?? '?'} · ${poll.id.slice(-6)}`;
      try {
        player.loadScriptObject(body.data, label, {
          scriptId: body.id ?? null,
          analysisId: poll.id,
          capturedStamp: {
            producerVersion: body.producerVersion ?? null,
            templateVersions: body.playerTemplateVersions ?? null,
          },
        });
      } catch (e) {
        setRenderState({
          kind: 'error',
          message: `producer returned a script but the player rejected it: ${(e as Error).message}`,
        });
        return;
      }
      setRenderState({ kind: 'idle' });
      onScriptLoaded();
    } catch (e) {
      setRenderState({ kind: 'error', message: (e as Error).message });
    }
  };

  const busy = state.kind === 'submitting';
  const phaseLabel = poll
    ? poll.status === 'ready'
      ? 'ready'
      : poll.status === 'error'
        ? 'error'
        : (poll.phase ?? 'running')
    : null;
  const phaseColor =
    poll?.status === 'ready'
      ? '#6ee7b7'
      : poll?.status === 'error'
        ? '#f87171'
        : poll?.phase === 'analyzing'
          ? '#93c5fd'
          : poll?.phase === 'triaging'
            ? '#fbbf24'
            : '#aaa';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '4px 8px',
        minWidth: 480,
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          background: '#3a2a08',
          border: '1px solid #876225',
          borderRadius: 4,
          fontSize: 12,
          color: '#ffd591',
        }}
      >
        Private PRs not yet supported — see Appendix A.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 280 }}
        >
          <span className="sb-toolbar-label">repoUrl or PR URL</span>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => onRepoUrlChange(e.target.value)}
            placeholder="https://github.com/owner/repo  (or paste …/pull/123)"
            disabled={busy}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
          <span className="sb-toolbar-label">prNumber</span>
          <input
            type="number"
            inputMode="numeric"
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
            placeholder="638"
            disabled={busy}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', width: 140 }}>
          <span className="sb-toolbar-label">baseRef (optional)</span>
          <input
            type="text"
            value={baseRef}
            onChange={(e) => setBaseRef(e.target.value)}
            placeholder="main"
            disabled={busy}
          />
        </label>
        <button onClick={submit} disabled={busy} style={{ alignSelf: 'flex-end' }}>
          {busy ? 'starting…' : 'run'}
        </button>
      </div>
      {state.kind === 'tracking' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '6px 10px',
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 4,
            fontSize: 12,
            color: '#cbd5e1',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>
              analysisId: <code style={{ userSelect: 'all' }}>{state.analysisId}</code>
            </span>
            {phaseLabel && (
              <span
                style={{
                  color: phaseColor,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {phaseLabel}
              </span>
            )}
            {estimate && (
              <span style={{ color: '#888' }}>
                reserved {estimate.credits} credits
              </span>
            )}
          </div>
          {poll?.prTriageSessionId && (
            <div>
              triage session:{' '}
              <code style={{ userSelect: 'all' }}>{poll.prTriageSessionId}</code>
            </div>
          )}
          {poll?.analysisSessionId &&
            poll.analysisSessionId !== poll.prTriageSessionId && (
              <div>
                analysis session:{' '}
                <code style={{ userSelect: 'all' }}>{poll.analysisSessionId}</code>
              </div>
            )}
          {poll?.prTriageReport && (
            <div style={{ color: '#94a3b8' }}>
              triage: {poll.prTriageReport.changedFileCount ?? '?'} files ·{' '}
              {poll.prTriageReport.approxChangedLines ?? '?'} lines ·{' '}
              {poll.prTriageReport.focusAreas?.length ?? 0} focus areas
            </div>
          )}
          {poll?.status === 'error' && poll.error && (
            <div style={{ color: '#f87171' }}>error: {poll.error}</div>
          )}
          {pollError && (
            <div style={{ color: '#fbbf24' }}>poll: {pollError} (retrying)</div>
          )}
          {poll?.status === 'ready' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <button
                onClick={renderScript}
                disabled={renderState.kind === 'rendering'}
              >
                {renderState.kind === 'rendering'
                  ? 'rendering…'
                  : 'render PresentationScript →'}
              </button>
              {renderState.kind === 'error' && (
                <span style={{ color: '#f87171' }}>
                  {renderState.message}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {state.kind === 'error' && (
        <div style={{ fontSize: 12, color: '#f87171' }}>
          error: {state.message}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#888' }}>
        Two-phase run: clone + triage in /api/pr/analyze, then
        /api/pr/continue-analysis runs the deep pass. Phase transitions:
        cloning → triaging → analyzing → ready.
      </div>
    </div>
  );
}

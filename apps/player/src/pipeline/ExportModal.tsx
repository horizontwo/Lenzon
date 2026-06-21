import { useEffect, useRef, useState } from 'react';
import {
  StartExportError,
  getExportStatus,
  getScript,
  rerenderScriptAudio,
  startExport,
  type ExportStatus,
  type RenderJobStatus,
} from './api';

interface ExportModalProps {
  scriptId: string;
  /** Used in the modal header so the user knows which run is rendering. */
  scriptLabel?: string | null;
  onClose: () => void;
}

/**
 * One row in the in-modal status log. We push an entry for every
 * observed transition (start, each new status from a poll, terminal).
 * Times are recorded client-side because we don't have per-transition
 * timestamps from the worker — just `createdAt` / `completedAt`.
 */
interface TimelineEntry {
  /** Wall-clock at the moment we observed it. */
  observedAt: number;
  /** What we observed. `synthetic` is for client-side milestones
   *  (e.g. "polling adopted existing job") that don't map to a row state. */
  kind: RenderJobStatus | 'enqueued' | 'synthetic';
  /** Free-form label rendered in the log. */
  label: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'polling';
      jobId: string;
      startedAt: number;
      latest: ExportStatus | null;
      timeline: TimelineEntry[];
      /** Set when we adopted an in-flight job from a 429 response. */
      adopted: boolean;
    }
  | {
      kind: 'done';
      jobId: string;
      status: ExportStatus;
      timeline: TimelineEntry[];
    }
  | {
      kind: 'failed';
      jobId?: string;
      status?: ExportStatus;
      message: string;
      retryAfterSeconds?: number | null;
      timeline?: TimelineEntry[];
    }
  /**
   * Pre-flight 409: the script's per-scene narration MP3s aren't
   * ready, so the recorder would produce a silent MP4. Surfaced as a
   * recoverable state with a "Re-render audio" button rather than a
   * dead-end error so the user can fix it without leaving the modal.
   */
  | {
      kind: 'audioNotReady';
      audioStatus: string | null;
      audioError: string | null;
    }
  | {
      /** Re-render audio is in flight. Poll GET /api/scripts/:id until
       *  audioStatus flips to 'ready' or 'failed'. */
      kind: 'audioRendering';
      audioStatus: string | null;
      startedAt: number;
    };

// Poll cadence. The clone-progress UX runs at 2s; matching keeps the
// motion familiar and the load on /api/export/:jobId is trivial.
const POLL_INTERVAL_MS = 2000;
// Audio re-render poll. Slower than the export poll because audio
// renders in tens of seconds (each scene is one Google TTS call), so
// every-2s polling would burn cycles on a worker that's still busy.
const AUDIO_POLL_INTERVAL_MS = 3000;
// After this many seconds with no terminal status, surface a soft hint
// that the render is taking longer than usual. Doesn't change behavior —
// the poll keeps running.
const STALL_HINT_SECONDS = 240;

/**
 * Render-job modal. Click "Start export" → POST /api/export → poll
 * GET /api/export/:jobId every 2s → render link / error banner.
 *
 * On `too_many_active_runs`, the server returns the active jobIds and
 * the modal pivots into polling the first one (instead of showing a
 * blind "wait 30 seconds" wall) — so the user can actually see what's
 * happening with their in-flight render.
 */
export function ExportModal({ scriptId, scriptLabel, onClose }: ExportModalProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const [copiedJobId, setCopiedJobId] = useState(false);
  // Cheap "tick" so the elapsed/remaining counters advance smoothly
  // between server polls. Setting the value rather than incrementing
  // keeps re-renders bounded to once per second regardless of state
  // shape; it's only consumed for layout purposes (formatDuration reads
  // Date.now() internally) so the value itself is unused.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (state.kind !== 'polling' && state.kind !== 'audioRendering') return;
    const handle = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(handle);
  }, [state.kind]);
  // Tracks whether the modal is still mounted for the async poll loop.
  // Using a ref instead of an isMounted closure so the cleanup function
  // can flip it synchronously without re-creating the loop on each tick.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    if (!copied) return;
    const h = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(h);
  }, [copied]);

  useEffect(() => {
    if (!copiedJobId) return;
    const h = window.setTimeout(() => setCopiedJobId(false), 1600);
    return () => window.clearTimeout(h);
  }, [copiedJobId]);

  const start = async () => {
    setState({ kind: 'starting' });
    try {
      const res = await startExport(scriptId);
      if (!aliveRef.current) return;
      const startedAt = Date.now();
      setState({
        kind: 'polling',
        jobId: res.jobId,
        startedAt,
        latest: null,
        timeline: [
          {
            observedAt: startedAt,
            kind: 'enqueued',
            label: 'enqueued — POST /api/export → 202',
          },
        ],
        adopted: false,
      });
    } catch (err) {
      if (!aliveRef.current) return;
      if (err instanceof StartExportError) {
        // Audio not ready isn't really an error either — the script
        // exists, the user owns it, but the per-scene MP3s haven't
        // landed yet (or a previous attempt failed). Pivot into a
        // recoverable state with a "Re-render audio" CTA rather than
        // dropping into the generic failed banner.
        if (err.kind === 'audio_not_ready') {
          setState({
            kind: 'audioNotReady',
            audioStatus: err.audioStatus,
            audioError: err.audioError,
          });
          return;
        }
        // The cap-hit case isn't really an error from the user's POV —
        // they have a render in flight. Adopt it: poll the first active
        // jobId we got back so they see live status instead of a wait.
        if (err.kind === 'too_many_active_runs' && err.activeJobIds.length > 0) {
          const adoptedId = err.activeJobIds[0];
          const startedAt = Date.now();
          setState({
            kind: 'polling',
            jobId: adoptedId,
            startedAt,
            latest: null,
            timeline: [
              {
                observedAt: startedAt,
                kind: 'synthetic',
                label: `adopted existing job ${shortId(adoptedId)} (cap hit)`,
              },
            ],
            adopted: true,
          });
          return;
        }
        setState({
          kind: 'failed',
          message: friendlyStartError(err),
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        setState({ kind: 'failed', message: (err as Error).message });
      }
    }
  };

  // Kick a re-render of per-scene audio. Used when start() fails with
  // audio_not_ready. After the request returns, transition into the
  // audioRendering state and poll GET /api/scripts/:id until status
  // settles to 'ready' (auto-retry export) or 'failed' (surface error).
  const startAudioRerender = async () => {
    setState({
      kind: 'audioRendering',
      audioStatus: 'pending',
      startedAt: Date.now(),
    });
    try {
      await rerenderScriptAudio(scriptId);
    } catch (err) {
      if (!aliveRef.current) return;
      setState({
        kind: 'failed',
        message: `Couldn't kick the audio re-render: ${(err as Error).message}`,
      });
    }
  };

  // Audio re-render poll loop. Watches Script.audioStatus; on 'ready'
  // returns the user to idle (so they click Start again with full
  // intent), on 'failed' surfaces the error inline so they can decide
  // whether to retry. Polls slower than the export poll (audio renders
  // in tens of seconds, not minutes).
  useEffect(() => {
    if (state.kind !== 'audioRendering') return;
    let timer: number | null = null;
    const tick = async () => {
      try {
        const record = await getScript(scriptId);
        if (!aliveRef.current) return;
        const status = record.audioStatus;
        if (status === 'ready') {
          setState({ kind: 'idle' });
          return;
        }
        if (status === 'failed') {
          setState({
            kind: 'audioNotReady',
            audioStatus: 'failed',
            audioError: record.audioError ?? null,
          });
          return;
        }
        // 'pending' / 'rendering' / null — keep polling.
        setState((prev) =>
          prev.kind === 'audioRendering'
            ? { ...prev, audioStatus: status ?? prev.audioStatus }
            : prev,
        );
        timer = window.setTimeout(tick, AUDIO_POLL_INTERVAL_MS);
      } catch (err) {
        if (!aliveRef.current) return;
        setState({
          kind: 'failed',
          message: `Lost contact while rendering audio: ${(err as Error).message}`,
        });
      }
    };
    timer = window.setTimeout(tick, AUDIO_POLL_INTERVAL_MS);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [state.kind, scriptId]);

  // Poll loop. Re-runs whenever we enter `polling`. The `aliveRef` check
  // guards against state writes after unmount — see effect above.
  useEffect(() => {
    if (state.kind !== 'polling') return;
    let timer: number | null = null;
    const tick = async () => {
      try {
        const status = await getExportStatus(state.jobId);
        if (!aliveRef.current) return;
        applyStatus(status);
      } catch (err) {
        if (!aliveRef.current) return;
        // A transient poll failure shouldn't kill the loop — retry once
        // after the same interval. If the next tick fails too, surface it.
        timer = window.setTimeout(async () => {
          try {
            const retry = await getExportStatus(state.jobId);
            if (!aliveRef.current) return;
            applyStatus(retry);
          } catch (e2) {
            if (!aliveRef.current) return;
            setState((prev) => ({
              kind: 'failed',
              jobId: state.jobId,
              message: `Lost contact with the server: ${(e2 as Error).message}`,
              timeline: prev.kind === 'polling' ? prev.timeline : undefined,
            }));
          }
        }, POLL_INTERVAL_MS);
      }
    };
    const applyStatus = (status: ExportStatus) => {
      setState((prev) => {
        if (prev.kind !== 'polling' || prev.jobId !== state.jobId) return prev;
        const prevStatus = prev.latest?.status;
        const transitioned = status.status !== prevStatus;
        const nextTimeline = transitioned
          ? [
              ...prev.timeline,
              {
                observedAt: Date.now(),
                kind: status.status,
                label: timelineLabel(status),
              } as TimelineEntry,
            ]
          : prev.timeline;
        if (status.status === 'success') {
          return { kind: 'done', jobId: state.jobId, status, timeline: nextTimeline };
        }
        if (status.status === 'failed') {
          return {
            kind: 'failed',
            jobId: state.jobId,
            status,
            message: friendlyJobError(status),
            timeline: nextTimeline,
          };
        }
        timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        return { ...prev, latest: status, timeline: nextTimeline };
      });
    };
    timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [state.kind === 'polling' ? state.jobId : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = () => {
    if (state.kind !== 'done' || !state.status.presignedUrl) return;
    navigator.clipboard
      ?.writeText(state.status.presignedUrl)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  const copyJobId = (jobId: string) => {
    navigator.clipboard
      ?.writeText(jobId)
      .then(() => setCopiedJobId(true))
      .catch(() => {});
  };

  // Pulled out so we render the same job-meta/timeline block in
  // polling/done/failed without duplicating markup three times.
  const renderJobMeta = (jobId: string, status: ExportStatus | undefined, timeline: TimelineEntry[] | undefined) => (
    <>
      <div className="sb-modal-section">
        <div className="sb-modal-section-label">Job</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <div>
            <span style={{ color: 'var(--cs-ink-soft)' }}>id&nbsp;</span>
            <button
              type="button"
              className="sb-share-link"
              onClick={() => copyJobId(jobId)}
              title="Click to copy full id"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              {shortId(jobId)}
            </button>
            {copiedJobId && (
              <span className="sb-share-hint" style={{ marginLeft: 8 }}>
                copied
              </span>
            )}
          </div>
          {status?.createdAt && (
            <div>
              <span style={{ color: 'var(--cs-ink-soft)' }}>created&nbsp;</span>
              <span>{formatTime(status.createdAt)}</span>
            </div>
          )}
          {status?.completedAt && (
            <div>
              <span style={{ color: 'var(--cs-ink-soft)' }}>completed&nbsp;</span>
              <span>{formatTime(status.completedAt)}</span>
            </div>
          )}
          {status?.errorCode && (
            <div>
              <span style={{ color: 'var(--cs-ink-soft)' }}>errorCode&nbsp;</span>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {status.errorCode}
              </span>
            </div>
          )}
          {status?.videoDurationMs ? (
            <div>
              <span style={{ color: 'var(--cs-ink-soft)' }}>video length&nbsp;</span>
              <span>{formatDuration(status.videoDurationMs)}</span>
            </div>
          ) : null}
          {status?.estimatedDurationMs ? (
            <div>
              <span style={{ color: 'var(--cs-ink-soft)' }}>estimated render&nbsp;</span>
              <span>~{formatDuration(status.estimatedDurationMs)}</span>
            </div>
          ) : null}
        </div>
      </div>
      {timeline && timeline.length > 0 && (
        <div className="sb-modal-section">
          <div className="sb-modal-section-label">Timeline</div>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              maxHeight: 180,
              overflowY: 'auto',
            }}
          >
            {timeline.map((entry, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr',
                  gap: 8,
                  padding: '2px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--cs-border)',
                }}
              >
                <span style={{ color: 'var(--cs-ink-soft)' }}>
                  {formatClock(entry.observedAt)}
                </span>
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      minWidth: 64,
                      marginRight: 8,
                      padding: '0 6px',
                      borderRadius: 4,
                      background: kindBg(entry.kind),
                      color: kindFg(entry.kind),
                      fontWeight: 600,
                    }}
                  >
                    {entry.kind}
                  </span>
                  {entry.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );

  return (
    <div className="sb-modal-backdrop" onClick={onClose}>
      <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sb-modal-header">
          <h2>Export to MP4</h2>
          <button className="sb-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {scriptLabel && (
          <div className="sb-modal-section">
            <div className="sb-modal-section-label">Script</div>
            <div>{scriptLabel}</div>
          </div>
        )}

        {state.kind === 'idle' && (
          <>
            <div className="sb-modal-section">
              <p>
                Renders a 1080p60 MP4 of this run. Capture + encode +
                upload runs roughly 1.8× the video's playback length,
                plus ~1 minute of cold-start, so a 3-minute deck takes
                about 6–7 minutes wall-clock.
              </p>
            </div>
            <div className="sb-modal-section">
              <button className="sb-modal-primary" onClick={start}>
                Start export
              </button>
            </div>
          </>
        )}

        {state.kind === 'starting' && (
          <div className="sb-modal-section">
            <p>Queueing render…</p>
          </div>
        )}

        {state.kind === 'polling' && (
          <>
            {state.adopted && (
              <div className="sb-modal-section">
                <p style={{ margin: 0 }}>
                  You already had a render in flight, so this window is
                  showing live status for that one instead of starting a
                  new one.
                </p>
              </div>
            )}
            <div className="sb-modal-section">
              <p style={{ margin: 0 }}>
                <strong>{state.latest?.status ?? 'queued'}</strong>
                {' — '}
                {statusCopy(state.startedAt, state.latest)}
              </p>
              {renderProgress(state.startedAt, state.latest)}
              {Date.now() - state.startedAt > STALL_HINT_SECONDS * 1000 && (
                <p className="sb-share-hint" style={{ marginTop: 8 }}>
                  This is taking longer than usual. You can close this
                  window — the render keeps going in the background.
                </p>
              )}
            </div>
            {renderJobMeta(state.jobId, state.latest ?? undefined, state.timeline)}
          </>
        )}

        {state.kind === 'audioNotReady' && (
          <>
            <div className="sb-modal-section">
              <div className="sb-modal-error">
                {state.audioStatus === 'failed'
                  ? "This script's narration audio failed to render."
                  : "This script's narration audio isn't ready yet."}
              </div>
              <p className="sb-share-hint" style={{ marginTop: 8 }}>
                The recorder needs per-scene MP3s to mux into the video.
                Without them you'd get a silent MP4 after a long render.
                Re-rendering the audio takes ~30–60 seconds.
              </p>
              {state.audioError && (
                <p
                  className="sb-share-hint"
                  style={{
                    marginTop: 8,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 12,
                  }}
                >
                  Last error: {state.audioError}
                </p>
              )}
            </div>
            <div className="sb-modal-section">
              <button className="sb-modal-primary" onClick={startAudioRerender}>
                Re-render audio
              </button>
            </div>
          </>
        )}

        {state.kind === 'audioRendering' && (
          <div className="sb-modal-section">
            <p style={{ margin: 0 }}>
              <strong>{state.audioStatus ?? 'pending'}</strong>
              {' — '}
              rendering narration MP3s. This typically takes ~30–60 seconds.
            </p>
            <p className="sb-share-hint" style={{ marginTop: 8 }}>
              elapsed {formatDuration(Date.now() - state.startedAt)}
            </p>
          </div>
        )}

        {state.kind === 'done' && state.status.presignedUrl && (
          <>
            <div className="sb-modal-section">
              <p>Done — your MP4 is ready.</p>
            </div>
            <div className="sb-modal-section">
              <a
                className="sb-modal-primary"
                href={state.status.presignedUrl}
                download
              >
                Download MP4
              </a>
            </div>
            <div className="sb-modal-section">
              <button
                type="button"
                className="sb-share-link"
                onClick={copyLink}
                title="Click to copy"
              >
                {state.status.presignedUrl}
              </button>
              <div className="sb-share-hint">
                {copied
                  ? 'Copied to clipboard'
                  : 'Click to copy. Link expires in about an hour; reopen this window to refresh.'}
              </div>
            </div>
            {renderJobMeta(state.jobId, state.status, state.timeline)}
          </>
        )}

        {state.kind === 'failed' && (
          <>
            <div className="sb-modal-section">
              <div className="sb-modal-error">{state.message}</div>
              {state.retryAfterSeconds && (
                <p className="sb-share-hint">
                  Try again in {state.retryAfterSeconds} second
                  {state.retryAfterSeconds === 1 ? '' : 's'}.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setState({ kind: 'idle' })}>Try again</button>
              </div>
            </div>
            {state.jobId && renderJobMeta(state.jobId, state.status, state.timeline)}
          </>
        )}

        <div className="sb-modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function timelineLabel(status: ExportStatus): string {
  if (status.status === 'success') {
    return status.completedAt
      ? `success — completed ${formatTime(status.completedAt)}`
      : 'success';
  }
  if (status.status === 'failed') {
    const code = status.errorCode ?? 'render-failed';
    return status.errorMessage ? `${code}: ${status.errorMessage}` : code;
  }
  return status.status;
}

function kindBg(kind: TimelineEntry['kind']): string {
  switch (kind) {
    case 'success':
      return 'rgba(16, 185, 129, 0.15)';
    case 'failed':
      return 'rgba(248, 113, 113, 0.18)';
    case 'running':
      return 'rgba(29, 122, 183, 0.15)';
    case 'queued':
    case 'enqueued':
      return 'rgba(148, 163, 184, 0.18)';
    case 'synthetic':
    default:
      return 'rgba(148, 163, 184, 0.12)';
  }
}

function kindFg(kind: TimelineEntry['kind']): string {
  switch (kind) {
    case 'success':
      return '#047857';
    case 'failed':
      return '#b91c1c';
    case 'running':
      return '#1d4ed8';
    case 'queued':
    case 'enqueued':
      return '#475569';
    case 'synthetic':
    default:
      return '#475569';
  }
}

// Heuristic copy. We don't have a true progress signal yet, so we map
// elapsed wall-clock time onto the same vocabulary the plan calls out:
// queued → capturing → encoding → done. Numbers are deliberately fuzzy.
// Used as a sub-line under the actual `status` value, not the headline.
function statusCopy(startedAt: number, latest: ExportStatus | null): string {
  const elapsed = (Date.now() - startedAt) / 1000;
  if (latest && latest.status === 'queued') {
    if (elapsed < 30) return 'starting a worker…';
    return 'still waiting in the queue (cold-starts can take ~30s).';
  }
  if (latest && latest.status === 'running') {
    if (elapsed < 90) return 'capturing frames…';
    if (elapsed < 180) return 'encoding video…';
    return 'wrapping up — uploading the MP4…';
  }
  if (elapsed < 30) return 'starting a worker…';
  if (elapsed < 90) return 'capturing frames…';
  if (elapsed < 180) return 'encoding video…';
  return 'wrapping up — uploading the MP4…';
}

function friendlyStartError(err: StartExportError): string {
  switch (err.kind) {
    case 'unauthorized':
      return 'You need to sign in to export.';
    case 'script_not_found':
      return "We couldn't find that script, or it isn't yours.";
    case 'audio_not_ready':
      return "This script's narration audio isn't ready. Re-render audio first.";
    case 'too_many_active_runs':
      return "You already have an export running. Wait for it to finish first.";
    case 'too_many_cluster_runs':
      return 'Lenzon is busy right now. Try again in a minute.';
    case 'app_url_missing':
      return 'Server misconfiguration — please report this.';
    case 'enqueue_failed':
      return `Couldn't reach the render queue: ${err.message}`;
    default:
      return err.message;
  }
}

/**
 * Elapsed/remaining display + progress bar. Renders nothing until the
 * server has handed us an `estimatedDurationMs` (saved scripts only —
 * legacy rows without scene durations show no bar). The bar tops out at
 * 99% before the row terminates so we never claim "100%" while the user
 * is still waiting; final 1% completes when the status flips to success.
 */
function renderProgress(startedAt: number, latest: ExportStatus | null) {
  const elapsedMs = Date.now() - startedAt;
  const estMs = latest?.estimatedDurationMs ?? null;
  if (!estMs || estMs <= 0) {
    // No estimate available — fall back to a bare elapsed counter so the
    // user at least sees the clock advancing.
    return (
      <p className="sb-share-hint" style={{ marginTop: 8 }}>
        elapsed {formatDuration(elapsedMs)}
      </p>
    );
  }
  const ratio = Math.max(0, Math.min(0.99, elapsedMs / estMs));
  const remainingMs = Math.max(0, estMs - elapsedMs);
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          position: 'relative',
          height: 6,
          borderRadius: 3,
          background: 'var(--cs-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${ratio * 100}%`,
            background: 'var(--cs-accent, #1d4ed8)',
            transition: 'width 1s linear',
          }}
        />
      </div>
      <div
        className="sb-share-hint"
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>elapsed {formatDuration(elapsedMs)}</span>
        <span>
          {remainingMs > 0
            ? `~${formatDuration(remainingMs)} remaining`
            : 'wrapping up…'}
        </span>
      </div>
    </div>
  );
}

/** Compact mm:ss / h:mm:ss for durations the user reads at a glance. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function friendlyJobError(status: ExportStatus): string {
  const code = status.errorCode ?? 'render-failed';
  const tail = status.errorMessage ? ` (${status.errorMessage})` : '';
  switch (code) {
    case 'capture-timeout':
      return `The renderer couldn't finish in time${tail}.`;
    case 'font-load-failed':
      return `A font failed to load before capture started${tail}.`;
    case 'upload-failed':
      return `The MP4 was rendered but couldn't be uploaded${tail}.`;
    case 'enqueue-failed':
      return `Couldn't queue the render${tail}.`;
    default:
      return `Render failed${tail}.`;
  }
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AnalysisMode,
  AnalysisPhase,
  AnalysisRecord,
  AudioStatus,
  PresentationScript,
  TriagePhase,
  TriageReport,
} from '@lenzon/shared-types';
import { progressCopy } from './progress-copy';
import { defaultSettings } from '@lenzon/shared-types';
import { Presentation } from '../react/Presentation';
import type { Presenter } from '../service/presenter';
import {
  GoogleCloudVoicePlayer,
  PrerenderedAudioVoicePlayer,
  ScriptPlayer,
  StubVoicePlayer,
  type PlayerState,
  type VoicePlayer,
} from '../player';
import { DEFAULT_DESIGN_SIZE, type DesignSize } from '../designSize';

// Guarded for non-Vite hosts (e.g. Next SSR) where `import.meta.env` is undefined.
const SERVER_URL = (
  (import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL ?? ''
).replace(/\/$/, '');
import { TriageModal } from './TriageModal';
import { ShareModal } from './ShareModal';
import {
  AnalyzeAuthError,
  CloneError,
  InsufficientCreditsError,
  PrMetadataClientError,
  cancelAnalysis,
  fetchMe,
  getAnalysis,
  getScript,
  listScripts,
  parseRowCloneError,
  pollTriage,
  postScript,
  runTriage,
  startAnalyze,
  startPrAnalyze,
  type MeResponse,
} from './api';
import { parsePrUrl } from './parsePrUrl';
import { CloneErrorBanner } from './CloneErrorBanner';
import type { ScriptSummary } from '@lenzon/shared-types';
import { parseRepoName, formatRelative } from './runsFormat';

type FlowState =
  | { kind: 'url' }
  | { kind: 'triage'; repoUrl: string; phase: TriagePhase | null }
  | {
      kind: 'choices';
      repoUrl: string;
      report: TriageReport;
      triageSessionId: string | null;
    }
  | {
      kind: 'analysis';
      repoUrl: string;
      analysisId: string;
      reserved: number | null;
      phase: AnalysisPhase | null;
      // 'repo' runs carry the triage report + picked mode so an error can
      // bounce back to the choices step. 'pr' runs have neither (no triage,
      // no mode picker), so a PR error returns to the URL step instead.
      run:
        | { type: 'repo'; report: TriageReport; mode: AnalysisMode }
        | { type: 'pr'; prNumber: number };
    }
  | {
      kind: 'script';
      repoUrl: string;
      analysis: AnalysisRecord;
      run:
        | { type: 'repo'; report: TriageReport }
        | { type: 'pr'; prNumber: number };
    }
  | {
      kind: 'playing';
      /** Null when we replayed a saved script that has no associated repo in state. */
      repoUrl: string | null;
      /** Null when replaying a saved script — no triage report to reuse. */
      report: TriageReport | null;
      /** Null when replaying a saved script — the loop-back button hides in that case. */
      analysis: AnalysisRecord | null;
      script: PresentationScript;
      /** Persisted Script row id — null only if postScript() somehow returned no id. Required for sharing. */
      scriptId: string | null;
      /**
       * Audio pre-render lifecycle as known at the moment we entered
       * playback. PlayingStep polls /api/scripts/:id to watch it flip
       * pending → ready/failed and surfaces a banner on failure.
       */
      audioStatus: AudioStatus | null;
    };

const GITHUB_URL = /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/i;

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * User-facing copy for a PR-metadata fetch failure. The 'not-found-or-private'
 * case is the actionable one — we can't tell "private" from "doesn't exist"
 * without auth, so we point the user at installing the GitHub App for the
 * owner (which is what would let us see a private PR).
 */
function prMetadataErrorCopy(e: PrMetadataClientError): string {
  switch (e.kind) {
    case 'not-found-or-private':
      return e.owner
        ? `Can't see that PR. If it's private, install the GitHub App for ${e.owner}, then retry — otherwise check the link.`
        : `Can't see that PR — it's private or doesn't exist. Check the link, or install the GitHub App if it's private.`;
    case 'rate-limited':
      return `GitHub is rate-limiting anonymous requests right now — try again in a few minutes.`;
    case 'unsupported-host':
      return `PRs are only supported for github.com right now.`;
    case 'github-error':
    default:
      return `Couldn't read that PR from GitHub — try again.`;
  }
}

export interface GenerateFlowProps {
  /**
   * Fixed-pixel design surface the player renders into. Defaults to
   * DEFAULT_DESIGN_SIZE (1920×1080). Pass a smaller size to enlarge
   * content in the same host frame; pass a larger size to give templates
   * more room before scaling down.
   */
  designSize?: DesignSize;
  /**
   * Right-side header content. Hosts inject their own account chrome
   * (e.g. the server app passes <UserMenu />) so this package stays
   * free of cross-app imports.
   */
  headerSlot?: ReactNode;
}

export function GenerateFlow({
  designSize = DEFAULT_DESIGN_SIZE,
  headerSlot = null,
}: GenerateFlowProps = {}) {
  const [state, setState] = useState<FlowState>({ kind: 'url' });
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Structured clone-side failures get their own slot so the banner can
  // render code-specific copy + a recovery action. Generic errors continue
  // to use `error` and the toast. `repoUrl` is threaded so the banner's
  // reconnect link can carry it as `returnTo` for post-OAuth prefill.
  const [cloneError, setCloneError] = useState<{
    err: CloneError;
    repoUrl: string | null;
  } | null>(null);
  // Initial value for the URL input. Hydrated from `?repoUrl=…` on mount
  // (the post-OAuth landing case) so the user doesn't have to re-paste.
  const [initialUrl, setInitialUrl] = useState('');
  const triageAbortRef = useRef<AbortController | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);

  /** Jump straight to playback with a saved script, bypassing triage/analysis. */
  const replaySaved = useCallback(async (scriptId: string) => {
    setError(null);
    try {
      const record = await getScript(scriptId);
      if (!record.data) {
        setError(`That run didn't finish — can't replay it.`);
        return;
      }
      setState({
        kind: 'playing',
        repoUrl: null,
        report: null,
        analysis: null,
        script: record.data,
        scriptId: record.id,
        audioStatus: record.audioStatus ?? null,
      });
    } catch (e) {
      setError(`Couldn't load that run: ${(e as Error).message}`);
    }
  }, []);

  // Hydrate auth on mount so the URL screen can label the button correctly.
  useEffect(() => {
    fetchMe()
      .then((res) => setMe(res))
      .catch(() => setMe(null))
      .finally(() => setMeLoaded(true));
  }, []);

  // Deep-link replay: `/generate?scriptId=…` jumps straight into playback.
  // Used by the /runs page's Play button. Strip the param after kickoff so
  // a refresh doesn't re-trigger the load.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const scriptId = params.get('scriptId');
    if (!scriptId) return;
    params.delete('scriptId');
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (qs ? `?${qs}` : ''),
    );
    void replaySaved(scriptId);
  }, [replaySaved]);

  // Post-OAuth landing: the connections flow returns the user to
  // /generate?repoUrl=… so they don't have to re-paste after reconnecting.
  // Strip the param after hydrating UrlStep's initial value so a refresh
  // doesn't re-prefill.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const repoUrl = params.get('repoUrl');
    if (!repoUrl) return;
    setInitialUrl(repoUrl);
    params.delete('repoUrl');
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (qs ? `?${qs}` : ''),
    );
  }, []);

  // ---- Transitions ----

  const reset = useCallback(() => {
    triageAbortRef.current?.abort();
    pollAbortRef.current?.abort();
    triageAbortRef.current = null;
    pollAbortRef.current = null;
    setError(null);
    setCloneError(null);
    setState({ kind: 'url' });
  }, []);

  const startTriage = useCallback(async (repoUrl: string) => {
    const controller = new AbortController();
    triageAbortRef.current = controller;
    setError(null);
    // 'cloning' on entry — the server creates the row in this phase. The
    // pollTriage onTick below flips it to 'running' once the clone-worker
    // run completes and the agent session starts.
    setState({ kind: 'triage', repoUrl, phase: 'cloning' });
    try {
      const { id } = await runTriage(repoUrl, controller.signal);
      const record = await pollTriage(id, {
        signal: controller.signal,
        onTick: (rec) => {
          setState((prev) =>
            prev.kind === 'triage'
              ? { ...prev, phase: rec.phase ?? prev.phase }
              : prev,
          );
        },
      });
      if (controller.signal.aborted) return;
      if (record.status !== 'ready' || !record.data) {
        throw new Error(record.error ?? 'triage failed');
      }
      setState({
        kind: 'choices',
        repoUrl,
        report: record.data,
        triageSessionId: record.sessionId,
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof AnalyzeAuthError) {
        window.location.assign(`/login?next=${encodeURIComponent('/generate')}`);
        return;
      }
      if (e instanceof CloneError) {
        setCloneError({ err: e, repoUrl });
        setState({ kind: 'url' });
        return;
      }
      // The triage row may have flipped to status='error' with a
      // `clone-<code>: <message>` string before our local catch fires.
      // Surface that through the same banner.
      const fromRow =
        e instanceof Error ? parseRowCloneError(e.message) : null;
      if (fromRow) {
        setCloneError({ err: fromRow, repoUrl });
        setState({ kind: 'url' });
        return;
      }
      setError((e as Error).message);
      setState({ kind: 'url' });
    }
  }, []);

  const confirmChoices = useCallback(
    async (mode: AnalysisMode) => {
      if (state.kind !== 'choices') return;
      setError(null);
      try {
        const res = await startAnalyze(
          state.repoUrl,
          mode,
          state.report,
          state.triageSessionId,
        );
        setState({
          kind: 'analysis',
          repoUrl: state.repoUrl,
          run: { type: 'repo', report: state.report, mode },
          analysisId: res.id,
          reserved: res.estimate?.credits ?? null,
          // Server creates the row in 'cloning' phase; the polling loop
          // below flips it to 'running' after the clone worker completes.
          phase: 'cloning',
        });
      } catch (e) {
        if (e instanceof AnalyzeAuthError) {
          window.location.assign(
            `/login?next=${encodeURIComponent('/generate')}`,
          );
          return;
        }
        if (e instanceof InsufficientCreditsError) {
          setError(
            `Not enough credits: need ${e.needed}, you have ${e.have}. Top up to continue.`,
          );
          return;
        }
        if (e instanceof CloneError) {
          setCloneError({ err: e, repoUrl: state.repoUrl });
          return;
        }
        setError((e as Error).message);
      }
    },
    [state],
  );

  // PR path: kicks off `/api/pr/analyze` and jumps straight to the analysis
  // step, bypassing triage + the mode picker (a PR run has no mode — it's
  // always the full PR diff). Errors return to the URL step since there's no
  // triage to retry from.
  const startPrFlow = useCallback(
    async (repoUrl: string, prNumber: number) => {
      setError(null);
      setCloneError(null);
      try {
        const res = await startPrAnalyze(repoUrl, prNumber);
        setState({
          kind: 'analysis',
          repoUrl,
          run: { type: 'pr', prNumber },
          analysisId: res.id,
          reserved: res.estimate?.credits ?? null,
          phase: 'cloning',
        });
      } catch (e) {
        if (e instanceof AnalyzeAuthError) {
          window.location.assign(
            `/login?next=${encodeURIComponent('/generate')}`,
          );
          return;
        }
        if (e instanceof InsufficientCreditsError) {
          setError(
            `Not enough credits: need ${e.needed}, you have ${e.have}. Top up to continue.`,
          );
          return;
        }
        if (e instanceof PrMetadataClientError) {
          setError(prMetadataErrorCopy(e));
          return;
        }
        if (e instanceof CloneError) {
          setCloneError({ err: e, repoUrl });
          return;
        }
        setError((e as Error).message);
      }
    },
    [],
  );

  const analysisId = state.kind === 'analysis' ? state.analysisId : null;
  const scriptAnalysisId = state.kind === 'script' ? state.analysis.id : null;
  const scriptAnalysisData = state.kind === 'script' ? state.analysis.data : null;

  // Polling loop for the analysis stage. Runs as long as state is 'analysis'.
  useEffect(() => {
    if (!analysisId) return;
    const controller = new AbortController();
    pollAbortRef.current = controller;
    let cancelled = false;

    async function run() {
      const backoff = 3000;
      while (!cancelled) {
        try {
          const rec = await getAnalysis(analysisId!);
          if (cancelled) return;
          // Capture phase ticks so AnalysisStep can swap copy from
          // "Queued — starting a worker…" to "Building the analysis"
          // without a full state transition.
          setState((prev) =>
            prev.kind === 'analysis' && prev.phase !== rec.phase
              ? { ...prev, phase: rec.phase ?? prev.phase }
              : prev,
          );
          if (rec.status === 'ready') {
            setState((prev) =>
              prev.kind === 'analysis'
                ? {
                    kind: 'script',
                    repoUrl: prev.repoUrl,
                    analysis: rec,
                    // Carry the run discriminator forward; a PR script run
                    // has no report, a repo run does.
                    run:
                      prev.run.type === 'repo'
                        ? { type: 'repo', report: prev.run.report }
                        : { type: 'pr', prNumber: prev.run.prNumber },
                  }
                : prev,
            );
            return;
          }
          if (rec.status === 'error') {
            // Clone-side failures land here as `clone-<code>: <message>`
            // — surface those through the banner with code-specific copy.
            // Other errors keep the generic toast.
            const cloneErr = parseRowCloneError(rec.error);
            if (cloneErr) {
              setCloneError({ err: cloneErr, repoUrl: rec.repoUrl });
              setState({ kind: 'url' });
              return;
            }
            setError(rec.error ?? 'Analysis failed.');
            // Repo runs bounce back to the choices step (re-pick a mode);
            // PR runs have no triage to retry from, so they return to URL.
            setState((prev) =>
              prev.kind === 'analysis' && prev.run.type === 'repo'
                ? {
                    kind: 'choices',
                    repoUrl: prev.repoUrl,
                    report: prev.run.report,
                    triageSessionId: null,
                  }
                : { kind: 'url' },
            );
            return;
          }
          if (rec.status === 'cancelled') {
            setError('Cancelled. Charged only for work completed.');
            setState((prev) =>
              prev.kind === 'analysis' && prev.run.type === 'repo'
                ? {
                    kind: 'choices',
                    repoUrl: prev.repoUrl,
                    report: prev.run.report,
                    triageSessionId: null,
                  }
                : { kind: 'url' },
            );
            return;
          }
          await new Promise((r) => setTimeout(r, backoff));
        } catch (e) {
          if (cancelled) return;
          console.warn('[generate] poll tick failed:', (e as Error).message);
          await new Promise((r) => setTimeout(r, backoff * 2));
        }
      }
    }
    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [analysisId]);

  // Kick off script generation when entering 'script' state.
  useEffect(() => {
    if (!scriptAnalysisId) return;
    if (!scriptAnalysisData) {
      setError('Analysis finished without data — please retry.');
      setState((prev) =>
        prev.kind === 'script' && prev.run.type === 'repo'
          ? {
              kind: 'choices',
              repoUrl: prev.repoUrl,
              report: prev.run.report,
              triageSessionId: null,
            }
          : { kind: 'url' },
      );
      return;
    }
    let cancelled = false;
    postScript(scriptAnalysisData, defaultSettings, scriptAnalysisId)
      .then((res) => {
        if (cancelled) return;
        setState((prev) =>
          prev.kind === 'script'
            ? {
                kind: 'playing',
                repoUrl: prev.repoUrl,
                // Only repo runs carry a triage report into playback (it
                // backs the "try another angle" loop). PR runs have none.
                report: prev.run.type === 'repo' ? prev.run.report : null,
                analysis: prev.analysis,
                script: res.script,
                scriptId: res.id,
                audioStatus: res.audioStatus,
              }
            : prev,
        );
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof AnalyzeAuthError) {
          window.location.assign(
            `/login?next=${encodeURIComponent('/generate')}`,
          );
          return;
        }
        setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptAnalysisId, scriptAnalysisData]);

  // ---- Rendering ----

  return (
    <div className="sb-generate">
      <header className="sb-generate-header">
        <a className="sb-generate-brand" href="/" aria-label="Lenzon home">
          <img
            src="/Lenzon_logo.png"
            alt="Lenzon"
            className="sb-generate-logo"
          />
        </a>
        <div className="sb-generate-header-right">{headerSlot}</div>
      </header>

      <main className="sb-generate-main">
        <div className="sb-generate-flow-column">
          {state.kind === 'url' && (
            <>
              {cloneError && (
                <CloneErrorBanner
                  error={cloneError.err}
                  repoUrl={cloneError.repoUrl}
                  onDismiss={() => setCloneError(null)}
                />
              )}
              <UrlStep
                signedIn={Boolean(me)}
                authLoaded={meLoaded}
                error={cloneError ? null : error}
                initialUrl={initialUrl}
                onSubmitRepo={(url) => {
                  setCloneError(null);
                  setError(null);
                  startTriage(url);
                }}
                onSubmitPr={(repoUrl, prNumber) => {
                  setCloneError(null);
                  setError(null);
                  void startPrFlow(repoUrl, prNumber);
                }}
              />
              {me && <RecentRuns onPlay={replaySaved} />}
            </>
          )}
          {state.kind === 'triage' && (
            <RunningStep
              title="Scoping your codebase"
              hint="~30s typical"
              stage="triage"
              phase={state.phase}
              onCancel={() => {
                triageAbortRef.current?.abort();
                setState({ kind: 'url' });
              }}
              cancelLabel="Cancel"
            />
          )}
          {state.kind === 'choices' && (
            <TriageModal
              report={state.report}
              onConfirm={confirmChoices}
              onCancel={() => setState({ kind: 'url' })}
            />
          )}
          {state.kind === 'analysis' && (
            <AnalysisStep
              reserved={state.reserved}
              phase={state.phase}
              stage={state.run.type === 'pr' ? 'pr' : 'analysis'}
              prNumber={state.run.type === 'pr' ? state.run.prNumber : null}
              onCancel={async () => {
                try {
                  await cancelAnalysis(state.analysisId);
                } catch (e) {
                  console.warn('[generate] cancel failed:', e);
                }
                // Polling will pick up 'cancelled' and advance the UI.
              }}
            />
          )}
          {state.kind === 'script' && (
            <RunningStep
              title="Composing the script"
              hint="Almost there"
              onCancel={null}
              cancelLabel=""
            />
          )}
          {state.kind === 'playing' && (
            <PlayingStep
              script={state.script}
              scriptId={state.scriptId}
              initialAudioStatus={state.audioStatus}
              designSize={designSize}
              onRerun={
                state.repoUrl && state.report
                  ? () =>
                      setState({
                        kind: 'choices',
                        repoUrl: state.repoUrl!,
                        report: state.report!,
                        triageSessionId: null,
                      })
                  : null
              }
              onRestart={reset}
            />
          )}
        </div>
        <aside className="sb-generate-side-column" aria-label="Reading while you wait">
          <BlogPanel />
        </aside>
      </main>

      {error && state.kind === 'url' && (
        <div className="sb-generate-error-toast">{error}</div>
      )}
    </div>
  );
}

// ------------------------- RecentRuns -------------------------

const RECENT_RUNS_LIMIT = 5;

/**
 * "Your recent runs" — saved-script list rendered below the URL card on
 * the landing (state 1) step. Hidden entirely when the user has no
 * saved scripts, so first-time users see only the URL card.
 *
 * The Share action is a stub today; it'll flip Script.visibility and
 * mint a shareToken once the server route lands (see
 * docs/lenzon/EMBED-AND-AUTH-PLAN.md §Not in any step).
 */
function RecentRuns({ onPlay }: { onPlay: (scriptId: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScriptSummary[]>([]);
  const [shareId, setShareId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listScripts()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows.filter((r) => r.status === 'ready'));
      })
      .catch((e) => {
        // Non-fatal — the surface is advisory. Log and render empty.
        console.warn('[generate] listScripts failed:', (e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section
        className="sb-generate-card sb-generate-runs"
        aria-busy="true"
        aria-label="Loading your recent runs"
      >
        <div className="sb-generate-runs-header">
          <h2 className="sb-generate-runs-title">Your recent runs</h2>
        </div>
        <ul className="sb-generate-runs-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="sb-generate-runs-row sb-generate-runs-skeleton">
              <div className="sb-generate-runs-skel-line sb-generate-runs-skel-line-a" />
              <div className="sb-generate-runs-skel-line sb-generate-runs-skel-line-b" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (items.length === 0) {
    // Empty state is intentionally hidden — first-time users see only
    // the URL card. Matches the design call in the frontend-design pass.
    return null;
  }

  const visible = items.slice(0, RECENT_RUNS_LIMIT);
  const hiddenCount = items.length - visible.length;

  return (
    <section className="sb-generate-card sb-generate-runs" aria-label="Your recent runs">
      <div className="sb-generate-runs-header">
        <h2 className="sb-generate-runs-title">Your recent runs</h2>
        <span
          className="sb-generate-runs-count"
          aria-label={`${items.length} saved`}
        >
          {items.length}
        </span>
      </div>
      <ul className="sb-generate-runs-list">
        {visible.map((it) => (
          <li key={it.id} className="sb-generate-runs-row">
            <button
              type="button"
              className="sb-generate-runs-row-main"
              onClick={() => onPlay(it.id)}
              title={`Play · id ${it.id}`}
            >
              <span className="sb-generate-runs-repo">
                {parseRepoName(it.repoUrl)}
              </span>
              <span className="sb-generate-runs-meta">
                <span className="sb-generate-runs-label">{it.label}</span>
                <span
                  className="sb-generate-runs-dot"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span
                  className="sb-generate-runs-date"
                  title={new Date(it.updatedAt).toLocaleString()}
                >
                  {formatRelative(it.updatedAt)}
                </span>
              </span>
            </button>
            <div className="sb-generate-runs-actions">
              <button
                type="button"
                className="sb-generate-runs-action"
                onClick={() => onPlay(it.id)}
                aria-label={`Play ${parseRepoName(it.repoUrl)}`}
              >
                <span aria-hidden="true">▶</span> Play
              </button>
              <button
                type="button"
                className="sb-generate-runs-action sb-generate-runs-action-muted"
                onClick={() => setShareId(it.id)}
                aria-label={`Share ${parseRepoName(it.repoUrl)}`}
              >
                <span aria-hidden="true">⧉</span> Share
              </button>
            </div>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <a className="sb-generate-runs-more" href="/runs">
          See all {items.length} runs →
        </a>
      )}
      {shareId && (
        <ShareModal scriptId={shareId} onClose={() => setShareId(null)} />
      )}
    </section>
  );
}

/**
 * Right-rail companion panel — fetches the published "While you wait"
 * feed from /api/blog and renders cards. Each entry is one of:
 *   - article  (body) → /blog/[id]
 *   - share URL (playerUrl) → opens the pasted Share URL in a new tab
 *   - legacy script id (playerScriptId) → /viewer/[id]
 */
type BlogEntry = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  body: string | null;
  playerScriptId: string | null;
  playerUrl: string | null;
  postedAt: string;
};

function BlogPanel() {
  const [entries, setEntries] = useState<BlogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/blog', { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { entries: BlogEntry[] };
        if (!cancelled) setEntries(json.entries);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || (entries && entries.length === 0)) {
    // Hide the rail entirely on error or empty feed; the flow stands on
    // its own without it.
    return null;
  }

  return (
    <div className="sb-generate-blog">
      <div className="sb-generate-blog-eyebrow">While you wait</div>
      <h2 className="sb-generate-blog-title">Fresh reads from the lab</h2>
      <p className="sb-generate-blog-hint">
        Daily research and finished walkthroughs — pulled in from the content
        team. A good place to land while the agents are busy.
      </p>
      <ul className="sb-generate-blog-list">
        {(entries ?? []).map((it) => {
          const href = it.playerUrl
            ? it.playerUrl
            : it.playerScriptId
              ? `/viewer/${encodeURIComponent(it.playerScriptId)}`
              : `/blog/${encodeURIComponent(it.id)}`;
          // All entries open in a new tab so the user's in-progress
          // generate run isn't disturbed.
          const isExternal = true;
          const kindClass =
            it.kind === 'walkthrough' ? 'walkthrough' : 'research';
          const kindLabel =
            it.kind === 'walkthrough' ? 'Walkthrough' : 'Research';
          return (
            <li key={it.id} className="sb-generate-blog-item">
              <a
                className="sb-generate-blog-link"
                href={href}
                {...(isExternal
                  ? { target: '_blank', rel: 'noreferrer' }
                  : {})}
              >
                <span
                  className={`sb-generate-blog-tag sb-generate-blog-tag-${kindClass}`}
                >
                  {kindLabel}
                </span>
                <span className="sb-generate-blog-item-title">{it.title}</span>
                <span className="sb-generate-blog-item-excerpt">
                  {it.excerpt}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------- Sub-components -------------------------

function UrlStep({
  signedIn,
  authLoaded,
  error,
  initialUrl,
  onSubmitRepo,
  onSubmitPr,
}: {
  signedIn: boolean;
  authLoaded: boolean;
  error: string | null;
  /** Prefill from `?repoUrl=` (post-OAuth landing). Empty for fresh visits. */
  initialUrl?: string;
  onSubmitRepo: (repoUrl: string) => void;
  onSubmitPr: (repoUrl: string, prNumber: number) => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmed = url.trim();
  const pr = parsePrUrl(trimmed);
  const looksLikePr = /\/pull\//i.test(trimmed);
  // Valid if it parses as a PR, OR is a repo URL that ISN'T a malformed PR
  // link. A `…/pull/<garbage>` string is intentionally invalid so it can't
  // silently fall through to the repo/triage path.
  const valid = pr ? true : !looksLikePr && GITHUB_URL.test(trimmed);
  const canSubmit = valid && authLoaded;

  const handle = () => {
    setTouched(true);
    setLocalError(null);
    // PR URL first — GITHUB_URL also matches a …/pull/N prefix, so without
    // this a pasted PR link would wrongly trigger a whole-repo scan.
    if (pr) {
      if (!signedIn) {
        window.location.assign(`/login?next=${encodeURIComponent('/generate')}`);
        return;
      }
      onSubmitPr(pr.repoUrl, pr.prNumber);
      return;
    }
    if (looksLikePr) {
      setLocalError('That doesn’t look like a valid pull request link.');
      return;
    }
    if (!GITHUB_URL.test(trimmed)) {
      setLocalError('That doesn’t look like a GitHub URL.');
      return;
    }
    if (!signedIn) {
      window.location.assign(`/login?next=${encodeURIComponent('/generate')}`);
      return;
    }
    onSubmitRepo(trimmed);
  };

  return (
    <section className="sb-generate-card sb-generate-url">
      <div className="sb-generate-card-eyebrow">Step 1</div>
      <h1 className="sb-generate-card-title">Paste a GitHub repo or pull request</h1>
      <p className="sb-generate-card-hint">
        Paste a repo to scope it, or a pull request to explain the diff.
      </p>
      <form
        className="sb-generate-url-form"
        onSubmit={(e) => {
          e.preventDefault();
          handle();
        }}
      >
        <input
          className="sb-generate-input"
          placeholder="https://github.com/owner/repo  ·  or a /pull/123 link"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTouched(false);
            setLocalError(null);
          }}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          className="sb-generate-primary"
          type="submit"
          disabled={!canSubmit}
        >
          {signedIn
            ? pr
              ? `Explain PR #${pr.prNumber}`
              : 'Generate a walkthrough'
            : 'Sign in to generate'}
        </button>
      </form>
      {(touched && localError) && (
        <div className="sb-generate-inline-error">{localError}</div>
      )}
      {error && <div className="sb-generate-inline-error">{error}</div>}
    </section>
  );
}

function RunningStep({
  title,
  hint,
  phase,
  stage,
  onCancel,
  cancelLabel,
}: {
  title: string;
  hint: string;
  /** When provided, the helper picks copy off (stage, phase, elapsed) and overrides `title`/`hint`. */
  phase?: TriagePhase | AnalysisPhase | null;
  /** Required when `phase` is set; selects the post-clone "running" copy. */
  stage?: 'triage' | 'analysis';
  onCancel: (() => void) | null;
  cancelLabel: string;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const h = setInterval(() => setElapsedMs(Date.now() - start), 500);
    return () => clearInterval(h);
  }, []);
  const copy =
    stage && phase !== undefined
      ? progressCopy(stage, phase, elapsedMs)
      : { title, hint };
  return (
    <section className="sb-generate-card sb-generate-running">
      <Spinner />
      <h2 className="sb-generate-running-title">{copy.title}</h2>
      <div className="sb-generate-running-meta">
        <span className="sb-generate-elapsed">{formatElapsed(elapsedMs)}</span>
        <span className="sb-generate-hint-dot">·</span>
        <span className="sb-generate-hint">{copy.hint}</span>
      </div>
      {onCancel && (
        <button className="sb-generate-ghost" onClick={onCancel}>
          {cancelLabel}
        </button>
      )}
    </section>
  );
}

function AnalysisStep({
  reserved,
  phase,
  stage = 'analysis',
  prNumber = null,
  onCancel,
}: {
  reserved: number | null;
  phase: AnalysisPhase | null;
  /** 'pr' selects the PR progress copy; defaults to repo-scan 'analysis'. */
  stage?: 'analysis' | 'pr';
  /** PR number, set on PR runs so the card can name the PR. */
  prNumber?: number | null;
  onCancel: () => Promise<void>;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const start = Date.now();
    const h = setInterval(() => setElapsedMs(Date.now() - start), 500);
    return () => clearInterval(h);
  }, []);
  const copy = progressCopy(stage, phase, elapsedMs);
  // On a PR run, lead with the PR number once we're past the queue phase.
  const title =
    stage === 'pr' && prNumber != null && phase !== 'cloning'
      ? `Explaining PR #${prNumber} — ${copy.title.toLowerCase()}`
      : copy.title;

  return (
    <section className="sb-generate-card sb-generate-running">
      <Spinner big />
      <h2 className="sb-generate-running-title">{title}</h2>
      <div className="sb-generate-running-meta">
        <span className="sb-generate-elapsed">{formatElapsed(elapsedMs)}</span>
        <span className="sb-generate-hint-dot">·</span>
        <span className="sb-generate-hint">{copy.hint}</span>
      </div>
      {reserved != null && (
        <div className="sb-generate-reserved">
          ~{reserved.toLocaleString()} credits held during this run
        </div>
      )}
      <button
        className="sb-generate-ghost"
        onClick={() => setConfirmOpen(true)}
        disabled={cancelling}
      >
        {cancelling ? 'Cancelling\u2026' : 'Cancel'}
      </button>

      {confirmOpen && (
        <div className="sb-generate-confirm-backdrop">
          <div
            className="sb-generate-confirm"
            role="dialog"
            aria-modal="true"
          >
            <div className="sb-generate-confirm-title">
              Cancel this analysis?
            </div>
            <p className="sb-generate-confirm-body">
              Work already completed will be billed, but we&rsquo;ll stop any
              further charges. You&rsquo;ll see the final amount on your
              credits page.
            </p>
            <div className="sb-generate-confirm-actions">
              <button
                className="sb-generate-ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Keep running
              </button>
              <button
                className="sb-generate-danger"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true);
                  await onCancel();
                  setConfirmOpen(false);
                }}
              >
                {cancelling ? 'Cancelling\u2026' : 'Cancel analysis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayingStep({
  script,
  scriptId,
  initialAudioStatus,
  designSize,
  onRerun,
  onRestart,
}: {
  script: PresentationScript;
  /** Null when postScript() returned no id — Share button hides. */
  scriptId: string | null;
  /**
   * Audio pre-render status as of when we entered this step. We poll
   * /api/scripts/:id while it's pending/rendering so the banner reflects
   * the final outcome by the time the user finishes watching.
   */
  initialAudioStatus: AudioStatus | null;
  designSize: DesignSize;
  /** Null when the script was replayed from history — no triage to loop back to. */
  onRerun: (() => void) | null;
  onRestart: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(
    initialAudioStatus,
  );

  // Poll while the audio worker is still in flight. Stops on terminal
  // states so we don't churn requests for ready/failed scripts.
  useEffect(() => {
    if (!scriptId) return;
    if (audioStatus === 'ready' || audioStatus === 'failed') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const record = await getScript(scriptId);
        if (cancelled) return;
        setAudioStatus(record.audioStatus ?? null);
      } catch {
        // Network blip — try again next tick.
      }
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scriptId, audioStatus]);
  const presenterRef = useRef<Presenter | null>(null);
  const playerRef = useRef<ScriptPlayer | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [scenePos, setScenePos] = useState({ index: 0, total: 0 });
  const [scale, setScale] = useState(1);
  // Voice defaults to on (Google Chirp 3 HD). Browsers block autoplay with
  // audio unless the user gestures — so we arm paused and wait for the
  // Play button instead of autoplaying.
  const [useVoice, setUseVoice] = useState(true);

  // Scale the fixed-size design surface to fit the stage box at any
  // viewport. Watches the box with a ResizeObserver; the chosen scale
  // is the smaller of width/design.width and height/design.height so the
  // surface always fits without overflowing. Re-runs when designSize
  // changes so prop tweaks update live.
  useLayoutEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setScale(Math.min(width / designSize.width, height / designSize.height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designSize.width, designSize.height]);

  const armPlayer = useCallback(
    (p: Presenter) => {
      playerRef.current?.stop();
      // Pre-rendered MP3s from /api/script's background render are the
      // happy path; GoogleCloudVoicePlayer bridges any scene that's still
      // waiting on its MP3 (in-flight render, legacy script, or failure).
      // See docs/lenzon/AUDIO-PERSISTENCE-PLAN.md.
      const voice: VoicePlayer = useVoice
        ? new PrerenderedAudioVoicePlayer({
            fallback: new GoogleCloudVoicePlayer({
              serverUrl: SERVER_URL,
              wordsPerMinute: 150,
              // Match the live fallback voice to the script's chosen voice.
              voiceName: script.defaults.voice.voiceId,
            }),
            wordsPerMinute: 150,
          })
        : new StubVoicePlayer();
      const player = new ScriptPlayer(script, p, voice, {
        onSceneEnter: (_s, i) =>
          setScenePos({ index: i, total: script.scenes.length }),
        onStateChange: setPlayerState,
      });
      playerRef.current = player;
      setScenePos({ index: 0, total: script.scenes.length });
    },
    [script, useVoice],
  );

  const handleReady = useCallback(
    (p: Presenter) => {
      presenterRef.current = p;
      armPlayer(p);
    },
    [armPlayer],
  );

  // Re-arm when voice toggle flips (Presentation stays mounted).
  useEffect(() => {
    const p = presenterRef.current;
    if (!p) return;
    armPlayer(p);
    // armPlayer captures useVoice; rerun when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useVoice]);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, []);

  const isPlaying = playerState === 'playing';

  return (
    <section className="sb-generate-player">
      {/*
        Audio status banners — hidden for now. The "rendering" / "pending"
        banner is expected on every fresh script (the worker runs in
        after() and finishes ~30s later), so showing it just confused
        viewers. Re-enable if we wire a more refined trigger (e.g. only
        show 'failed' after the worker has actually settled).

        {audioStatus === 'failed' && (
          <div
            className="sb-generate-audio-banner sb-generate-audio-banner-failed"
            role="status"
          >
            Pre-rendered audio unavailable for this run — falling back to live
            narration. If you don't hear anything, the live TTS service is also
            unreachable from this host.
          </div>
        )}
        {(audioStatus === 'pending' || audioStatus === 'rendering') && (
          <div className="sb-generate-audio-banner" role="status">
            Audio still rendering — playback will use live narration until the
            MP3s are ready.
          </div>
        )}
      */}
      <div
        className="sb-generate-player-stage"
        ref={stageBoxRef}
        style={{ aspectRatio: `${designSize.width} / ${designSize.height}` }}
      >
        {/* Fixed-size design surface. Templates are authored in absolute
            pixels against `designSize`; this wrapper scales the whole thing
            with a CSS transform so it fits without overflow. Same pattern
            as HeroPlayer on the landing page. */}
        <div
          className="sb-generate-player-surface"
          style={{
            width: designSize.width,
            height: designSize.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          <Presentation onReady={handleReady} />
        </div>
      </div>
      <div className="sb-generate-player-controls">
        <div className="sb-generate-player-info">
          Scene {scenePos.index + 1} / {scenePos.total} &middot; {playerState}
        </div>
        <div className="sb-generate-player-buttons">
          <button
            className="sb-generate-primary sb-generate-play-btn"
            onClick={() =>
              isPlaying ? playerRef.current?.pause() : playerRef.current?.play()
            }
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            className="sb-generate-ghost"
            onClick={() => playerRef.current?.prev()}
          >
            Prev
          </button>
          <button
            className="sb-generate-ghost"
            onClick={() => playerRef.current?.next()}
          >
            Next
          </button>
          <label className="sb-generate-voice-toggle">
            <input
              type="checkbox"
              checked={useVoice}
              onChange={(e) => setUseVoice(e.target.checked)}
            />
            Voice
          </label>
          {scriptId && (
            <button
              className="sb-generate-ghost"
              onClick={() => setShareOpen(true)}
              aria-label="Share this run"
            >
              <span aria-hidden="true">⧉</span> Share
            </button>
          )}
        </div>
        <div className="sb-generate-player-loop">
          {onRerun && (
            <button className="sb-generate-primary" onClick={onRerun}>
              Try another angle
            </button>
          )}
          <button className="sb-generate-ghost" onClick={onRestart}>
            Pick a new repo
          </button>
        </div>
      </div>
      {shareOpen && scriptId && (
        <ShareModal
          scriptId={scriptId}
          onClose={() => setShareOpen(false)}
          voiceProvider={
            script.defaults.voice.provider === 'google-neural2'
              ? 'google-neural2'
              : 'google-chirp3'
          }
        />
      )}
    </section>
  );
}

function Spinner({ big }: { big?: boolean }) {
  return (
    <div
      className={big ? 'sb-generate-spinner sb-generate-spinner-lg' : 'sb-generate-spinner'}
      aria-hidden
    />
  );
}

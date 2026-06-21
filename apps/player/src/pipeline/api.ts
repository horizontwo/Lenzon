import type {
  AnalysisJSON,
  AnalysisMode,
  AnalysisRecord,
  AnalysisSummary,
  AudioStatus,
  PresentationScript,
  ScriptRecord,
  ScriptSummary,
  TriageRecord,
  TriageReport,
  UserSettings,
} from '@lenzon/shared-types';

export interface SavedScriptResult {
  script: PresentationScript;
  /** Server-assigned id of the persisted Script row (null if save failed). */
  id: string | null;
  /** Auto-derived label shown in the dropdown. */
  label: string | null;
  /**
   * Audio pre-render lifecycle as of the moment the POST returned.
   * Always 'pending' on a fresh create — the worker runs in after().
   * Clients that want to know the final outcome should GET /api/scripts/:id.
   */
  audioStatus: AudioStatus | null;
}

/**
 * Base URL for the server API. In dev, set VITE_SERVER_URL to
 * http://localhost:3001. In prod, the server is on the same origin
 * (lenzon.ai) and the base is "".
 */
// Guarded for non-Vite hosts (e.g. Next SSR) where `import.meta.env` is undefined.
const SERVER_URL = ((import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL ?? '').replace(/\/$/, '');

function api(path: string): string {
  return `${SERVER_URL}${path}`;
}

/**
 * Kick off an analysis. The server returns immediately with the
 * analysis id; the actual agent run happens in the background (Vercel
 * `after()`). Use `pollAnalysis` to wait for completion.
 */
export interface StartAnalyzeResult {
  id: string;
  status: string;
  sessionId?: string;
  estimate?: AnalyzeEstimate;
}

export class InsufficientCreditsError extends Error {
  constructor(
    message: string,
    public readonly needed: number,
    public readonly have: number,
    public readonly estimate: AnalyzeEstimate | null,
  ) {
    super(message);
    this.name = 'InsufficientCreditsError';
  }
}

export class AnalyzeAuthError extends Error {
  constructor() {
    super('not signed in');
    this.name = 'AnalyzeAuthError';
  }
}

/**
 * Recognized codes from the secure-repo flow. Two sources:
 *   - Synchronous server responses on /api/analyze, /api/triage, /api/repos/clone
 *     (e.g. 409 connection_required, 400 org_access_required, 429 too_many_active_runs).
 *   - Terminal-state failures persisted on the analysis/triage row's `error`
 *     field as `clone-<code>: <message>` by the after()-driven clone wait.
 *     The parser below strips the `clone-` prefix so a single map covers both.
 */
export type CloneErrorCode =
  | 'connection_required'
  | 'connection-expired'
  | 'org_access_required'
  | 'repo_not_found'
  | 'repo-not-found'
  | 'repo-too-large'
  | 'unsupported-host'
  | 'malformed-url'
  | 'too_many_active_runs'
  | 'too_many_cluster_runs'
  | 'enqueue_failed'
  | 'clone-timeout'
  | 'clone-failed'
  | 'upload-failed'
  | 'clone-wait-timeout';

export interface CloneErrorDetail {
  /** Canonical error code. */
  code: CloneErrorCode | string;
  /** Server's textual message, when present. */
  message?: string;
  /** 409: which provider/host the user needs to connect. */
  provider?: string;
  host?: string;
  needsConnection?: boolean;
  /** 400 org_access_required + repo_not_found: the parsed owner/repo from the URL. */
  owner?: string;
  repo?: string;
  /** 400 org_access_required: deep-link to GitHub OAuth Apps page. */
  approveUrl?: string;
  /** Whatever GitHub returned in the body of the failing access probe. */
  githubMessage?: string;
  /** 429: the per-user concurrency cap so the UI can surface "you have N in flight". */
  cap?: number;
  /** Identifier the user can give support when surfacing generic clone failures. */
  runId?: string;
}

export class CloneError extends Error {
  constructor(public readonly detail: CloneErrorDetail) {
    super(detail.message ?? detail.code);
    this.name = 'CloneError';
  }
  get code(): CloneErrorDetail['code'] {
    return this.detail.code;
  }
}

/**
 * Parse a row's `error` field into a CloneError when it carries the
 * `clone-<code>: <message>` shape written by the analyze/triage after()
 * blocks. Returns null on non-clone errors so the caller can fall back
 * to the existing toast.
 */
export function parseRowCloneError(error: string | null | undefined): CloneError | null {
  if (!error) return null;
  if (error === 'clone-wait-timeout') {
    return new CloneError({ code: 'clone-wait-timeout', message: error });
  }
  // Format: `clone-<code>: <message>` — produced by analyze/triage after().
  const match = /^clone-([a-z0-9_-]+):\s*(.*)$/i.exec(error);
  if (!match) return null;
  const [, code, message] = match;
  return new CloneError({ code, message });
}

const CLONE_ERROR_CODES = new Set<string>([
  'connection_required',
  'org_access_required',
  'repo_not_found',
  'unsupported-host',
  'malformed-url',
  'too_many_active_runs',
  'too_many_cluster_runs',
  'enqueue_failed',
]);

/**
 * Inspect a response that's already known to be non-OK (and not 401/402 which
 * have their own branches). If the body looks like one of the synchronous
 * clone error shapes the routes emit, return a typed CloneError; otherwise
 * return null and let the caller fall through to its generic error path.
 *
 * Reads the response body once — only call after the more specific
 * status-code branches above. Cloning the response would let earlier branches
 * also peek, but cost-of-clone in browsers is non-trivial vs. the rare
 * we-care-about-the-body cases that are all funneled here.
 */
async function maybeReadCloneError(res: Response): Promise<CloneError | null> {
  if (res.ok) return null;
  // Status filter: 400/409/429/502 are the only codes the clone surface uses.
  if (![400, 409, 429, 502].includes(res.status)) return null;
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const code = typeof body.error === 'string' ? body.error : null;
  if (!code || !CLONE_ERROR_CODES.has(code)) return null;
  return new CloneError({
    code,
    message: typeof body.message === 'string' ? body.message : undefined,
    provider: typeof body.provider === 'string' ? body.provider : undefined,
    host: typeof body.host === 'string' ? body.host : undefined,
    needsConnection:
      typeof body.needsConnection === 'boolean' ? body.needsConnection : undefined,
    owner: typeof body.owner === 'string' ? body.owner : undefined,
    repo: typeof body.repo === 'string' ? body.repo : undefined,
    approveUrl: typeof body.approveUrl === 'string' ? body.approveUrl : undefined,
    githubMessage:
      typeof body.githubMessage === 'string' ? body.githubMessage : undefined,
    cap: typeof body.cap === 'number' ? body.cap : undefined,
    runId: typeof body.runId === 'string' ? body.runId : undefined,
  });
}

/**
 * Errors from the PR-metadata fetch the server runs before a PR analysis
 * starts (`/api/pr/analyze`). These are distinct from clone errors — they
 * mean we couldn't read the PR from GitHub at all (private/missing, or
 * GitHub rate-limited us). The UI maps each `kind` to its own copy.
 */
export type PrMetadataErrorKind =
  | 'not-found-or-private'
  | 'rate-limited'
  | 'github-error'
  | 'unsupported-host';

export class PrMetadataClientError extends Error {
  constructor(
    public readonly kind: PrMetadataErrorKind,
    /** Owner parsed from the repo URL, when the UI can use it to deep-link
     *  the GitHub App install flow ("install for {owner}"). */
    public readonly owner: string | null,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'PrMetadataClientError';
  }
}

export interface StartPrAnalyzeResult {
  id: string;
  status: string;
  estimate?: AnalyzeEstimate;
  cloneRunId?: string;
}

/**
 * Kick off a PR explainer analysis. Mirrors `startAnalyze` but hits
 * `/api/pr/analyze` with a PR coordinate. The server resolves the user's
 * own GitHub App installation server-side for private PRs — the client
 * NEVER sends installationId. Returns immediately; poll via `getAnalysis`
 * (the row is `kind='pr'` but the polling endpoint is shared).
 *
 * `owner` is parsed from the repo URL only so a PR-metadata error can carry
 * it for the "install the GitHub App for {owner}" affordance.
 */
export async function startPrAnalyze(
  repoUrl: string,
  prNumber: number,
  baseRef?: string,
): Promise<StartPrAnalyzeResult> {
  const owner =
    /github\.com\/([^/\s]+)\//i.exec(repoUrl)?.[1] ?? null;
  const res = await fetch(api('/api/pr/analyze'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoUrl, prNumber, ...(baseRef ? { baseRef } : {}) }),
  });
  if (res.status === 401) throw new AnalyzeAuthError();
  if (res.status === 402) {
    const body = (await res.json()) as {
      needed?: number;
      have?: number;
      estimate?: AnalyzeEstimate;
    };
    throw new InsufficientCreditsError(
      'insufficient credits',
      body.needed ?? 0,
      body.have ?? 0,
      body.estimate ?? null,
    );
  }
  // PR-metadata errors before clone errors: maybeReadCloneError doesn't
  // recognize 'not-found-or-private'/'rate-limited'/'github-error', and a 429
  // here can be EITHER the GitHub-API rate limit (metadata) OR the
  // concurrency cap (clone) — disambiguate by the body `error` field.
  if ([400, 404, 429, 502].includes(res.status)) {
    let body: { error?: string; message?: string } = {};
    try {
      body = (await res.clone().json()) as { error?: string; message?: string };
    } catch {
      // fall through to maybeReadCloneError / generic
    }
    const code = body.error;
    if (
      code === 'not-found-or-private' ||
      code === 'rate-limited' ||
      code === 'github-error' ||
      code === 'unsupported-host'
    ) {
      throw new PrMetadataClientError(code, owner, body.message);
    }
  }
  const cloneErr = await maybeReadCloneError(res);
  if (cloneErr) throw cloneErr;
  if (!res.ok) {
    throw new Error(`pr analyze failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StartPrAnalyzeResult;
}

export async function startAnalyze(
  repoUrl: string,
  mode?: AnalysisMode,
  triageReport?: TriageReport,
  triageSessionId?: string | null,
): Promise<StartAnalyzeResult> {
  const res = await fetch(api('/api/analyze'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      repoUrl,
      mode,
      triageReport,
      triageSessionId: triageSessionId ?? undefined,
    }),
  });
  if (res.status === 401) {
    throw new AnalyzeAuthError();
  }
  if (res.status === 402) {
    const body = (await res.json()) as {
      needed?: number;
      have?: number;
      estimate?: AnalyzeEstimate;
    };
    throw new InsufficientCreditsError(
      'insufficient credits',
      body.needed ?? 0,
      body.have ?? 0,
      body.estimate ?? null,
    );
  }
  const cloneErr = await maybeReadCloneError(res);
  if (cloneErr) throw cloneErr;
  if (!res.ok) {
    throw new Error(`analyze failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StartAnalyzeResult;
}

/**
 * Ask the server to interrupt a running analysis. Best-effort: the final
 * status change (`cancelled`) still arrives via the polling loop — this
 * returns as soon as the server accepts the intent.
 */
export async function cancelAnalysis(id: string): Promise<void> {
  const res = await fetch(api(`/api/analyze/${id}/cancel`), {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 409) return; // already completed; nothing to do
  if (!res.ok) {
    throw new Error(`cancel failed: ${res.status} ${await res.text()}`);
  }
}

export interface AnalyzeEstimate {
  usd: number;
  credits: number;
  reasoning: string;
}

export interface AnalyzeEstimateResponse {
  estimate: AnalyzeEstimate;
  /** Ledger balance, or null when the caller isn't authenticated. */
  balance: number | null;
  /** Ledger balance minus held reservations. Null when unauthenticated. */
  availableBalance: number | null;
}

/**
 * Pre-flight estimate for an analysis run. Pure calculation — no side
 * effects, no auth required. Returns the user's balance when signed in
 * so the triage modal can show "~X credits · you have Y".
 */
export async function fetchAnalyzeEstimate(
  mode: AnalysisMode | undefined,
  triageReport: TriageReport,
): Promise<AnalyzeEstimateResponse> {
  const res = await fetch(api('/api/analyze/estimate'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, triageReport }),
  });
  if (!res.ok) {
    throw new Error(`estimate failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AnalyzeEstimateResponse;
}

/**
 * Kick off the triage pass. The server returns immediately with the
 * triage id and the Managed Agents session id; the actual scouting
 * happens in the background (Vercel `after()`). Use `pollTriage` to
 * wait for completion.
 */
export interface StartTriageResult {
  id: string;
  sessionId: string;
  status: 'running';
}

export async function runTriage(
  repoUrl: string,
  signal?: AbortSignal,
): Promise<StartTriageResult> {
  const res = await fetch(api('/api/triage'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoUrl }),
    signal,
  });
  if (res.status === 401) throw new AnalyzeAuthError();
  const cloneErr = await maybeReadCloneError(res);
  if (cloneErr) throw cloneErr;
  if (!res.ok) {
    throw new Error(`triage failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StartTriageResult;
}

/**
 * Fetch the current state of a triage. Returns the record with
 * status = 'running' | 'ready' | 'error'; `data` is only populated
 * when status is 'ready'.
 */
export async function getTriage(id: string): Promise<TriageRecord> {
  const res = await fetch(api(`/api/triage/${id}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`get triage failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TriageRecord;
}

export interface PollTriageOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (record: TriageRecord) => void;
  signal?: AbortSignal;
}

/**
 * Poll `/api/triage/:id` until status leaves 'running'. Returns the
 * completed record (status = 'ready' or 'error'). Default: 2s interval,
 * 5 minute ceiling — triage is faster than analysis.
 */
export async function pollTriage(
  id: string,
  opts: PollTriageOptions = {},
): Promise<TriageRecord> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const start = Date.now();

  for (;;) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const record = await getTriage(id);
    opts.onTick?.(record);
    if (record.status === 'ready' || record.status === 'error') {
      return record;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`poll timeout after ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
  }
}

/**
 * Fetch the current state of an analysis. Returns the record with
 * status = 'running' | 'ready' | 'error'; `data` is only populated
 * when status is 'ready'.
 */
export async function getAnalysis(id: string): Promise<AnalysisRecord> {
  const res = await fetch(api(`/api/analyze/${id}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`get analysis failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AnalysisRecord;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (record: AnalysisRecord) => void;
  signal?: AbortSignal;
}

/**
 * Poll `/api/analyze/:id` until status leaves 'running'. Returns the
 * completed record (status = 'ready' or 'error'). Default: 3s interval,
 * 15 minute ceiling.
 */
export async function pollAnalysis(
  id: string,
  opts: PollOptions = {},
): Promise<AnalysisRecord> {
  const intervalMs = opts.intervalMs ?? 3000;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();

  for (;;) {
    if (opts.signal?.aborted) throw new Error('aborted');
    const record = await getAnalysis(id);
    opts.onTick?.(record);
    // 'cancelling' is a transient state — the user asked to cancel, the
    // server is processing it. We keep polling until the server flips to
    // 'cancelled' (or the run finished first and flipped to 'ready').
    if (
      record.status === 'ready' ||
      record.status === 'error' ||
      record.status === 'cancelled'
    ) {
      return record;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`poll timeout after ${timeoutMs}ms`);
    }
    await sleep(intervalMs);
  }
}

export interface MeResponse {
  email: string;
  balance: number;
  availableBalance: number;
  createdAt: string;
}

/** Returns the signed-in user or null when not authenticated. */
export async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch(api('/api/auth/me'), { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`me failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as MeResponse;
}

/**
 * List prior analyses, newest first. Pass a repoUrl to filter; omit
 * to list across all repos. Owner-scoped on the server — returns an
 * empty list for anonymous callers.
 */
export async function listAnalyses(
  repoUrl?: string,
): Promise<AnalysisSummary[]> {
  const qs = repoUrl ? `?repoUrl=${encodeURIComponent(repoUrl)}` : '';
  const res = await fetch(api(`/api/analyses${qs}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`list analyses failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { analyses: AnalysisSummary[] };
  return body.analyses;
}

export async function postScript(
  analysis: AnalysisJSON,
  settings: UserSettings,
  analysisId?: string,
): Promise<SavedScriptResult> {
  const res = await fetch(api('/api/script'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ analysis, settings, analysisId }),
  });
  if (res.status === 401) throw new AnalyzeAuthError();
  if (!res.ok) {
    throw new Error(`script failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as PresentationScript & {
    _id?: string | null;
    _label?: string | null;
    _audioStatus?: AudioStatus | null;
  };
  const { _id, _label, _audioStatus, ...rest } = body;
  return {
    script: rest as PresentationScript,
    id: _id ?? null,
    label: _label ?? null,
    audioStatus: _audioStatus ?? null,
  };
}

/**
 * List saved scripts, newest first. Pass `analysisId` to scope to a
 * specific analysis run, or `repoUrl` to span all analyses of a repo.
 */
export async function listScripts(opts: {
  analysisId?: string;
  repoUrl?: string;
} = {}): Promise<ScriptSummary[]> {
  const params = new URLSearchParams();
  if (opts.analysisId) params.set('analysisId', opts.analysisId);
  if (opts.repoUrl) params.set('repoUrl', opts.repoUrl);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(api(`/api/scripts${qs}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`list scripts failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { scripts: ScriptSummary[] };
  return body.scripts;
}

/** Fetch the full saved Script record (includes the script `data` blob). */
export async function getScript(id: string): Promise<ScriptRecord> {
  const res = await fetch(api(`/api/scripts/${id}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`get script failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ScriptRecord;
}

/**
 * Viewer-mode fetch for a Script by id. Uses the replay endpoint so we
 * get the raw PresentationScript stripped of cost/persistence metadata.
 * Pass `token` for unlisted Scripts; omit when the caller owns the Script
 * (their session cookie covers access).
 *
 * Throws distinct errors the viewer UI can render:
 *   - ViewerNotFoundError  → 404: script doesn't exist or isn't reachable
 *   - ViewerAuthError      → 401: token required and missing
 *   - ViewerForbiddenError → 403: token provided but wrong
 */
export class ViewerNotFoundError extends Error {
  constructor() {
    super('not found');
    this.name = 'ViewerNotFoundError';
  }
}

export class ViewerAuthError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'ViewerAuthError';
  }
}

export class ViewerForbiddenError extends Error {
  constructor() {
    super('forbidden');
    this.name = 'ViewerForbiddenError';
  }
}

export type ShareVisibility = 'public' | 'unlisted' | 'private';

export interface ShareResult {
  id: string;
  visibility: ShareVisibility;
  shareToken: string | null;
}

/**
 * Owner-only: flip a saved script's visibility. When flipping to 'unlisted'
 * the server mints (or reuses) a shareToken so the caller can build a
 * /viewer/:id?token=... link. Public scripts need no token.
 */
export async function shareScript(
  id: string,
  visibility: ShareVisibility,
): Promise<ShareResult> {
  const res = await fetch(api(`/api/scripts/${id}/share`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) {
    throw new Error(`share failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ShareResult;
}

export async function fetchViewerScript(
  id: string,
  token: string | null,
  captureToken: string | null = null,
): Promise<PresentationScript> {
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (captureToken) params.set('captureToken', captureToken);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(api(`/api/scripts/${id}/replay${qs}`), {
    credentials: 'include',
  });
  if (res.status === 404) throw new ViewerNotFoundError();
  if (res.status === 401) throw new ViewerAuthError();
  if (res.status === 403) throw new ViewerForbiddenError();
  if (!res.ok) {
    throw new Error(`viewer fetch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PresentationScript;
}

export interface PostNoteInput {
  /**
   * Required — the server rejects notes without a scriptId since the
   * route is author-only and ownership is checked via the Script row.
   * Sample scripts (which have no persisted row) can't be flagged.
   */
  scriptId: string;
  scriptLabel: string | null;
  analysisId: string | null;
  repoUrl: string | null;
  sceneIndex: number;
  sceneId: string;
  sceneTemplate: string;
  note: string;
  /**
   * Reviewer's best guess at which layer caused the issue:
   *  - 'analysis'  Agent 1 produced wrong/off-tone content
   *  - 'script'    Agent 2 picked the wrong template or wrote bad narration
   *  - 'template'  the primitive itself rendered poorly
   * Null/undefined means "not sure" — leave it and sort it out later.
   */
  suspectArea?: 'analysis' | 'script' | 'template' | null;
  /**
   * Version of the template the client actually rendered for this scene,
   * resolved from the registry at flag time. The server trusts this field
   * because the server can't know what the client saw if a rolling deploy
   * updated the registry between render and flag. Null if the template
   * isn't registered (e.g. a stale script referencing a removed template).
   */
  templateVersionAtCapture?: string | null;
}

/** Save a reviewer flag/note against the current scene. */
export async function postNote(
  input: PostNoteInput,
): Promise<{ id: string; createdAt: string }> {
  const res = await fetch(api('/api/notes'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`note failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; createdAt: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Render-worker export — see docs/lenzon/VIDEO-EXPORT-PLAN.md.
// POST /api/export to enqueue, GET /api/export/:jobId to poll until the
// row reaches a terminal state.

export type RenderJobStatus = 'queued' | 'running' | 'success' | 'failed';

export interface StartExportResult {
  jobId: string;
}

export interface ExportStatus {
  jobId: string;
  status: RenderJobStatus;
  scriptId: string;
  presignedUrl: string | null;
  presignedExpiresAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Estimated video duration of the resulting MP4 in ms (sum of scenes). */
  videoDurationMs: number | null;
  /** Estimated wall-clock render time in ms — videoDurationMs scaled by
   *  the recorder's empirical capture+encode+upload multiplier. */
  estimatedDurationMs: number | null;
}

export type StartExportFailureKind =
  | 'unauthorized'
  | 'script_not_found'
  | 'audio_not_ready'
  | 'too_many_active_runs'
  | 'too_many_cluster_runs'
  | 'app_url_missing'
  | 'enqueue_failed'
  | 'unknown';

export class StartExportError extends Error {
  constructor(
    public readonly kind: StartExportFailureKind,
    public readonly status: number,
    public readonly retryAfterSeconds: number | null,
    message: string,
    /**
     * Populated when `kind === 'too_many_active_runs'`. Lets the UI pivot
     * into polling the blocking job(s) instead of showing a blind wait
     * message.
     */
    public readonly activeJobIds: string[] = [],
    /** Populated when `kind === 'audio_not_ready'`. */
    public readonly audioStatus: string | null = null,
    public readonly audioError: string | null = null,
  ) {
    super(message);
    this.name = 'StartExportError';
  }
}

export async function startExport(scriptId: string): Promise<StartExportResult> {
  const res = await fetch(api('/api/export'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scriptId }),
  });
  if (!res.ok) {
    let body: {
      error?: string;
      activeJobIds?: unknown;
      audioStatus?: unknown;
      audioError?: unknown;
    } = {};
    try {
      body = (await res.json()) as {
        error?: string;
        activeJobIds?: unknown;
        audioStatus?: unknown;
        audioError?: unknown;
      };
    } catch {
      // fall through
    }
    const retryAfterRaw = res.headers.get('Retry-After');
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;
    const kind: StartExportFailureKind =
      res.status === 401
        ? 'unauthorized'
        : body.error === 'script_not_found'
          ? 'script_not_found'
          : body.error === 'audio_not_ready'
            ? 'audio_not_ready'
            : body.error === 'too_many_active_runs'
              ? 'too_many_active_runs'
              : body.error === 'too_many_cluster_runs'
                ? 'too_many_cluster_runs'
                : body.error === 'app_url_missing'
                  ? 'app_url_missing'
                  : body.error === 'enqueue_failed'
                    ? 'enqueue_failed'
                    : 'unknown';
    const activeJobIds = Array.isArray(body.activeJobIds)
      ? body.activeJobIds.filter((x): x is string => typeof x === 'string')
      : [];
    const audioStatus =
      typeof body.audioStatus === 'string' ? body.audioStatus : null;
    const audioError =
      typeof body.audioError === 'string' ? body.audioError : null;
    throw new StartExportError(
      kind,
      res.status,
      Number.isFinite(retryAfter) ? retryAfter : null,
      body.error ?? `export failed (${res.status})`,
      activeJobIds,
      audioStatus,
      audioError,
    );
  }
  return (await res.json()) as StartExportResult;
}

export interface RerenderAudioResult {
  /** Returned status as of the moment the request returns. Always
   *  'pending' on a successful kick — clients should poll GET
   *  /api/scripts/:id and watch for 'ready'/'failed'. */
  audioStatus: AudioStatus | null;
}

/**
 * Owner-only: re-run the per-scene narration MP3 render for a saved
 * script. Useful when a previous attempt landed `audioStatus='failed'`
 * (e.g. transient AWS signature error) and the user wants to recover
 * without regenerating the entire script.
 *
 * Returns immediately; the actual render runs in a Vercel `after()`
 * block, same as on script create. Poll GET /api/scripts/:id to watch
 * the lifecycle.
 */
export async function rerenderScriptAudio(
  scriptId: string,
): Promise<RerenderAudioResult> {
  const res = await fetch(
    api(`/api/scripts/${encodeURIComponent(scriptId)}/rerender-audio`),
    { method: 'POST', credentials: 'include' },
  );
  if (res.status === 401) throw new AnalyzeAuthError();
  if (res.status === 404) {
    throw new Error('script not found, or not yours');
  }
  if (!res.ok) {
    throw new Error(`rerender-audio failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as RerenderAudioResult;
}

export async function getExportStatus(jobId: string): Promise<ExportStatus> {
  const res = await fetch(api(`/api/export/${encodeURIComponent(jobId)}`), {
    credentials: 'include',
  });
  if (res.status === 404) {
    throw new Error('export job not found');
  }
  if (!res.ok) {
    throw new Error(`export status failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ExportStatus;
}

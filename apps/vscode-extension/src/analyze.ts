/**
 * Phase 6 — the extension SCAN contract (plan §10.5).
 *
 * One call: POST /api/extension/analyze with { repoFullName, prNumber } (or
 * { repoFullName, branch }) and a Bearer token, to initiate analysis of an
 * already-pushed PR that hasn't been scanned yet. Pure transport — no UI. The
 * orchestration (consent → trigger → poll player-link → playback) lives in
 * scanFlow.ts so it can be driven from either the player panel (Phase 6) or the
 * sidebar view (Phase 7).
 *
 * Credits are checked asynchronously inside the worker, so a successful trigger
 * returns `scanning` immediately; insufficient-credits surfaces later as a
 * `quota_blocked` result from player-link (see playerLink.ts), not here.
 */

export type StartScanResult =
  | { kind: 'scanning'; runId: string }
  | { kind: 'already_running'; runId: string } // a run is already in flight (§10.7)
  | { kind: 'ready'; runId: string } // a successful run already exists for this SHA
  | { kind: 'choose-pr'; prNumbers: number[] } // branch backs >1 open PR (Risk 2)
  | { kind: 'no_access_or_no_pr' } // no install, no open PR, or PR not found
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number; message: string };

export interface StartScanRequest {
  apiBaseUrl: string;
  token: string;
  repoFullName: string;
  prNumber?: number;
  branch?: string;
}

export async function startScan(
  req: StartScanRequest,
): Promise<StartScanResult> {
  const base = req.apiBaseUrl.replace(/\/$/, '');
  const payload: Record<string, unknown> = { repoFullName: req.repoFullName };
  if (typeof req.prNumber === 'number') payload.prNumber = req.prNumber;
  else if (req.branch) payload.branch = req.branch;

  let res: Response;
  try {
    res = await fetch(`${base}/api/extension/analyze`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${req.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return {
      kind: 'error',
      status: 0,
      message: e instanceof Error ? e.message : 'network error',
    };
  }

  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 404) return { kind: 'no_access_or_no_pr' };

  const body = (await safeJson(res)) as
    | {
        status?: string;
        kind?: string;
        runId?: string;
        prs?: { prNumber: number }[];
        message?: string;
      }
    | null;

  if (res.status === 409 && body?.runId) {
    return { kind: 'already_running', runId: body.runId };
  }
  if (body?.kind === 'choose-pr' && Array.isArray(body.prs)) {
    return { kind: 'choose-pr', prNumbers: body.prs.map((p) => p.prNumber) };
  }
  if (res.status === 202 && body?.status === 'scanning' && body.runId) {
    return { kind: 'scanning', runId: body.runId };
  }
  if (res.ok && body?.status === 'ready' && body.runId) {
    return { kind: 'ready', runId: body.runId };
  }

  return {
    kind: 'error',
    status: res.status,
    message: body?.message ?? `unexpected ${res.status}`,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

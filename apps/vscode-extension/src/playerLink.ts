/**
 * Phase 2 — the extension/service contract (plan §3a).
 *
 * One call: POST /api/extension/player-link with { repoFullName, prNumber } and
 * a Bearer token, receive a pre-authorized player URL (or analyzing/not-analyzed).
 * The extension never builds the URL or mints the token — the service does both.
 */

export type PlayerLinkResult =
  | { kind: 'ready'; playerUrl: string; prNumber?: number }
  | { kind: 'choose-pr'; prNumbers: number[] } // branch backs >1 open PR (Risk 2)
  | { kind: 'analyzing'; pollAfterMs: number }
  | { kind: 'quota_blocked' } // Phase 6: a run ran out of credits (§10.6 top-up)
  | { kind: 'scan_failed' } // Phase 6: a run failed (§10.6 retry)
  // not_analyzed carries the resolved prNumber when the server resolved a
  // concrete PR (supplied, or a branch → exactly one open PR) but has no run for
  // it yet — so the extension can offer "Scan PR #N" (Phase 6, §10.1). Absent
  // when there was no PR to resolve (no install / no open PR for the branch).
  | { kind: 'not_analyzed'; prNumber?: number }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number; message: string };

/**
 * Identify the PR either explicitly (prNumber) or by branch (server resolves).
 * Exactly one should be set; prNumber wins if both are present.
 */
export interface PlayerLinkRequest {
  apiBaseUrl: string; // e.g. https://www.lenzon.ai
  token: string; // Bearer credential (API key in Phase 2; device-flow in Phase 4)
  repoFullName: string; // "owner/repo"
  prNumber?: number;
  branch?: string;
}

export async function fetchPlayerLink(
  req: PlayerLinkRequest,
): Promise<PlayerLinkResult> {
  const base = req.apiBaseUrl.replace(/\/$/, '');
  const payload: Record<string, unknown> = { repoFullName: req.repoFullName };
  if (typeof req.prNumber === 'number') payload.prNumber = req.prNumber;
  else if (req.branch) payload.branch = req.branch;

  let res: Response;
  try {
    res = await fetch(`${base}/api/extension/player-link`, {
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
  if (res.status === 404) {
    const body = (await safeJson(res)) as { prNumber?: number } | null;
    return {
      kind: 'not_analyzed',
      ...(typeof body?.prNumber === 'number' ? { prNumber: body.prNumber } : {}),
    };
  }

  if (res.status === 202) {
    const body = (await safeJson(res)) as { pollAfterMs?: number } | null;
    return { kind: 'analyzing', pollAfterMs: body?.pollAfterMs ?? 4000 };
  }

  if (res.ok) {
    const body = (await safeJson(res)) as
      | {
          kind?: string;
          status?: string;
          playerUrl?: string;
          prNumber?: number;
          prs?: { prNumber: number }[];
        }
      | null;
    if (body?.kind === 'choose-pr' && Array.isArray(body.prs)) {
      return { kind: 'choose-pr', prNumbers: body.prs.map((p) => p.prNumber) };
    }
    // Phase 6: a run the caller can see that went quota_blocked / failed comes
    // back as 200 with a status (not a playerUrl) so the scan poller can show
    // the top-up / retry states instead of treating it as a generic error.
    if (body?.status === 'quota_blocked') return { kind: 'quota_blocked' };
    if (body?.status === 'scan_failed') return { kind: 'scan_failed' };
    if (body?.playerUrl) {
      return { kind: 'ready', playerUrl: body.playerUrl, prNumber: body.prNumber };
    }
    return { kind: 'error', status: res.status, message: 'missing playerUrl in response' };
  }

  return {
    kind: 'error',
    status: res.status,
    message: `unexpected ${res.status}`,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

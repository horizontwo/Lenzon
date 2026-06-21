/**
 * Phase 3 — the repo-runs pick-list (plan §3b).
 *
 * "Here's what Lenzon has already analyzed for this repo." The fallback when
 * branch→PR resolution finds nothing, and a first-class browse affordance.
 */

export interface RepoRun {
  prNumber: number;
  prTitle: string | null;
  headSha: string;
  status: string;
  createdAt: string;
}

export type RepoRunsResult =
  | { kind: 'ok'; runs: RepoRun[] }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number; message: string };

export interface RepoRunsRequest {
  apiBaseUrl: string;
  token: string;
  repoFullName: string;
}

export async function fetchRepoRuns(
  req: RepoRunsRequest,
): Promise<RepoRunsResult> {
  const base = req.apiBaseUrl.replace(/\/$/, '');
  const qs = new URLSearchParams({ repoFullName: req.repoFullName });
  let res: Response;
  try {
    res = await fetch(`${base}/api/extension/repo-runs?${qs}`, {
      headers: { authorization: `Bearer ${req.token}` },
    });
  } catch (e) {
    return {
      kind: 'error',
      status: 0,
      message: e instanceof Error ? e.message : 'network error',
    };
  }

  if (res.status === 401) return { kind: 'unauthorized' };
  if (!res.ok) {
    return { kind: 'error', status: res.status, message: `unexpected ${res.status}` };
  }

  try {
    const body = (await res.json()) as { runs?: RepoRun[] };
    return { kind: 'ok', runs: Array.isArray(body.runs) ? body.runs : [] };
  } catch (e) {
    return {
      kind: 'error',
      status: res.status,
      message: e instanceof Error ? e.message : 'bad response',
    };
  }
}

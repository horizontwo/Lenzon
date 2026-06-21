/**
 * Phase 7 UX (§11.2, added 2026-06-18) — the signed-in session summary and the
 * user's own scans across all repos. Two cheap reads for the sidebar's top rail
 * + "My scans" accordion. Both API-key-authed exactly like repoRuns.ts.
 */

export interface SessionInfo {
  email: string;
  /** Available credits — gross balance minus held reservations (gates a scan). */
  availableBalance: number;
  /** Gross balance (before holds). */
  balance: number;
}

export type SessionResult =
  | { kind: 'ok'; session: SessionInfo }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number; message: string };

export interface SessionRequest {
  apiBaseUrl: string;
  token: string;
}

export async function fetchSession(req: SessionRequest): Promise<SessionResult> {
  const base = req.apiBaseUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/extension/me`, {
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
    const body = (await res.json()) as Partial<SessionInfo>;
    if (typeof body.email !== 'string') {
      return { kind: 'error', status: res.status, message: 'bad response' };
    }
    return {
      kind: 'ok',
      session: {
        email: body.email,
        availableBalance: Number(body.availableBalance ?? 0),
        balance: Number(body.balance ?? 0),
      },
    };
  } catch (e) {
    return {
      kind: 'error',
      status: res.status,
      message: e instanceof Error ? e.message : 'bad response',
    };
  }
}

/** A row in "My scans" — like RepoRun, but carries the repo since it spans repos. */
export interface MyRun {
  repoFullName: string;
  prNumber: number;
  prTitle: string | null;
  headSha: string;
  status: string;
  createdAt: string;
}

export type MyRunsResult =
  | { kind: 'ok'; runs: MyRun[] }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status: number; message: string };

export async function fetchMyRuns(req: SessionRequest): Promise<MyRunsResult> {
  const base = req.apiBaseUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api/extension/my-runs`, {
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
    const body = (await res.json()) as { runs?: MyRun[] };
    return { kind: 'ok', runs: Array.isArray(body.runs) ? body.runs : [] };
  } catch (e) {
    return {
      kind: 'error',
      status: res.status,
      message: e instanceof Error ? e.message : 'bad response',
    };
  }
}

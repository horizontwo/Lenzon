import { startScan } from './analyze';
import { fetchPlayerLink } from './playerLink';

/**
 * Phase 6 — the scan orchestration, surface-agnostic on purpose.
 *
 * The flow is: cost-consent (§10.6) → trigger /api/extension/analyze → handle
 * the trigger outcome (409 jumps straight to polling, the double-spend guard
 * from §10.7) → poll player-link until the run flips to ready / quota_blocked /
 * failed → drive the host surface to the matching state.
 *
 * It deliberately knows NOTHING about WebviewPanel. It talks to the host through
 * a small `ScanRenderer` callback interface, so the Phase 6 player panel drives
 * it now and the Phase 7 sidebar (§11.3) drives the identical function later
 * with no rework. The renderer owns *how* a state looks; this owns *when*.
 */

export interface ScanTarget {
  apiBaseUrl: string;
  token: string;
  repoFullName: string;
  /** A resolved PR — scanning always targets a specific PR (§10.2). */
  prNumber: number;
  /** Display label, e.g. "repo #123". */
  prLabel: string;
}

/**
 * What the flow asks the host surface to show. A renderer maps each to its own
 * themed view (the player panel does this via LenzonPanel; the sidebar will do
 * it in its WebviewView). All are terminal except `confirm`/`scanning`, which
 * the flow transitions away from itself.
 */
export interface ScanRenderer {
  /** Ask for consent. Call `onConfirm`/`onCancel` exactly once. */
  confirm(prLabel: string, onConfirm: () => void, onCancel: () => void): void;
  /** A scan is running; the flow is auto-polling. */
  scanning(prLabel: string): void;
  /** The explainer is ready — open the player at `playerUrl`. */
  ready(playerUrl: string): void;
  /** Out of credits (§10.6) — offer a top-up link-out. */
  quotaBlocked(): void;
  /** The scan failed — offer a retry that re-runs the whole flow. */
  scanFailed(onRetry: () => void): void;
  /** A transport/unexpected error. `onRetry` re-runs the flow. */
  error(message: string, onRetry: () => void): void;
  /** Auth rejected — the caller handles re-auth (e.g. trigger sign-in). */
  unauthorized(): void;
}

const MAX_POLL_MS = 1000 * 60 * 8; // give up after ~8 min (scans rarely exceed this)

/**
 * Entry point. Shows consent first; only proceeds to a paid scan on confirm.
 * `sleep` is injected so tests (and the sidebar) can control timing; defaults
 * to real timers.
 */
export function runScanFlow(
  target: ScanTarget,
  renderer: ScanRenderer,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): void {
  renderer.confirm(
    target.prLabel,
    () => void triggerAndPoll(target, renderer, sleep),
    () => {
      /* cancelled — the caller decides what to show next (e.g. back to empty) */
    },
  );
}

async function triggerAndPoll(
  target: ScanTarget,
  renderer: ScanRenderer,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  renderer.scanning(target.prLabel);

  const started = await startScan({
    apiBaseUrl: target.apiBaseUrl,
    token: target.token,
    repoFullName: target.repoFullName,
    prNumber: target.prNumber,
  });

  switch (started.kind) {
    case 'scanning':
    case 'already_running':
      // 409 already_running is NOT an error: a run (ours, a double-click's, or a
      // webhook's) is in flight. Jump straight to polling — the double-spend
      // guard (§10.7). Both land in the same poll loop.
      break;
    case 'ready':
      // A successful run already existed for this SHA — resolve it to a URL.
      await pollToReady(target, renderer, sleep);
      return;
    case 'unauthorized':
      renderer.unauthorized();
      return;
    case 'no_access_or_no_pr':
      // Public PRs scan without an install now; this means the PR doesn't exist
      // (wrong number / it's an issue, not a PR) or it's a private repo the
      // user has no Lenzon install on.
      renderer.error(
        "Lenzon can't scan this PR. Check the PR exists — or, if it's in a private repo, that the Lenzon GitHub App is installed on it.",
        () => runScanFlow(target, renderer, sleep),
      );
      return;
    case 'choose-pr':
      // The flow is always handed a concrete prNumber, so the server shouldn't
      // return choose-pr here; treat defensively as a transient error.
      renderer.error(
        'Lenzon returned multiple PRs unexpectedly.',
        () => runScanFlow(target, renderer, sleep),
      );
      return;
    case 'error':
      renderer.error(
        `Couldn't start the scan (${started.message}).`,
        () => runScanFlow(target, renderer, sleep),
      );
      return;
  }

  await pollToReady(target, renderer, sleep);
}

/**
 * Poll player-link until the run resolves. The §10.4a PrExplainerRun upsert is
 * what lets these polls see the run; quota_blocked / scan_failed are reported
 * distinctly by player-link (§10.6) so we can surface top-up / retry.
 */
async function pollToReady(
  target: ScanTarget,
  renderer: ScanRenderer,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  const deadline = elapsedClock(MAX_POLL_MS);

  for (;;) {
    const link = await fetchPlayerLink({
      apiBaseUrl: target.apiBaseUrl,
      token: target.token,
      repoFullName: target.repoFullName,
      prNumber: target.prNumber,
    });

    switch (link.kind) {
      case 'ready':
        renderer.ready(link.playerUrl);
        return;
      case 'quota_blocked':
        renderer.quotaBlocked();
        return;
      case 'scan_failed':
        renderer.scanFailed(() => runScanFlow(target, renderer, sleep));
        return;
      case 'unauthorized':
        renderer.unauthorized();
        return;
      case 'analyzing':
      case 'not_analyzed':
        // not_analyzed can occur in the brief window before the run row is
        // visible to a poll; keep waiting until it flips or we time out.
        break;
      case 'choose-pr':
      case 'error':
        renderer.error(
          link.kind === 'error'
            ? `Lost contact while scanning (${link.message}).`
            : 'Unexpected response while scanning.',
          () => runScanFlow(target, renderer, sleep),
        );
        return;
    }

    if (deadline.expired()) {
      renderer.error(
        'The scan is taking longer than expected. It may still finish — try opening this PR again shortly.',
        () => runScanFlow(target, renderer, sleep),
      );
      return;
    }
    const waitMs = link.kind === 'analyzing' ? link.pollAfterMs : 4000;
    await sleep(waitMs);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A wall-clock deadline: anchor a start time, report when the budget elapses. */
function elapsedClock(budgetMs: number): { expired: () => boolean } {
  const start = Date.now();
  return { expired: () => Date.now() - start > budgetMs };
}

import * as vscode from 'vscode';
import {
  detectRepoFromWorkspace,
  onGitContextChanged,
  type GitHubRepo,
  type WorkspaceGitContext,
} from './git';
import { fetchPlayerLink } from './playerLink';
import { fetchRepoRuns, type RepoRun } from './repoRuns';
import { openTestHarness } from './testHarness';
import { getToken, signIn, signOut } from './auth';
import { createLenzonPanel, type LenzonPanel } from './panel';
import {
  runScanFlow,
  type ScanRenderer,
  type ScanTarget,
} from './scanFlow';
import { LenzonSidebarProvider, type SidebarHost } from './sidebar';

/**
 * Phases 0–3.
 *
 * Phase 0 (settled): the live `/viewer/<id>/embed` player renders AND plays in
 * the VS Code webview sandbox.
 * Phase 1 (settled): detect the workspace's git remote → owner/repo.
 * Phase 2 (settled): POST /api/extension/player-link → pre-authorized URL.
 * Phase 3 (this layer): resolve the PR from the current BRANCH server-side
 * (the extension sends the branch; the service uses its install token), with
 * graceful fallbacks for Risk 2's edge cases — multiple PRs (chooser), no PR
 * / detached HEAD (repo-runs pick-list, §3b). `devPrNumber` becomes an
 * optional override. No token configured → Phase-0 sandbox fallback.
 */
export function activate(context: vscode.ExtensionContext) {
  // Phase 7 — the promotional sidebar (§11). Its cross-surface actions reuse the
  // SAME scan/resolve machinery the palette command drives, injected as a host
  // so the view never imports back into this module.
  const sidebar = new LenzonSidebarProvider(
    makeSidebarHost(context),
    context.extensionUri,
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lenzon.explainPr', () =>
      explainPr(context),
    ),
    vscode.commands.registerCommand('lenzon.signIn', async () => {
      await signIn(context, apiBaseUrl());
      void sidebar.render();
    }),
    vscode.commands.registerCommand('lenzon.signOut', async () => {
      await signOut(context);
      void sidebar.render();
    }),
    vscode.commands.registerCommand('lenzon.testHarness', () => {
      openTestHarness(apiBaseUrl(), openPlayer);
    }),
    vscode.window.registerWebviewViewProvider(
      LenzonSidebarProvider.viewId,
      sidebar,
    ),
  );

  // The Git extension may still be discovering the workspace's repos when we
  // activate, so the sidebar's first paint can be repo-less. Re-render when a
  // repo actually opens (onDidOpenRepository) so the connected remote + PR list
  // fill in on their own — no Explorer click needed.
  //
  // Activation is LAZY (activationEvents: []): the extension wakes only when the
  // user opens the Lenzon view or runs a lenzon.* command — never on startup. We
  // do NOT auto-reveal or focus the sidebar; VS Code's default container focus is
  // left untouched until the user selects Lenzon themselves.
  void onGitContextChanged(() => void sidebar.render()).then((d) =>
    context.subscriptions.push(d),
  );
}

/**
 * Build the SidebarHost — the bridge from the (surface-thin) sidebar view to the
 * existing player-panel + scan-flow actions. A fresh panel is created per launch
 * (the sidebar is a launcher, not the player); resolve/scan reuse the exact
 * Phase 3/6 functions, so the sidebar inherits all their states for free.
 */
function makeSidebarHost(context: vscode.ExtensionContext): SidebarHost {
  return {
    async service() {
      return { apiBaseUrl: apiBaseUrl(), token: await getToken(context) };
    },
    playUrl(url, label) {
      openPlayer(url, label);
    },
    async playPr(repo, prNumber) {
      const service = await requireService(context);
      if (!service) return;
      const panel = createLenzonPanel(`${repo.repo} #${prNumber}`);
      panel.showLoading('Resolving the PR explainer…');
      await resolveAndOpen(service, panel, repo, { prNumber });
    },
    async scanPr(repo, prNumber) {
      const service = await requireService(context);
      if (!service) return;
      const panel = createLenzonPanel(`${repo.repo} #${prNumber}`);
      startScanInPanel(service, panel, repo, prNumber);
    },
    async signIn() {
      await signIn(context, apiBaseUrl());
    },
    async signOut() {
      await signOut(context);
    },
  };
}

/**
 * Resolve a Service (base URL + token), prompting device-flow sign-in if no
 * token is stored. Returns undefined if the user declines or sign-in fails —
 * the same gate `explainPr` applies, shared so the sidebar behaves identically.
 */
async function requireService(
  context: vscode.ExtensionContext,
): Promise<Service | undefined> {
  const base = apiBaseUrl();
  let token = await getToken(context);
  if (!token) {
    const choice = await vscode.window.showInformationMessage(
      'Lenzon: sign in to continue.',
      'Sign in',
    );
    if (choice !== 'Sign in') return undefined;
    token = await signIn(context, base);
    if (!token) return undefined;
  }
  return { apiBaseUrl: base, token };
}

function apiBaseUrl(): string {
  return vscode.workspace
    .getConfiguration('lenzon')
    .get<string>('apiBaseUrl', 'https://www.lenzon.ai')
    .trim();
}

interface Service {
  apiBaseUrl: string;
  token: string;
}

async function explainPr(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration('lenzon');
  const apiBaseUrl = cfg.get<string>('apiBaseUrl', 'https://www.lenzon.ai').trim();
  const devPrNumber = cfg.get<number>('devPrNumber', 0);

  // Token resolution (Phase 4): SecretStorage (device-flow) first, legacy
  // `lenzon.apiToken` setting second. See src/auth.ts. Settle auth BEFORE
  // touching git so we don't show a "detected repo" toast for a flow the user
  // is about to abandon at the sign-in prompt.
  let token = await getToken(context);

  // No token at all → offer to sign in (device flow).
  if (!token) {
    const signInChoice = await vscode.window.showInformationMessage(
      'Lenzon: sign in to explain this PR.',
      'Sign in',
    );
    if (signInChoice === 'Sign in') {
      token = await signIn(context, apiBaseUrl);
      if (!token) return;
    } else {
      return;
    }
  }

  const ctx = await reportRepoDetection();
  if (!ctx) return;

  const service: Service = { apiBaseUrl, token };

  // One themed panel for the whole invocation; it transitions loading →
  // (ready | analyzing | empty | error) in place (Risk 3/4).
  const panel = createLenzonPanel(ctx.repo.repo);
  panel.showLoading('Resolving the PR explainer…');

  // devPrNumber, when set, is an explicit override (handy for testing a
  // specific PR regardless of the checked-out branch).
  if (devPrNumber > 0) {
    await resolveAndOpen(service, panel, ctx.repo, { prNumber: devPrNumber });
    return;
  }

  // Detached HEAD or no branch name (Risk 2) → can't resolve a branch; go
  // straight to the pick-list of what's already analyzed.
  if (!ctx.branch) {
    void vscode.window.showInformationMessage(
      'Lenzon: no current branch (detached HEAD?) — showing analyzed PRs for this repo.',
    );
    await offerPickList(service, panel, ctx.repo);
    return;
  }

  await resolveAndOpen(service, panel, ctx.repo, { branch: ctx.branch });
}

/** The lenzon.ai full-repo-scan link-out target (full-repo scans are out of the
 * extension — §0.1, OQ#2). */
function scanUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/generate`;
}

/**
 * Call player-link and act on the result, including the Risk 2 branches:
 * a multi-PR chooser and the not-analyzed → pick-list fallback.
 */
async function resolveAndOpen(
  service: Service,
  panel: LenzonPanel,
  repo: GitHubRepo,
  id: { prNumber: number } | { branch: string },
) {
  const result = await fetchPlayerLink({
    apiBaseUrl: service.apiBaseUrl,
    token: service.token,
    repoFullName: repo.fullName,
    ...id,
  });

  switch (result.kind) {
    case 'ready':
      panel.panel.title = `Lenzon — ${repo.repo}${
        result.prNumber ? ` #${result.prNumber}` : ''
      }`;
      showPlayerUrl(panel, result.playerUrl);
      return;
    case 'choose-pr': {
      // Risk 2: the branch backs more than one open PR. Let the user pick.
      const picked = await vscode.window.showQuickPick(
        result.prNumbers.map((n) => ({ label: `PR #${n}`, prNumber: n })),
        { title: `Lenzon — multiple open PRs for this branch` },
      );
      if (picked) {
        panel.showLoading('Resolving the PR explainer…');
        await resolveAndOpen(service, panel, repo, { prNumber: picked.prNumber });
      } else {
        panel.panel.dispose();
      }
      return;
    }
    case 'analyzing':
      // Themed "still analyzing" state with a Check-again button that re-runs
      // the same resolution. We do not auto-poll on a timer — analysis can take
      // a while and a silent retry loop is worse UX than an explicit affordance.
      panel.showAnalyzing(repo.fullName, () => {
        panel.showLoading('Checking analysis status…');
        void resolveAndOpen(service, panel, repo, id);
      });
      return;
    case 'not_analyzed': {
      // Did we land on a concrete PR? Either it was supplied (id.prNumber) or
      // the server branch-resolved exactly one and handed it back (Phase 6).
      const resolvedPr =
        'prNumber' in id ? id.prNumber : result.prNumber;
      if (resolvedPr !== undefined) {
        // The center-of-gravity case (§10.1): the user is on their own fresh PR
        // that isn't analyzed yet. Offer "Scan PR #N" as the primary action
        // RIGHT HERE — even if the repo has other analyzed PRs — with a quiet
        // "browse other analyzed PRs" link to reach the pick-list. Jumping
        // straight to the pick-list would bury the scan offer for *their* PR.
        showEmptyState(service, panel, repo, resolvedPr);
      } else {
        // No PR resolved (no open PR for the branch / detached HEAD): the
        // pick-list of what Lenzon *has* analyzed is the right fallback (§3b).
        await offerPickList(service, panel, repo);
      }
      return;
    }
    case 'quota_blocked':
      // A run the user can see ran out of credits (Phase 6, §10.6).
      showQuotaBlocked(panel, service.apiBaseUrl);
      return;
    case 'scan_failed':
      // A prior scan of this PR failed (Phase 6, §10.6). Offer a retry through
      // the full scan flow (cost-consent included) when we have a concrete PR.
      panel.showError({
        title: 'The last scan of this PR failed',
        detail: 'You can try scanning it again.',
        action:
          'prNumber' in id
            ? {
                label: 'Scan this PR again',
                action: 'rescan',
                onInvoke: () =>
                  startScanInPanel(service, panel, repo, id.prNumber),
              }
            : undefined,
      });
      return;
    case 'unauthorized':
      panel.showError({
        title: 'Sign-in expired',
        detail:
          'Your Lenzon sign-in was rejected (expired or revoked). Reconnect to continue.',
        action: {
          label: 'Sign in to Lenzon',
          action: 'signin',
          onInvoke: () =>
            void vscode.commands.executeCommand('lenzon.signIn'),
        },
      });
      return;
    case 'error':
      panel.showError({
        title: "Couldn't reach Lenzon",
        detail: result.message,
        action: {
          label: 'Try again',
          action: 'retry',
          onInvoke: () => {
            panel.showLoading('Resolving the PR explainer…');
            void resolveAndOpen(service, panel, repo, id);
          },
        },
      });
      return;
  }
}

/**
 * The repo-runs pick-list (§3b): "here's what Lenzon has already analyzed for
 * this repo." Serves as both the graceful fallback and a browse affordance.
 */
async function offerPickList(
  service: Service,
  panel: LenzonPanel,
  repo: GitHubRepo,
  knownPr?: number,
) {
  panel.showLoading('Loading analyzed PRs…');
  const runs = await fetchRepoRuns({
    apiBaseUrl: service.apiBaseUrl,
    token: service.token,
    repoFullName: repo.fullName,
  });

  if (runs.kind === 'unauthorized') {
    panel.showError({
      title: 'Sign-in expired',
      detail: 'Your Lenzon sign-in was rejected. Reconnect to continue.',
      action: {
        label: 'Sign in to Lenzon',
        action: 'signin',
        onInvoke: () => void vscode.commands.executeCommand('lenzon.signIn'),
      },
    });
    return;
  }
  if (runs.kind === 'error') {
    panel.showError({
      title: "Couldn't load analyzed PRs",
      detail: runs.message,
      action: {
        label: 'Try again',
        action: 'retry',
        onInvoke: () => void offerPickList(service, panel, repo, knownPr),
      },
    });
    return;
  }
  if (runs.runs.length === 0) {
    showEmptyState(service, panel, repo, knownPr);
    return;
  }

  const picked = await vscode.window.showQuickPick(
    runs.runs.map((r: RepoRun) => ({
      label: `PR #${r.prNumber}${r.prTitle ? ` — ${r.prTitle}` : ''}`,
      description: r.headSha.slice(0, 7),
      prNumber: r.prNumber,
    })),
    { title: `Lenzon — analyzed PRs for ${repo.fullName}` },
  );
  if (picked) {
    panel.showLoading('Resolving the PR explainer…');
    await resolveAndOpen(service, panel, repo, { prNumber: picked.prNumber });
  } else {
    // The user dismissed the pick-list without choosing; show the empty/browse
    // state rather than leaving a stale spinner.
    showEmptyState(service, panel, repo, knownPr);
  }
}

/**
 * Risk 3 — the selling empty state (§0.1, OQ#2), now with the Phase 6 in-editor
 * "Scan this PR" CTA when a concrete PR was resolved (§10.1). Without a known
 * PR (detached HEAD / no open PR) only the whole-repo link-out shows — we can't
 * scan a PR we couldn't identify.
 */
function showEmptyState(
  service: Service,
  panel: LenzonPanel,
  repo: GitHubRepo,
  knownPr?: number,
) {
  panel.showEmpty({
    repoFullName: repo.fullName,
    scanUrl: scanUrl(service.apiBaseUrl),
    scanPr:
      knownPr !== undefined
        ? {
            label: `Scan PR #${knownPr}`,
            onScan: () => startScanInPanel(service, panel, repo, knownPr),
          }
        : undefined,
    // When we showed the empty state for a *specific* PR but the repo may have
    // OTHER analyzed PRs, offer a quiet way into the pick-list (§3b) so that
    // browse affordance isn't lost. Omit it on the no-PR path — there the
    // pick-list IS the primary surface, reached directly.
    browse:
      knownPr !== undefined
        ? { onBrowse: () => void offerPickList(service, panel, repo) }
        : undefined,
  });
}

/**
 * Phase 6 — drive the surface-agnostic scan flow (scanFlow.ts) into THIS player
 * panel. The flow owns *when* (consent → trigger → poll → ready); this adapter
 * owns *how it looks* in the panel. Phase 7's sidebar will supply its own
 * adapter against the same runScanFlow, with no change to the flow.
 */
function startScanInPanel(
  service: Service,
  panel: LenzonPanel,
  repo: GitHubRepo,
  prNumber: number,
) {
  const target: ScanTarget = {
    apiBaseUrl: service.apiBaseUrl,
    token: service.token,
    repoFullName: repo.fullName,
    prNumber,
    prLabel: `${repo.repo} #${prNumber}`,
  };

  const renderer: ScanRenderer = {
    confirm: (prLabel, onConfirm, onCancel) =>
      panel.showConfirmScan({
        repoFullName: repo.fullName,
        prLabel,
        onConfirm,
        onCancel: () => {
          onCancel();
          // Cancelled consent → back to the empty state (with the offer intact).
          showEmptyState(service, panel, repo, prNumber);
        },
      }),
    scanning: (prLabel) => panel.showScanning(prLabel),
    ready: (playerUrl) => {
      panel.panel.title = `Lenzon — ${repo.repo} #${prNumber}`;
      showPlayerUrl(panel, playerUrl);
    },
    quotaBlocked: () => showQuotaBlocked(panel, service.apiBaseUrl),
    scanFailed: (onRetry) =>
      panel.showError({
        title: 'The scan failed',
        detail: 'Something went wrong analyzing this PR.',
        action: { label: 'Try again', action: 'rescan', onInvoke: onRetry },
      }),
    error: (message, onRetry) =>
      panel.showError({
        title: "Couldn't complete the scan",
        detail: message,
        action: { label: 'Try again', action: 'retry', onInvoke: onRetry },
      }),
    unauthorized: () =>
      panel.showError({
        title: 'Sign-in expired',
        detail: 'Your Lenzon sign-in was rejected. Reconnect to continue.',
        action: {
          label: 'Sign in to Lenzon',
          action: 'signin',
          onInvoke: () => void vscode.commands.executeCommand('lenzon.signIn'),
        },
      }),
  };

  runScanFlow(target, renderer);
}

/** Phase 6 — insufficient credits (§10.6): a top-up link-out, not a dead error. */
function showQuotaBlocked(panel: LenzonPanel, apiBaseUrl: string) {
  panel.showError({
    title: 'Not enough credits to scan',
    detail:
      'This scan needs more Lenzon credits than your account has. Top up to continue.',
    action: {
      label: 'Top up on lenzon.ai →',
      action: 'topup',
      onInvoke: () =>
        void vscode.env.openExternal(
          vscode.Uri.parse(`${apiBaseUrl.replace(/\/$/, '')}/account/topup`),
        ),
    },
  });
}

/** Validate a player URL → vscode.Uri, or surface a clear error. */
function parsePlayerUrl(url: string): vscode.Uri | undefined {
  let target: vscode.Uri;
  try {
    target = vscode.Uri.parse(url, true);
  } catch {
    void vscode.window.showErrorMessage(`Lenzon: "${url}" is not a valid URL.`);
    return undefined;
  }
  if (target.scheme !== 'https' && target.scheme !== 'http') {
    void vscode.window.showErrorMessage('Lenzon: player URL must be http(s).');
    return undefined;
  }
  return target;
}

/** Render a player URL into an existing panel (the main resolve flow). */
function showPlayerUrl(panel: LenzonPanel, url: string) {
  const target = parsePlayerUrl(url);
  if (!target) {
    panel.showError({ title: "Lenzon returned an invalid player URL", detail: url });
    return;
  }
  panel.showPlayer(target);
}

/** Open a player URL in a fresh panel — used by the sandbox + test-harness
 * flows, which have no pre-existing panel to transition. */
function openPlayer(url: string, label: string) {
  const target = parsePlayerUrl(url);
  if (!target) return;
  const panel = createLenzonPanel(label);
  panel.showPlayer(target);
}

export function deactivate() {
  /* no-op */
}

/**
 * Detect the workspace's GitHub repo and surface the result to the user.
 * Every failure mode is a clear message, not a crash. Returns the full git
 * context (repo + branch + headSha) on success, or undefined on any failure.
 */
async function reportRepoDetection(): Promise<WorkspaceGitContext | undefined> {
  const detection = await detectRepoFromWorkspace();

  switch (detection.kind) {
    case 'ok': {
      const branchNote = detection.branch
        ? ` (${detection.branch})`
        : ' (detached HEAD)';
      void vscode.window.showInformationMessage(
        `Lenzon: detected repo ${detection.repo.fullName}${branchNote}`,
      );
      return {
        repo: detection.repo,
        remoteUrl: detection.remoteUrl,
        branch: detection.branch,
        headSha: detection.headSha,
      };
    }
    case 'no-git-extension':
      void vscode.window.showWarningMessage(
        "Lenzon: VS Code's built-in Git extension isn't available, so the repo can't be detected.",
      );
      return undefined;
    case 'no-repo':
      void vscode.window.showWarningMessage(
        'Lenzon: no Git repository found in this workspace.',
      );
      return undefined;
    case 'no-remote':
      void vscode.window.showWarningMessage(
        'Lenzon: this repository has no Git remote, so its GitHub owner/repo is unknown.',
      );
      return undefined;
    case 'not-github':
      void vscode.window.showWarningMessage(
        `Lenzon: the remote "${detection.remoteUrl}" isn't a GitHub repository. v1 supports GitHub only.`,
      );
      return undefined;
  }
}

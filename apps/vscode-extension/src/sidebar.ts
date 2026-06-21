import * as vscode from 'vscode';
import { detectRepoFromWorkspace, type GitHubRepo } from './git';
import { fetchRepoRuns, type RepoRun } from './repoRuns';
import {
  fetchSession,
  fetchMyRuns,
  type SessionInfo,
  type MyRun,
} from './session';
import { SHOWCASE_EXAMPLES, type ShowcaseExample } from './examples';
import { parsePrOrRepoInput } from './prRef';

/**
 * Phase 7 (§11) — the promotional sidebar.
 *
 * A single `WebviewView` docked in a Lenzon Activity-Bar container (NOT a native
 * TreeView — §11.1: a tree can't carry a value-prop paragraph, example
 * thumbnails, or an input box). It's the always-present discovery home the
 * palette command never was: it sells the product and launches everything
 * Phases 0–6 built.
 *
 * Sections, top to bottom (§11.2):
 *   1. Connected remote (owner/repo + branch) — "it knows where I am".
 *   2. Value proposition — the copy a pre-install user never read.
 *   3. Examples — public, free, shipped static (examples.ts).
 *   4. PR scans for this repo — the repo-runs list (§3b), click-to-play.
 *   5. Input box — a PR ref → in-panel scan; a repo URL → link out to /generate
 *      (§11.3 — repo scans stay out of the extension, §0.1/OQ#2).
 *
 * The view is surface-thin: it renders + posts messages. Cross-surface ACTIONS
 * (play a URL in the player panel, run the Phase-6 scan flow, resolve a repo-run
 * PR to a player URL) are injected as `SidebarHost` callbacks so this file never
 * imports extension.ts — no cycle, and the same scan/resolve machinery is reused
 * verbatim, exactly as §10.9's Phase-7-alignment note intends.
 */

/** Host actions the sidebar delegates to (implemented in extension.ts). */
export interface SidebarHost {
  /** The Lenzon service base URL + the current bearer token (if signed in). */
  service(): Promise<{ apiBaseUrl: string; token?: string }>;
  /** Frame a ready player URL in the player panel (e.g. an example link). */
  playUrl(url: string, label: string): void;
  /** Resolve a PR for the detected repo to a player URL and play it in the panel. */
  playPr(repo: GitHubRepo, prNumber: number): void;
  /** Run the Phase-6 scan flow for a PR in the player panel (consent → poll → play). */
  scanPr(repo: GitHubRepo, prNumber: number): void;
  /** Kick off the device-flow sign-in. */
  signIn(): Promise<void>;
  /** Sign out (clear the stored credential). */
  signOut(): Promise<void>;
}

interface ViewState {
  detection:
    | { kind: 'ok'; repo: GitHubRepo; branch?: string }
    | { kind: 'no-repo' }
    | { kind: 'not-github'; remoteUrl: string }
    | { kind: 'no-remote' }
    | { kind: 'no-git' };
  signedIn: boolean;
  session?: SessionInfo;
  runs: RepoRun[];
  runsError?: string;
  myRuns: MyRun[];
  myRunsError?: string;
}

type Inbound =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'signIn' }
  | { type: 'signOut' }
  | { type: 'topUp' }
  | { type: 'playExample'; url: string; title: string }
  | { type: 'playRun'; prNumber: number }
  | { type: 'playMyRun'; repoFullName: string; prNumber: number }
  | { type: 'submitInput'; value: string }
  | { type: 'openExternal'; url: string };

export class LenzonSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'lenzon.sidebar';
  private view?: vscode.WebviewView;

  constructor(
    private readonly host: SidebarHost,
    private readonly extensionUri: vscode.Uri,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    view.webview.onDidReceiveMessage((msg: Inbound) => {
      void this.onMessage(msg);
    });

    // Re-render when the view becomes visible again (the workspace/branch may
    // have changed while it was hidden).
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.render();
    });

    void this.render();
  }

  /** Re-pull git + repo-runs and repaint. Cheap to call on any state change. */
  async render(): Promise<void> {
    if (!this.view) return;
    const state = await this.gather();
    const webview = this.view.webview;
    const logoUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, 'Lenzon_Logo_full_small.png'),
      )
      .toString();
    this.view.webview.html = renderHtml(state, {
      logoUri,
      cspSource: webview.cspSource,
    });
  }

  private async gather(): Promise<ViewState> {
    const detection = await this.detect();
    const { apiBaseUrl, token } = await this.host.service();
    const signedIn = !!token;

    let session: SessionInfo | undefined;
    let runs: RepoRun[] = [];
    let runsError: string | undefined;
    let myRuns: MyRun[] = [];
    let myRunsError: string | undefined;

    if (signedIn && token) {
      // Session summary (§11.2 item 1) + the user's own scans across all repos
      // ("My scans" accordion) are user-scoped — no repo needed. The repo-runs
      // list (§11.2 item 4) additionally needs a detected GitHub repo. Run the
      // independent reads concurrently.
      const wantRepoRuns = detection.kind === 'ok';
      const [sessionRes, myRunsRes, repoRunsRes] = await Promise.all([
        fetchSession({ apiBaseUrl, token }),
        fetchMyRuns({ apiBaseUrl, token }),
        wantRepoRuns
          ? fetchRepoRuns({
              apiBaseUrl,
              token,
              repoFullName: (detection as { repo: GitHubRepo }).repo.fullName,
            })
          : Promise.resolve(undefined),
      ]);

      if (sessionRes.kind === 'ok') session = sessionRes.session;

      if (myRunsRes.kind === 'ok') myRuns = myRunsRes.runs;
      else if (myRunsRes.kind === 'error') myRunsError = myRunsRes.message;

      if (repoRunsRes) {
        if (repoRunsRes.kind === 'ok') runs = repoRunsRes.runs;
        else if (repoRunsRes.kind === 'error') runsError = repoRunsRes.message;
        // 'unauthorized' → token rejected; the sign-in CTA shows below.
      }
    }

    return {
      detection,
      signedIn,
      session,
      runs,
      runsError,
      myRuns,
      myRunsError,
    };
  }

  private async detect(): Promise<ViewState['detection']> {
    const d = await detectRepoFromWorkspace();
    switch (d.kind) {
      case 'ok':
        return { kind: 'ok', repo: d.repo, branch: d.branch };
      case 'no-git-extension':
      case 'no-repo':
        return { kind: 'no-repo' };
      case 'no-remote':
        return { kind: 'no-remote' };
      case 'not-github':
        return { kind: 'not-github', remoteUrl: d.remoteUrl };
    }
  }

  private async onMessage(msg: Inbound): Promise<void> {
    switch (msg.type) {
      case 'ready':
        return;
      case 'refresh':
        await this.render();
        return;
      case 'signIn':
        await this.host.signIn();
        await this.render();
        return;
      case 'signOut':
        await this.host.signOut();
        await this.render();
        return;
      case 'topUp': {
        const { apiBaseUrl } = await this.host.service();
        const url = `${apiBaseUrl.replace(/\/$/, '')}/account/topup`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return;
      }
      case 'playExample':
        this.host.playUrl(msg.url, msg.title);
        return;
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        return;
      case 'playRun': {
        const repo = await this.detectedRepo();
        if (repo) this.host.playPr(repo, msg.prNumber);
        return;
      }
      case 'playMyRun': {
        // "My scans" rows span repos, so build the GitHubRepo from the row's
        // repoFullName rather than the detected workspace repo.
        const [owner, repo] = msg.repoFullName.split('/');
        if (owner && repo) {
          this.host.playPr(
            { owner, repo, fullName: msg.repoFullName },
            msg.prNumber,
          );
        }
        return;
      }
      case 'submitInput':
        await this.handleInput(msg.value);
        return;
    }
  }

  /** §11.3 — one input box, auto-detecting PR-vs-repo. */
  private async handleInput(value: string): Promise<void> {
    const parsed = parsePrOrRepoInput(value);
    if (parsed.kind === 'invalid') {
      void vscode.window.showWarningMessage(
        'Lenzon: enter a PR link (e.g. github.com/owner/repo/pull/123 or owner/repo#123) or a repo URL.',
      );
      return;
    }

    if (parsed.kind === 'repo') {
      // §11.3 — a repo input deep-links OUT to lenzon.ai/generate (full-repo
      // scans stay out of the extension; §0.1, OQ#2). We pre-fill the repo.
      const { apiBaseUrl } = await this.host.service();
      const base = apiBaseUrl.replace(/\/$/, '');
      const url = `${base}/generate?repo=${encodeURIComponent(parsed.repoUrl)}`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
      return;
    }

    // A PR → the native in-panel Phase-6 scan flow (consent → poll → play).
    const repo: GitHubRepo = {
      owner: parsed.owner,
      repo: parsed.repo,
      fullName: `${parsed.owner}/${parsed.repo}`,
    };
    this.host.scanPr(repo, parsed.prNumber);
  }

  private async detectedRepo(): Promise<GitHubRepo | undefined> {
    const d = await detectRepoFromWorkspace();
    return d.kind === 'ok' ? d.repo : undefined;
  }
}

// ─── HTML ────────────────────────────────────────────────────────────────────

interface RenderAssets {
  logoUri: string;
  cspSource: string;
}

function renderHtml(state: ViewState, assets: RenderAssets): string {
  // Order (§11.2, revised 2026-06-18):
  //   remote → session → value prop → SCAN INPUT (moved to top, item 2) →
  //   examples → repo accordion (open) → my-scans accordion (collapsed).
  const sections = [
    remoteSection(state),
    sessionSection(state),
    valuePropSection(assets),
    inputSection(state),
    examplesSection(SHOWCASE_EXAMPLES),
    prListSection(state),
    myRunsSection(state),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${assets.cspSource}; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${styles()}</style>
</head>
<body>
  <div class="wrap">
    ${sections}
  </div>
  <script>${script()}</script>
</body>
</html>`;
}

function remoteSection(state: ViewState): string {
  const d = state.detection;
  let body: string;
  if (d.kind === 'ok') {
    const branch = d.branch ? ` · <span class="mono">${esc(d.branch)}</span>` : ' · detached HEAD';
    body = `<div class="repo"><span class="dot ok"></span><span class="mono">${esc(
      d.repo.fullName,
    )}</span>${branch}</div>`;
  } else if (d.kind === 'not-github') {
    body = `<div class="repo muted"><span class="dot"></span>Not a GitHub remote — v1 supports GitHub only.</div>`;
  } else if (d.kind === 'no-remote') {
    body = `<div class="repo muted"><span class="dot"></span>This repo has no remote, so its GitHub owner/repo is unknown.</div>`;
  } else {
    body = `<div class="repo muted"><span class="dot"></span>No Git repository detected in this workspace.</div>`;
  }
  return `<section class="block">${body}</section>`;
}

/**
 * §11.2 item 1 (added 2026-06-18) — the session rail. Signed in: identity
 * (email) + available credits + a Sign-out affordance. Signed out: a compact
 * Sign-in CTA. The credit number is the *available* balance (the one a scan
 * actually checks), with a Top-up link out to lenzon.ai.
 */
function sessionSection(state: ViewState): string {
  if (!state.signedIn) {
    return `
    <section class="block">
      <div class="session muted">
        <span>Not signed in</span>
        <button class="link" id="signin-rail">Sign in</button>
      </div>
    </section>`;
  }

  const email = state.session ? esc(state.session.email) : 'Signed in';
  const credits =
    state.session !== undefined
      ? `${state.session.availableBalance.toLocaleString()} credit${
          state.session.availableBalance === 1 ? '' : 's'
        }`
      : '…';
  return `
  <section class="block">
    <div class="session">
      <div class="session-id">
        <span class="dot ok"></span>
        <span class="mono ellipsis" title="${email}">${email}</span>
      </div>
      <button class="link" id="signout">Sign out</button>
    </div>
    <div class="session-credits muted">
      <span>${credits} available</span>
      <button class="link" id="topup">Top up →</button>
    </div>
  </section>`;
}

function valuePropSection(assets: RenderAssets): string {
  return `
  <section class="block">
    <img class="mark" src="${assets.logoUri}" alt="Lenzon" />
    <h1>Have your code explain itself.</h1>
    <p>Lenzon turns a pull request into a short, narrated walkthrough right here
      in the editor. Sanity-check <strong>your own</strong> AI-assisted changes
      before you ship them, and get oriented on <strong>other contributors'</strong>
      PRs you're reviewing, without switching to a browser.</p>
  </section>`;
}

function examplesSection(examples: ShowcaseExample[]): string {
  if (examples.length === 0) return '';
  const rows = examples
    .map(
      (e) => `
      <button class="row example" data-url="${esc(e.url)}" data-title="${esc(e.title)}">
        <span class="play" aria-hidden="true">▶</span>
        <span class="rowtext"><span class="rowtitle">${esc(e.title)}</span>
          <span class="rowblurb muted">${esc(e.blurb)}</span></span>
      </button>`,
    )
    .join('');
  return `
  <section class="block">
    <h2>Try it — no setup</h2>
    ${rows}
  </section>`;
}

/**
 * §11.2 item 4 — "PRs analyzed for this repo", now a collapsible accordion that
 * starts EXPANDED (revised 2026-06-18). Only meaningful for a detected GitHub
 * repo; requires sign-in (the install is the access proof — §11.5).
 */
function prListSection(state: ViewState): string {
  if (state.detection.kind !== 'ok') return '';
  const title = 'PRs analyzed for this repo';

  if (!state.signedIn) {
    return accordion(title, true, `
      <p class="muted">Sign in to see PRs Lenzon has already analyzed here, and to scan new ones.</p>
      <button class="btn primary" id="signin">Sign in to Lenzon</button>`);
  }

  if (state.runsError) {
    return accordion(title, true, `
      <p class="muted">Couldn't load analyzed PRs: ${esc(state.runsError)}</p>
      <button class="btn" id="refresh">Try again</button>`);
  }

  if (state.runs.length === 0) {
    return accordion(title, true, `
      <p class="muted">No analyzed PRs here yet. Use “Scan a PR” above to scan one.</p>`);
  }

  const rows = state.runs
    .map(
      (r) => `
      <button class="row run" data-pr="${r.prNumber}">
        <span class="play" aria-hidden="true">▶</span>
        <span class="rowtext"><span class="rowtitle">PR #${r.prNumber}${
          r.prTitle ? ` — ${esc(r.prTitle)}` : ''
        }</span>
          <span class="rowblurb muted mono">${esc(r.headSha.slice(0, 7))}</span></span>
      </button>`,
    )
    .join('');
  return accordion(title, true, rows);
}

/**
 * §11.2 "My scans" (added 2026-06-18) — the signed-in user's own scans across
 * ALL repos, a collapsible accordion that starts COLLAPSED. Click-to-play; rows
 * carry their repo since they span repos. Hidden entirely when signed out.
 */
function myRunsSection(state: ViewState): string {
  if (!state.signedIn) return '';
  const title = 'My scans';

  if (state.myRunsError) {
    return accordion(title, false, `
      <p class="muted">Couldn't load your scans: ${esc(state.myRunsError)}</p>
      <button class="btn" id="refresh-mine">Try again</button>`);
  }

  if (state.myRuns.length === 0) {
    return accordion(title, false, `
      <p class="muted">You haven't scanned any PRs yet.</p>`);
  }

  const rows = state.myRuns
    .map(
      (r) => `
      <button class="row myrun" data-repo="${esc(r.repoFullName)}" data-pr="${r.prNumber}">
        <span class="play" aria-hidden="true">▶</span>
        <span class="rowtext"><span class="rowtitle">${esc(r.repoFullName)} #${r.prNumber}</span>
          <span class="rowblurb muted">${
            r.prTitle ? esc(r.prTitle) : `<span class="mono">${esc(r.headSha.slice(0, 7))}</span>`
          }</span></span>
      </button>`,
    )
    .join('');
  return accordion(title, false, rows);
}

/** A native <details> accordion themed as a sidebar section. */
function accordion(title: string, open: boolean, inner: string): string {
  return `
  <section class="block">
    <details class="acc"${open ? ' open' : ''}>
      <summary><span class="acc-caret">▸</span><h2>${esc(title)}</h2></summary>
      <div class="acc-body">${inner}</div>
    </details>
  </section>`;
}

function inputSection(state: ViewState): string {
  // The input routes a PR → scan, a repo URL → /generate (§11.3). Always shown
  // when signed in; when signed out, the PR list section already carries the
  // sign-in CTA, so we still show the box but it will prompt sign-in on scan.
  const hint =
    state.detection.kind === 'ok'
      ? 'Paste a PR (owner/repo#123) to scan it, or a repo URL to open it on lenzon.ai.'
      : 'Paste a PR link or a repo URL.';
  return `
  <section class="block">
    <h2>Scan a PR</h2>
    <p class="muted">${hint}</p>
    <input id="input" class="input" type="text" placeholder="github.com/owner/repo/pull/123" />
    <button class="btn primary" id="submit">Go</button>
  </section>`;
}

function styles(): string {
  return `
    :root { color-scheme: light dark; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 13px; line-height: 1.5;
    }
    .wrap { padding: 12px; }
    .block { padding: 12px 0; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,0.2)); }
    .block:last-child { border-bottom: 0; }
    h1 { font-size: 15px; font-weight: 600; margin: 10px 0 6px; }
    h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
         color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
    p { margin: 6px 0; }
    .muted { color: var(--vscode-descriptionForeground); }
    .mono { font-family: var(--vscode-editor-font-family, monospace); }
    .repo { display: flex; align-items: center; gap: 6px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-descriptionForeground); flex: none; }
    .dot.ok { background: var(--vscode-testing-iconPassed, var(--vscode-textLink-foreground)); }
    .mark {
      display: block; height: 40px; width: auto; max-width: 100%;
      margin-bottom: 4px;
    }
    .row {
      display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
      background: var(--vscode-list-hoverBackground, transparent);
      border: 1px solid var(--vscode-sideBarSectionHeader-border, rgba(128,128,128,0.15));
      border-radius: 4px; padding: 8px; margin: 6px 0; cursor: pointer;
      color: inherit; font: inherit;
    }
    .row:hover { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .play { color: var(--vscode-textLink-foreground); flex: none; }
    .row:hover .play { color: inherit; }
    .rowtext { display: flex; flex-direction: column; min-width: 0; }
    .rowtitle { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rowblurb { font-size: 12px; }
    .btn {
      margin-top: 8px; padding: 6px 12px; border: 0; border-radius: 4px; cursor: pointer;
      font-size: 13px; font-family: inherit; width: 100%;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }
    .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .input {
      width: 100%; box-sizing: border-box; margin-top: 6px; padding: 6px 8px;
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      font: inherit;
    }
    .input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .session { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .session-id { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .session-credits { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 12px; }
    .ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .link {
      background: none; border: 0; padding: 0; cursor: pointer; font: inherit; flex: none;
      color: var(--vscode-textLink-foreground); text-decoration: none;
    }
    .link:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); text-decoration: underline; }
    .acc > summary {
      display: flex; align-items: center; gap: 6px; cursor: pointer; list-style: none;
      user-select: none;
    }
    .acc > summary::-webkit-details-marker { display: none; }
    .acc > summary h2 { margin: 0; }
    .acc-caret { color: var(--vscode-descriptionForeground); transition: transform 0.12s ease; font-size: 10px; }
    .acc[open] > summary .acc-caret { transform: rotate(90deg); }
    .acc-body { padding-top: 4px; }
  `;
}

function script(): string {
  return `
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    document.querySelectorAll('.example').forEach((el) =>
      el.addEventListener('click', () =>
        vscode.postMessage({ type: 'playExample', url: el.dataset.url, title: el.dataset.title })));

    document.querySelectorAll('.run').forEach((el) =>
      el.addEventListener('click', () =>
        vscode.postMessage({ type: 'playRun', prNumber: Number(el.dataset.pr) })));

    document.querySelectorAll('.myrun').forEach((el) =>
      el.addEventListener('click', () =>
        vscode.postMessage({ type: 'playMyRun', repoFullName: el.dataset.repo, prNumber: Number(el.dataset.pr) })));

    function on(id, type) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => vscode.postMessage({ type }));
    }
    on('signin', 'signIn');
    on('signin-rail', 'signIn');
    on('signout', 'signOut');
    on('topup', 'topUp');
    on('refresh', 'refresh');
    on('refresh-mine', 'refresh');

    const input = document.getElementById('input');
    const submit = document.getElementById('submit');
    function go() {
      const value = (input && input.value || '').trim();
      if (value) vscode.postMessage({ type: 'submitInput', value });
    }
    if (submit) submit.addEventListener('click', go);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  `;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

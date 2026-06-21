import * as vscode from 'vscode';

/**
 * Phase 5 — the one webview panel the command drives through every state.
 *
 * The plan calls these out as product requirements, not polish:
 *   Risk 3 — the *selling* empty state (the Marketplace shelf is judged on
 *     first-run; a dead panel backfires the whole reach goal). It carries the
 *     "Scan the whole repo on lenzon.ai →" link-out (full-repo scans are out of
 *     the extension — §0.1, OQ#2).
 *   Risk 4 — themed loading / analyzing / error states so the panel never looks
 *     like a weekend hack while the hosted player boots or when there's nothing
 *     to show.
 *
 * One panel is reused per command invocation: loading → (ready | analyzing |
 * empty | error). Transitioning in place avoids a flicker of panels and keeps
 * the editor column stable.
 *
 * Every state is a self-contained themed HTML document. The only one that frames
 * an external origin is `ready` (the player iframe); its CSP allows exactly that
 * origin. The chrome states use VS Code theme variables so they read as native
 * in light and dark.
 */

export interface LenzonPanel {
  /** Show the themed "booting" state. */
  showLoading(message?: string): void;
  /** Frame the hosted player at `url`. This is the only state that loads an external origin. */
  showPlayer(url: vscode.Uri): void;
  /** "Lenzon is still analyzing this PR" — themed, with a Retry affordance. */
  showAnalyzing(repoFullName: string, onRetry: () => void): void;
  /**
   * The selling empty state (Risk 3) + the lenzon.ai whole-repo scan link-out.
   * When `scanPr` is supplied (a PR was resolved), a primary "Scan this PR"
   * button is shown above the link-out (Phase 6, §10.1); without it, only the
   * repo link-out appears (we can't scan a PR we couldn't identify).
   */
  showEmpty(opts: {
    repoFullName: string;
    scanUrl: string;
    scanPr?: { label: string; onScan: () => void };
    /** Optional "Browse other analyzed PRs →" link into the repo-runs pick-list. */
    browse?: { onBrowse: () => void };
  }): void;
  /**
   * Phase 6 cost-consent (§10.6): confirm before spending credits. Generic
   * message — the exact credit count surfaces only if the scan later reports
   * quota_blocked. Never auto-scans.
   */
  showConfirmScan(opts: { repoFullName: string; prLabel: string; onConfirm: () => void; onCancel: () => void }): void;
  /** Phase 6: a user-initiated scan in progress (auto-polling; no button). */
  showScanning(prLabel: string): void;
  /** A themed error/unauthorized state with an optional action button. */
  showError(opts: ErrorStateOptions): void;
  reveal(): void;
  readonly panel: vscode.WebviewPanel;
}

export interface ErrorStateOptions {
  title: string;
  detail?: string;
  /** Optional action button. `action` is posted back over the message channel. */
  action?: { label: string; action: string; onInvoke: () => void };
}

/** Action identifiers the webview can post back to the extension host. */
type Outbound =
  | { type: 'retry' }
  | { type: 'action'; action: string }
  | { type: 'openExternal'; url: string }
  | { type: 'scan' }
  | { type: 'browse' }
  | { type: 'confirm' }
  | { type: 'cancel' };

export function createLenzonPanel(label: string): LenzonPanel {
  const panel = vscode.window.createWebviewPanel(
    'lenzon.player',
    `Lenzon — ${label}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  // Per-state message handlers. Rebound on each transition so a stale handler
  // from a previous state can't fire.
  let onMessage: (msg: Outbound) => void = () => {};
  panel.webview.onDidReceiveMessage((msg: Outbound) => onMessage(msg));

  const wrapper: LenzonPanel = {
    panel,
    reveal: () => panel.reveal(vscode.ViewColumn.Beside),

    showLoading(message = 'Loading the explainer…') {
      onMessage = () => {};
      panel.webview.html = chromeDoc(spinnerState(message));
    },

    showPlayer(url) {
      onMessage = () => {};
      panel.webview.html = playerDoc(url);
    },

    showAnalyzing(repoFullName, onRetry) {
      onMessage = (msg) => {
        if (msg.type === 'retry') onRetry();
      };
      panel.webview.html = chromeDoc(analyzingState(repoFullName));
    },

    showEmpty({ repoFullName, scanUrl, scanPr, browse }) {
      onMessage = (msg) => {
        if (msg.type === 'openExternal')
          void vscode.env.openExternal(vscode.Uri.parse(msg.url));
        if (msg.type === 'scan' && scanPr) scanPr.onScan();
        if (msg.type === 'browse' && browse) browse.onBrowse();
      };
      panel.webview.html = chromeDoc(
        emptyState(repoFullName, scanUrl, scanPr?.label, !!browse),
      );
    },

    showConfirmScan({ repoFullName, prLabel, onConfirm, onCancel }) {
      onMessage = (msg) => {
        if (msg.type === 'confirm') onConfirm();
        else if (msg.type === 'cancel') onCancel();
      };
      panel.webview.html = chromeDoc(confirmScanState(repoFullName, prLabel));
    },

    showScanning(prLabel) {
      onMessage = () => {};
      panel.webview.html = chromeDoc(scanningState(prLabel));
    },

    showError({ title, detail, action }) {
      onMessage = (msg) => {
        if (msg.type === 'action' && action && msg.action === action.action) action.onInvoke();
      };
      panel.webview.html = chromeDoc(errorState(title, detail, action));
    },
  };

  return wrapper;
}

// ─── State bodies (inserted into the chrome document) ────────────────────────

function spinnerState(message: string): string {
  return `
    <div class="card">
      <div class="spinner" aria-hidden="true"></div>
      <p class="muted">${esc(message)}</p>
    </div>`;
}

function analyzingState(repoFullName: string): string {
  return `
    <div class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>Analyzing this PR…</h1>
      <p class="muted">Lenzon is still preparing the explainer for
        <strong>${esc(repoFullName)}</strong>. This usually takes a moment.</p>
      <button class="btn" id="retry">Check again</button>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('retry').addEventListener('click',
        () => vscode.postMessage({ type: 'retry' }));
    </script>`;
}

/**
 * Risk 3 — the empty state must *sell*. Not a dead panel: what Lenzon is, and
 * the actions that move forward.
 *
 * When a PR is resolved (`scanPrLabel` set), the PRIMARY action is the in-editor
 * "Scan this PR" (Phase 6, §10.1 — the center-of-gravity action), with the
 * whole-repo scan demoted to a secondary link-out. Without a resolved PR, only
 * the repo link-out shows — we can't scan a PR we couldn't identify (§0.1, OQ#2).
 */
function emptyState(
  repoFullName: string,
  scanUrl: string,
  scanPrLabel?: string,
  showBrowse = false,
): string {
  const scanPrBtn = scanPrLabel
    ? `<button class="btn primary" id="scanPr">${esc(scanPrLabel)}</button>`
    : '';
  // A "browse other analyzed PRs" link into the pick-list — shown only when we
  // surfaced this empty state for a specific PR (so the browse affordance isn't
  // lost just because we led with that PR's scan offer).
  const browseBtn = showBrowse
    ? `<button class="btn link" id="browse">Browse other analyzed PRs →</button>`
    : '';
  // With a PR scan available, the repo scan is a quiet secondary link; without
  // it, the repo scan is the only (primary) action.
  const repoBtn = scanPrLabel
    ? `<button class="btn link" id="scanRepo">Scan the whole repo on lenzon.ai →</button>`
    : `<button class="btn primary" id="scanRepo">Scan this repo on lenzon.ai →</button>`;

  return `
    <div class="card">
      <div class="mark" aria-hidden="true">▶</div>
      <h1>No explainer yet for ${esc(repoFullName)}</h1>
      <p>Lenzon turns a pull request into a short, narrated walkthrough — so you
        can understand code before you stand behind it, without leaving the editor.</p>
      <p class="muted">There's no analyzed PR here yet. Run a scan to generate one.</p>
      ${scanPrBtn}
      ${browseBtn}
      ${repoBtn}
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      const repo = document.getElementById('scanRepo');
      if (repo) repo.addEventListener('click',
        () => vscode.postMessage({ type: 'openExternal', url: ${JSON.stringify(scanUrl)} }));
      const pr = document.getElementById('scanPr');
      if (pr) pr.addEventListener('click', () => vscode.postMessage({ type: 'scan' }));
      const browse = document.getElementById('browse');
      if (browse) browse.addEventListener('click', () => vscode.postMessage({ type: 'browse' }));
    </script>`;
}

/**
 * Phase 6 cost-consent (§10.6). A scan spends credits — unlike free playback —
 * so we ALWAYS confirm first, never auto-scan. The message is generic (no exact
 * count): the precise credit figure isn't known until the worker runs, and if
 * the user is short, that surfaces as the quota_blocked state with a top-up link.
 */
function confirmScanState(repoFullName: string, prLabel: string): string {
  return `
    <div class="card">
      <div class="mark" aria-hidden="true">▶</div>
      <h1>Scan this PR?</h1>
      <p>${esc(repoFullName)} · ${esc(prLabel)}</p>
      <p class="muted">Lenzon will analyze this pull request and build an
        explainer. This uses Lenzon credits from your account.</p>
      <div class="row">
        <button class="btn primary" id="confirm">Scan this PR</button>
        <button class="btn" id="cancel">Cancel</button>
      </div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById('confirm').addEventListener('click',
        () => vscode.postMessage({ type: 'confirm' }));
      document.getElementById('cancel').addEventListener('click',
        () => vscode.postMessage({ type: 'cancel' }));
    </script>`;
}

/**
 * Phase 6: a scan the user just kicked off, in progress. Auto-polling happens
 * in the orchestrator (scanFlow.ts) — this view is purely informational and
 * carries no button, since the user already opted in at the consent step.
 */
function scanningState(prLabel: string): string {
  return `
    <div class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>Scanning this PR…</h1>
      <p class="muted">Analyzing ${esc(prLabel)}. This can take a couple of
        minutes — this panel updates automatically when it's ready.</p>
    </div>`;
}

function errorState(title: string, detail: string | undefined, action?: ErrorStateOptions['action']): string {
  const detailHtml = detail ? `<p class="muted">${esc(detail)}</p>` : '';
  const btnHtml = action
    ? `<button class="btn" id="action">${esc(action.label)}</button>`
    : '';
  const script = action
    ? `<script>
        const vscode = acquireVsCodeApi();
        document.getElementById('action').addEventListener('click',
          () => vscode.postMessage({ type: 'action', action: ${JSON.stringify(action.action)} }));
      </script>`
    : '';
  return `
    <div class="card">
      <div class="mark warn" aria-hidden="true">!</div>
      <h1>${esc(title)}</h1>
      ${detailHtml}
      ${btnHtml}
    </div>
    ${script}`;
}

// ─── Documents (chrome + player) ─────────────────────────────────────────────

/**
 * The themed chrome document for every non-player state. CSP is locked to the
 * webview's own inline content — `default-src 'none'`, inline style+script only.
 * No external origin is framed or fetched here.
 */
function chromeDoc(body: string): string {
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${chromeStyles()}</style>
</head>
<body>
  <main class="stage">${body}</main>
</body>
</html>`;
}

/**
 * The player document: a full-bleed <iframe> at the player URL, with a themed
 * loading backdrop behind it so the panel never flashes empty while the hosted
 * player boots.
 *
 * CSP is the load-bearing line for Risk 1: a webview's default CSP blocks
 * framing external origins, so `frame-src` must explicitly allow the player
 * origin. We allow exactly the target's origin (https/http), not a wildcard —
 * dev (`http://localhost:3001`) and prod (`https://www.lenzon.ai`) both work by
 * reading the origin off the resolved URL.
 */
function playerDoc(target: vscode.Uri): string {
  const origin = `${target.scheme}://${target.authority}`;
  const srcAttr = target.toString(true).replace(/"/g, '&quot;');

  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `frame-src ${origin}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: var(--vscode-editor-background); }
    .backdrop {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      color: var(--vscode-descriptionForeground);
      font: 12px var(--vscode-font-family, sans-serif);
    }
    iframe { position: relative; border: 0; width: 100%; height: 100vh; display: block; }
  </style>
</head>
<body>
  <div class="backdrop">Loading the player…</div>
  <iframe
    src="${srcAttr}"
    allow="autoplay; clipboard-read; clipboard-write"
    title="Lenzon player"></iframe>
</body>
</html>`;
}

function chromeStyles(): string {
  return `
    :root { color-scheme: light dark; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 13px;
      line-height: 1.5;
    }
    .stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; box-sizing: border-box; }
    .card { max-width: 420px; text-align: center; }
    .card h1 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
    .card p { margin: 8px 0; }
    .muted { color: var(--vscode-descriptionForeground); }
    .mark {
      width: 56px; height: 56px; margin: 0 auto; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: 700;
      background: var(--vscode-textLink-foreground); color: var(--vscode-editor-background);
    }
    .mark.warn { background: var(--vscode-editorWarning-foreground, var(--vscode-textLink-foreground)); }
    .btn {
      margin-top: 16px; padding: 8px 16px; border: 0; border-radius: 4px; cursor: pointer;
      font-size: 13px; font-family: inherit;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }
    .btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn.link {
      background: none; color: var(--vscode-textLink-foreground);
      padding: 6px 8px; display: block; margin: 8px auto 0;
    }
    .btn.link:hover { background: none; text-decoration: underline; }
    .row { display: flex; gap: 8px; justify-content: center; margin-top: 16px; }
    .row .btn { margin-top: 0; }
    .spinner {
      width: 28px; height: 28px; margin: 0 auto; border-radius: 50%;
      border: 3px solid var(--vscode-descriptionForeground);
      border-top-color: var(--vscode-textLink-foreground);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
}

/** Escape text for safe interpolation into HTML element content / attributes. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

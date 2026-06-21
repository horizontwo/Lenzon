import * as vscode from 'vscode';
import { fetchPlayerLink } from './playerLink';
import { parsePrRef } from './prRef';

/**
 * Phase 3 dev/test harness.
 *
 * A themed webview form: paste an API key + a PR reference (full GitHub PR URL
 * or `owner/repo#123`), hit Run, and it executes the REAL player-link
 * round-trip via fetchPlayerLink — no settings juggling. Results render inline;
 * on success it opens the player in a separate panel (reusing openPlayer).
 *
 * This is deliberately not gated behind a setting — it's a separate command
 * ("Lenzon: Test Harness") so it never interferes with the primary flow.
 */
export function openTestHarness(
  apiBaseUrl: string,
  openPlayer: (url: string, label: string) => void,
) {
  const panel = vscode.window.createWebviewPanel(
    'lenzon.testHarness',
    'Lenzon — Test Harness',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = harnessHtml(apiBaseUrl);

  panel.webview.onDidReceiveMessage(async (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as { type?: string; apiKey?: string; prRef?: string };
    if (m.type !== 'run') return;

    const apiKey = (m.apiKey ?? '').trim();
    const prRef = (m.prRef ?? '').trim();

    if (!apiKey) {
      post(panel, { type: 'result', level: 'error', text: 'Enter an API key.' });
      return;
    }
    const parsed = parsePrRef(prRef);
    if (!parsed) {
      post(panel, {
        type: 'result',
        level: 'error',
        text: 'PR reference must be a GitHub PR URL or "owner/repo#123".',
      });
      return;
    }

    post(panel, {
      type: 'result',
      level: 'info',
      text: `Calling player-link for ${parsed.repoFullName} #${parsed.prNumber}…`,
    });

    const result = await fetchPlayerLink({
      apiBaseUrl,
      token: apiKey,
      repoFullName: parsed.repoFullName,
      prNumber: parsed.prNumber,
    });

    switch (result.kind) {
      case 'ready':
        post(panel, {
          type: 'result',
          level: 'ok',
          text: `ready → opening player\n${result.playerUrl}`,
        });
        openPlayer(
          result.playerUrl,
          `${parsed.repoFullName} #${parsed.prNumber}`,
        );
        return;
      case 'choose-pr':
        post(panel, {
          type: 'result',
          level: 'info',
          text: `choose-pr → candidates: ${result.prNumbers.join(', ')}`,
        });
        return;
      case 'analyzing':
        post(panel, {
          type: 'result',
          level: 'info',
          text: `analyzing (retry after ${result.pollAfterMs}ms)`,
        });
        return;
      case 'not_analyzed':
        post(panel, {
          type: 'result',
          level: 'warn',
          text: 'not_analyzed — no run for this PR, or no access.',
        });
        return;
      case 'unauthorized':
        post(panel, {
          type: 'result',
          level: 'error',
          text: 'unauthorized — the API key was rejected.',
        });
        return;
      case 'error':
        post(panel, {
          type: 'result',
          level: 'error',
          text: `error (${result.status}): ${result.message}`,
        });
        return;
    }
  });
}

interface ResultMessage {
  type: 'result';
  level: 'ok' | 'info' | 'warn' | 'error';
  text: string;
}

function post(panel: vscode.WebviewPanel, msg: ResultMessage) {
  void panel.webview.postMessage(msg);
}

function harnessHtml(apiBaseUrl: string): string {
  const nonce = makeNonce();
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const base = escapeHtml(apiBaseUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font: 13px var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px; margin: 0;
    }
    h2 { font-size: 14px; margin: 0 0 4px; }
    .hint { color: var(--vscode-descriptionForeground); margin: 0 0 16px; }
    label { display: block; margin: 12px 0 4px; font-weight: 600; }
    input {
      width: 100%; box-sizing: border-box; padding: 6px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px; font: inherit;
    }
    input:focus { outline: 1px solid var(--vscode-focusBorder); }
    button {
      margin-top: 16px; padding: 6px 14px; font: inherit; cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none; border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    #result {
      margin-top: 16px; padding: 10px 12px; border-radius: 3px;
      white-space: pre-wrap; word-break: break-all; display: none;
      border-left: 3px solid var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background);
    }
    #result.ok    { border-left-color: var(--vscode-testing-iconPassed, #3fb950); }
    #result.warn  { border-left-color: var(--vscode-editorWarning-foreground, #d29922); }
    #result.error { border-left-color: var(--vscode-editorError-foreground, #f85149); }
  </style>
</head>
<body>
  <h2>Lenzon — Test Harness</h2>
  <p class="hint">Runs the real <code>player-link</code> round-trip against <strong>${base}</strong>. Phase 3 dev tool.</p>

  <label for="key">API key (Bearer)</label>
  <input id="key" type="password" placeholder="lenzon API key" autocomplete="off" spellcheck="false" />

  <label for="pr">PR reference</label>
  <input id="pr" type="text" placeholder="owner/repo#123  or  https://github.com/owner/repo/pull/123" autocomplete="off" spellcheck="false" />

  <button id="run">Run player-link</button>

  <div id="result"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const result = document.getElementById('result');
    const keyEl = document.getElementById('key');
    const prEl = document.getElementById('pr');

    // Restore the PR ref across reloads (never the key — don't persist secrets).
    const prev = vscode.getState();
    if (prev && prev.prRef) prEl.value = prev.prRef;

    function run() {
      vscode.setState({ prRef: prEl.value });
      vscode.postMessage({ type: 'run', apiKey: keyEl.value, prRef: prEl.value });
    }
    document.getElementById('run').addEventListener('click', run);
    prEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    keyEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'result') return;
      result.style.display = 'block';
      result.className = msg.level;
      result.textContent = msg.text;
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeNonce(): string {
  // VS Code webview nonces just need to be unguessable per-load. We can't use
  // Math.random reliably under all hosts; build one from crypto if available,
  // else a UUID via the webview-less path.
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? require('crypto').webcrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

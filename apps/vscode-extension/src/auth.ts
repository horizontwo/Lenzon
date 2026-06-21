import * as vscode from 'vscode';

/**
 * Phase 4 — device-code sign-in.
 *
 * The extension holds no credential at install time. `signIn` runs Lenzon's
 * device-code flow (RFC 8628-style, adapted to Lenzon's magic-link identity):
 *
 *   1. POST /api/extension/device/start  → { device_code, user_code,
 *      verification_uri_complete, expires_in, interval }
 *   2. show the user_code + open the verification URL in their browser; the
 *      user (signed in via magic link) approves it there
 *   3. poll POST /api/extension/device/token with the device_code until it
 *      returns { access_token } — a minted Lenzon API key
 *
 * The token is stored in VS Code SecretStorage (`context.secrets`), NOT in
 * settings — it's a real bearer credential. `getToken` prefers it and falls
 * back to the legacy `lenzon.apiToken` setting for back-compat.
 */

const SECRET_KEY = 'lenzon.apiToken';

interface StartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

/**
 * The token the extension should present on the player-link call, if any.
 * Order: SecretStorage (device-flow result) → legacy `lenzon.apiToken` setting.
 * Returns undefined when neither is set.
 */
export async function getToken(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored && stored.trim()) return stored.trim();

  const legacy = vscode.workspace
    .getConfiguration('lenzon')
    .get<string>('apiToken', '')
    .trim();
  return legacy || undefined;
}

export async function isSignedIn(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  return (await getToken(context)) !== undefined;
}

export async function signOut(
  context: vscode.ExtensionContext,
): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
  void vscode.window.showInformationMessage('Lenzon: signed out.');
}

/**
 * Run the device-code flow to completion, storing the minted token in
 * SecretStorage. Returns the token on success, or undefined if the user
 * cancelled or it failed (a message is shown either way).
 */
export async function signIn(
  context: vscode.ExtensionContext,
  apiBaseUrl: string,
): Promise<string | undefined> {
  let start: StartResponse;
  try {
    const res = await fetch(`${apiBaseUrl}/api/extension/device/start`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`start failed (${res.status})`);
    start = (await res.json()) as StartResponse;
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Lenzon: couldn't start sign-in (${(err as Error).message}).`,
    );
    return undefined;
  }

  // Show the code and let the user open the approval page. We pre-open the
  // browser to the prefilled URL, but also surface the code in case the open
  // is blocked or they're approving on another device.
  const open = 'Open browser to approve';
  const choice = await vscode.window.showInformationMessage(
    `Lenzon sign-in: your code is ${start.user_code}. Approve it in the browser, then come back.`,
    { modal: false },
    open,
  );
  if (choice === open) {
    void vscode.env.openExternal(
      vscode.Uri.parse(start.verification_uri_complete),
    );
  } else {
    // Even if they dismissed the toast, still open the page — the flow is only
    // useful if they reach it. (Cancelling happens via the progress notification.)
    void vscode.env.openExternal(
      vscode.Uri.parse(start.verification_uri_complete),
    );
  }

  // Poll /token until approval, expiry, or the user cancels the progress.
  const token = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Lenzon: waiting for approval (code ${start.user_code})…`,
      cancellable: true,
    },
    (_progress, cancel) =>
      pollForToken(apiBaseUrl, start, cancel),
  );

  if (!token) return undefined;

  await context.secrets.store(SECRET_KEY, token);
  void vscode.window.showInformationMessage('Lenzon: signed in.');
  return token;
}

async function pollForToken(
  apiBaseUrl: string,
  start: StartResponse,
  cancel: vscode.CancellationToken,
): Promise<string | undefined> {
  const deadline = Date.now() + start.expires_in * 1000;
  let intervalMs = Math.max(1, start.interval) * 1000;

  while (Date.now() < deadline) {
    if (cancel.isCancellationRequested) return undefined;
    await delay(intervalMs, cancel);
    if (cancel.isCancellationRequested) return undefined;

    let body: { access_token?: string; token_type?: string; error?: string };
    try {
      const res = await fetch(`${apiBaseUrl}/api/extension/device/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_code: start.device_code }),
      });
      body = (await res.json().catch(() => ({}))) as typeof body;
    } catch {
      // Transient network blip — keep polling until the deadline.
      continue;
    }

    if (body.access_token) return body.access_token;

    switch (body.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs += 5000;
        continue;
      case 'expired_token':
        void vscode.window.showErrorMessage(
          'Lenzon: the sign-in code expired. Run sign-in again.',
        );
        return undefined;
      case 'invalid_grant':
      default:
        void vscode.window.showErrorMessage(
          'Lenzon: sign-in failed. Run sign-in again.',
        );
        return undefined;
    }
  }

  void vscode.window.showErrorMessage(
    'Lenzon: the sign-in code expired. Run sign-in again.',
  );
  return undefined;
}

function delay(ms: number, cancel: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    cancel.onCancellationRequested(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

# Lenzon — VS Code extension

A Marketplace-facing **discovery surface**: watch a Lenzon explainer for a PR
without leaving VS Code. A thin native frame around playback infrastructure that
already shipped. See [the plan](../../docs/active_plans/VSCODE-EXTENSION-PLAN.md).

## Status: Phase 5 — themed states + packaging

**Phase 0 (settled):** the live `/viewer/<id>/embed` player renders *and plays*
inside the VS Code webview sandbox (CSP and all).

**Phase 1 (settled):** detect the workspace's GitHub remote → `owner/repo` (via
VS Code's built-in Git extension API, https + SSH forms).

**Phase 2 (settled):** `POST /api/extension/player-link` with a Bearer token →
pre-authorized `/viewer/<id>/embed` URL; the service mints the shareToken
server-side with service authority (`setScriptVisibility`).

**Phase 3 (settled):** the command resolves the PR from the **current branch**
*server-side* (the extension sends `{ repoFullName, branch }`; the service uses
its installation token to find the open PR — so the extension needs no GitHub
scope of its own, OQ#1). Risk 2's edge cases are handled:

- **multiple open PRs for the branch** → a QuickPick chooser;
- **no open PR / detached HEAD / not-analyzed** → the repo-runs pick-list
  (`GET /api/extension/repo-runs`, §3b): "here's what Lenzon *has* analyzed for
  this repo," which doubles as a browse affordance;
- **empty** → a themed first-run empty state that explains what Lenzon does and
  links out to a full-repo scan on lenzon.ai (Risk 3).

**Phase 5 (current):** themed loading / "still analyzing" / error / empty states
rendered in the panel (matching the editor's light/dark theme, Risk 3/4), then
`vsce package` → a sideloadable `.vsix`.

### Signing in (Phase 4 — device flow)

Run **`Lenzon: Sign in`**. The extension starts a device-code flow: it shows a
short code and opens `…/extension/connect?user_code=…` in your browser. There,
signed in to Lenzon (magic link), you approve the code; the extension polls and
receives a minted token, stored in VS Code **SecretStorage** (never in
settings). **`Lenzon: Sign out`** deletes it.

Under the hood the approved token is a normal Lenzon **API key** minted with
service authority, so the `player-link` route is unchanged — device-flow only
changes how the token is *minted*. The browser identity is bound at the
session-authed approve step; the `start`/`token` endpoints the extension hits
are unauthenticated (the device code is the credential).

### Settings

- `lenzon.apiBaseUrl` — service base URL (default `https://www.lenzon.ai`; use
  `http://localhost:3001` locally).
- `lenzon.apiToken` — **legacy/dev override.** A manually-minted Lenzon API key
  (Bearer). The supported path is now `Lenzon: Sign in`; the SecretStorage token
  it writes **takes precedence** over this setting. Leave blank unless testing
  with a hand-minted key.
- `lenzon.devPrNumber` — optional explicit PR override (test a specific PR
  regardless of the checked-out branch). `0` = unset (use branch resolution).
- `lenzon.devMode` — show developer-only commands (e.g. **Test Harness (dev)**)
  in the Command Palette. Off by default.

Signed in (or with the legacy token set), the command resolves via branch (or
`devPrNumber` if set); otherwise it prompts sign-in.

### Test Harness (dev)

Set `lenzon.devMode: true` to reveal the command **`Lenzon: Test Harness
(dev)`** in the Command Palette. It opens a themed webview form where
you paste an **API key** (password-masked) and a **PR reference** — either a
full GitHub PR URL (`https://github.com/owner/repo/pull/123`) or the shorthand
`owner/repo#123` — and hit Run. It executes the real `player-link` round-trip
against `lenzon.apiBaseUrl`, renders the result inline (ready / analyzing /
not-analyzed / choose-pr / error), and opens the player on success. No
settings juggling, no git context needed — the fastest way to exercise the
contract end-to-end. The key is never persisted; the PR ref is remembered
across reloads.

#### The API key — a Lenzon key, **not** an Anthropic key

The `apiToken` / harness key is a **Lenzon API key**: a Bearer token that
identifies *which Lenzon user is asking*. The `player-link` route hashes it,
looks it up in the `apiKey` table, and resolves the owning `User` — then checks
that user's GitHub App installation covers the repo. It has nothing to do with
the Anthropic/Claude API key (that's a backend secret used to *generate*
analyses; it never reaches the extension or webview).

Mint one for testing:

```bash
cd apps/server
npx tsx --env-file=.env scripts/create-api-key.ts \
  --email <your-lenzon-account-email> --label "vscode-ext-test"
```

The raw key is printed **once** — paste it into the harness's API-key field.
Two caveats:

- **Use the email of the user whose GitHub App install covers the repo** you're
  testing (or test against a public repo). Access is checked via
  `findUserInstallationForRepo(user.id, owner)`; a key for the wrong user gets a
  `not_analyzed` 404 on a private repo (deliberately indistinguishable from "no
  analysis").
- **`--env-file=.env` picks the database.** Match it to the server
  `lenzon.apiBaseUrl` points at (local vs. prod) — these can be a live shared
  RDS. Creating a key is additive (one new row), so it's safe, but you are
  writing to the real DB.

### Run it (F5)

1. `npm install` at the repo root (workspaces will pull this package's devDeps).
2. Open this folder (`apps/vscode-extension`) in VS Code and press **F5** —
   this compiles and launches the Extension Development Host.
3. Open a workspace whose remote is a GitHub repo your Lenzon GitHub App install
   covers (or a public one), run **`Lenzon: Sign in`**, then
   **`Lenzon: Explain this PR`** (Cmd+Shift+P).

**Pass:** a panel opens Beside and the explainer for the branch's PR plays. With
no analysis yet you get the themed empty state; while analysis is pending, the
"still analyzing" state with a Check-again button. For a faster contract-only
test (no git context), set `lenzon.devMode: true` and use the **Test Harness**.

### Package (`.vsix`)

```bash
cd apps/vscode-extension
npm run compile      # tsc → dist/
npm run package      # vsce package --no-dependencies → lenzon-*.vsix
```

Sideload with `code --install-extension lenzon-<version>.vsix` (or the
Extensions view → "Install from VSIX…").

## Scope (v1)

Read-only: it surfaces an existing PR explainer; it never triggers analysis from
the editor. PRs only — full-repo scans link out to lenzon.ai. One command, one
panel; no inline CodeLens/hover/tree-view. See
[the plan](../../docs/active_plans/VSCODE-EXTENSION-PLAN.md) §7.

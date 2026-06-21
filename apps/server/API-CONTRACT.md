# Lenzon — Backend API contract

The open player and pipeline UI (`@lenzon/player`) are a **client**. They talk
to a backend over HTTP, and that backend is not part of this open repo. If you
want to drive the full "repo/PR → analysis → script → audio/video" pipeline,
you implement the endpoints below against your own infrastructure (your agent
pipeline, storage, queues, and render workers).

This document is the contract. It's derived from the client in
[`apps/player/src/pipeline/api.ts`](../player/src/pipeline/api.ts); the request
and response shapes reference the types in
[`@lenzon/shared-types`](../../packages/shared-types).

> **You don't need any of this just to render.** Playing an existing
> `PresentationScript` (the `@lenzon/player` main export) requires no backend.
> Only the generate/persist/export features below hit the API.

## Conventions

- **Base URL** — the client prefixes every path with `VITE_SERVER_URL` (empty =
  same origin). Point it at your backend.
- **Auth** — session-cookie based. Every call sends `credentials: 'include'`;
  your backend identifies the user from the cookie. Unauthenticated requests to
  owner-scoped routes should return `401`.
- **Content type** — request bodies are JSON (`content-type: application/json`).
- **Async + poll** — `triage`, `analyze`, and `export` return immediately with
  an id/status; the real work runs in the background. Clients poll the matching
  `GET` until the record reaches a terminal state.
- **Generic errors** — for non-OK responses without a recognized body, the
  client throws on `res.status` + `res.text()`. Recognized error bodies use
  `{ "error": "<code>", "message"?: string, ... }` (see [Error codes](#error-codes)).

## Endpoints

### Auth

| Method · Path | Purpose | Response |
|---|---|---|
| `GET /api/auth/me` | Current user. `401` → treated as signed-out (returns null). | `{ email, balance, availableBalance, createdAt }` |

### Triage (fast first pass)

| Method · Path | Request | Response / notes |
|---|---|---|
| `POST /api/triage` | `{ repoUrl }` | `{ id, sessionId, status: "running" }`. `401` → auth error; may return a [clone error](#clone-errors). |
| `GET /api/triage/:id` | — | `TriageRecord` (`status: "running" \| "ready" \| "error"`; `data` is a `TriageReport`, populated only when `ready`). Poll ~2s, ceiling ~5 min. |

### Analysis

| Method · Path | Request | Response / notes |
|---|---|---|
| `POST /api/analyze` | `{ repoUrl, mode?, triageReport?, triageSessionId? }` | `{ id, status, sessionId?, estimate? }`. `401` auth · `402` insufficient credits · [clone errors](#clone-errors). |
| `POST /api/pr/analyze` | `{ repoUrl, prNumber, baseRef? }` | `{ id, status, estimate?, cloneRunId? }`. Server resolves the user's own GitHub App install server-side — the client never sends an installation id. `402` credits · [PR-metadata errors](#pr-metadata-errors) · [clone errors](#clone-errors). |
| `POST /api/analyze/estimate` | `{ mode?, triageReport }` | `{ estimate: { usd, credits, reasoning }, balance, availableBalance }`. No side effects; auth optional (balances null when anonymous). |
| `GET /api/analyze/:id` | — | `AnalysisRecord` (`status: running \| ready \| error \| cancelling \| cancelled`; `data` is `AnalysisJSON` when `ready`). Poll ~3s, ceiling ~15 min. |
| `POST /api/analyze/:id/cancel` | — | Best-effort interrupt. `409` = already finished (no-op). |
| `GET /api/analyses?repoUrl=` | — | `{ analyses: AnalysisSummary[] }`, newest first, owner-scoped (empty for anonymous). `repoUrl` optional filter. |

### Scripts

| Method · Path | Request | Response / notes |
|---|---|---|
| `POST /api/script` | `{ analysis: AnalysisJSON, settings: UserSettings, analysisId? }` | A `PresentationScript` with extra fields `_id`, `_label`, `_audioStatus` (the client splits these off). Audio renders in the background → `_audioStatus` starts `"pending"`. `401` auth. |
| `GET /api/scripts?analysisId=&repoUrl=` | — | `{ scripts: ScriptSummary[] }`, newest first. |
| `GET /api/scripts/:id` | — | `ScriptRecord` (includes the full script `data` blob and `audioStatus`). |
| `GET /api/scripts/:id/replay?token=&captureToken=` | — | Raw `PresentationScript` stripped of cost/persistence metadata (the viewer path). `404` not found · `401` token required · `403` wrong token. |
| `POST /api/scripts/:id/share` | `{ visibility: "public" \| "unlisted" \| "private" }` | `{ id, visibility, shareToken }`. Owner-only; `unlisted` mints/reuses a `shareToken` for `/viewer/:id?token=…`. |
| `POST /api/scripts/:id/rerender-audio` | — | `{ audioStatus }` (starts `"pending"`; poll `GET /api/scripts/:id`). Owner-only. `401` · `404`. |

### Reviewer notes

| Method · Path | Request | Response |
|---|---|---|
| `POST /api/notes` | `PostNoteInput` (`scriptId` required, plus scene coordinates, `note`, optional `suspectArea` of `analysis \| script \| template`, `templateVersionAtCapture`) | `{ id, createdAt }`. Author-only; ownership checked via the Script row. |

### Export (video render)

| Method · Path | Request | Response / notes |
|---|---|---|
| `POST /api/export` | `{ scriptId }` | `{ jobId }`. Enqueues an MP4 render. Failure body `{ error }` maps to [export errors](#export-errors); honors a `Retry-After` header. |
| `GET /api/export/:jobId` | — | `ExportStatus` (`status: queued \| running \| success \| failed`, `presignedUrl` + `presignedExpiresAt` when done, `errorCode`/`errorMessage`, duration estimates). `404` unknown job. |

### Internal / referenced

`/api/repos/clone` is the clone seam referenced by the error model (it backs
the synchronous clone-error responses); `/api/blog` and `/api/notes` support
the authoring surfaces. Implement the clone behavior however you like — the
client only cares about the [error codes](#clone-errors) it returns.

## Error codes

The client recognizes typed error bodies on specific routes. Return
`{ "error": "<code>", "message"?, ... }` with the matching HTTP status.

### Clone errors
Emitted on `400 / 409 / 429 / 502` from `/api/analyze`, `/api/triage`,
`/api/pr/analyze`, `/api/repos/clone`. Codes:
`connection_required`, `org_access_required`, `repo_not_found`,
`unsupported-host`, `malformed-url`, `too_many_active_runs`,
`too_many_cluster_runs`, `enqueue_failed`. Optional extra fields:
`provider`, `host`, `needsConnection`, `owner`, `repo`, `approveUrl`,
`githubMessage`, `cap`, `runId`. Terminal-state failures may also be persisted
on a record's `error` field as `clone-<code>: <message>`.

### PR-metadata errors
On `400 / 404 / 429 / 502` from `/api/pr/analyze`, disambiguated by the body
`error`: `not-found-or-private`, `rate-limited`, `github-error`,
`unsupported-host`.

### Credits & auth
`401` → not signed in. `402` → `{ needed, have, estimate }` for insufficient
credits.

### Export errors
On a non-OK `POST /api/export`, body `error` ∈ `script_not_found`,
`audio_not_ready`, `too_many_active_runs`, `too_many_cluster_runs`,
`app_url_missing`, `enqueue_failed` (plus `401` → `unauthorized`). May include
`activeJobIds` and `audioStatus`/`audioError`.

## Types

All payload shapes (`AnalysisJSON`, `TriageReport`, `PresentationScript`,
`UserSettings`, `*Record`, `*Summary`, `AudioStatus`, …) live in
[`@lenzon/shared-types`](../../packages/shared-types). Treat that package as the
canonical schema for request/response bodies.

# Lenzon — Example server surfaces

These are **worked examples**, not the full Lenzon backend. They show how the
Studio authoring UIs are wired on top of the open player and shared types, so
you can see a real integration and adapt it. Auth, the database, queues, and
the rest of the production backend are intentionally not included.

> **This folder is reference source you read, not an app you boot.** It has no
> `package.json`, `next.config`, or `app/layout.tsx`, and it is excluded from
> the npm workspace — `npm install` / `npm run dev` at the repo root will not
> try to run it. The supported local experience is the **player sandbox**
> (`npm run dev` opens it at `:5173`, no backend needed). See
> [`docs/quickstart.md`](../../docs/quickstart.md). Even fully wired, Studio's
> generate/analyze flows require a backend implementing
> [`API-CONTRACT.md`](./API-CONTRACT.md).

## What's here

| Path | What it is |
|---|---|
| `app/studio/` | The original Studio page — an authoring surface that mounts the player. |
| `app/studio2/` | The current Studio (v2): provider, shell, hooks, and toolbar panels. |
| `lib/auth/server-component.ts` | **A stub** standing in for the real session lookup (see below). |
| `public/Lenzon_logo.png` | Logo referenced by the pages. |
| [`API-CONTRACT.md`](./API-CONTRACT.md) | The HTTP contract the player/pipeline expects from a backend — implement it against your own infra to drive generation/export. |

The pages import from the open packages in this repo:

- `@lenzon/player` — the player and pipeline UI
- `@lenzon/shared-types` — the shared contracts

They assume the `@/*` path alias resolves to this `apps/server` directory (the
standard Next.js convention), e.g. `@/lib/auth/server-component`.

## Bring your own auth

Both pages gate access behind a signed-in, allowlisted user:

```ts
const user = await getOptionalUserFromCookies();
if (!user) redirect('/login?next=/studio');
// then: user.email must be in STUDIO_ALLOWED_EMAILS
```

`getOptionalUserFromCookies()` is the single integration point. The shipped
version in `lib/auth/server-component.ts` is a **stub**: it returns a user only
when `STUDIO_DEV_EMAIL` is set, and `null` otherwise. To use these pages for
real, replace its body with your own session lookup — read your session cookie,
resolve the user, and return an object with at least an `email` (or `null` when
nobody is signed in). The pages don't care how you authenticate; they only need
an email to check against the allowlist.

You'll also want a `/login` route to handle the redirect — that's yours to
provide.

## Environment variables

| Variable | Purpose |
|---|---|
| `STUDIO_ALLOWED_EMAILS` | Comma-separated allowlist of emails permitted into Studio. **Fails closed** — if unset, nobody is allowed. |
| `STUDIO_DEV_EMAIL` | Convenience for the stub only: set it to act as that signed-in user locally. Ignore once you wire real auth. |

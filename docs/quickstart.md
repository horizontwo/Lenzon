# Quickstart

Get Lenzon running locally and find your way around. The whole local setup is
two commands — the player sandbox needs no backend, no auth, and no env vars.

## 1. Run it

```bash
git clone <your-fork-url>
cd lenzon
npm install          # installs the npm workspace (player + shared-types)
npm run dev          # Vite dev server at http://localhost:5173
```

Open <http://localhost:5173>. You'll see **Lenzon — Template Sandbox**.

> Requires Node 20+. `npm install` at the root wires the workspace so
> `@lenzon/player` resolves `@lenzon/shared-types` from `packages/`. Run the
> commands from the **repo root**, not from inside `apps/player`.

## 2. Look around the sandbox

The sandbox is the player's local surface for building and testing templates:

- **Effects** buttons (`zoom`, `grow`, `glow`, `slam`, `shake`) demo the
  canvas entrance-effect pipeline.
- The **template dropdown** lists every template that has a `demo` payload. Pick
  one and click **run** to render it. **"Hello Template (tutorial)"** leads the
  list — it's the annotated reference template.
- **clear** dismisses the current scene.

This is your iteration loop: edit a template file, save, Vite hot-reloads, pick
it from the dropdown again.

## 3. Create your first template

Follow [`creating-a-template.md`](./creating-a-template.md). It walks the
`Template` contract, the Presenter API, the design tokens, and registration,
using [`apps/player/src/templates/hello-template.ts`](../apps/player/src/templates/hello-template.ts)
as the annotated starting point. The canonical format spec is
[`apps/player/playerSpecs/BeatScript-spec.md`](../apps/player/playerSpecs/BeatScript-spec.md).

## 4. Understand how templates reach the producer

[`templates-and-the-producer.md`](./templates-and-the-producer.md) explains how
registering a template publishes it, how its `slots`/`description` become the
contract an LLM uses to pick and fill it, and where (the private backend) the
actual selection happens.

## 5. Sample data & the pipeline

[`../samples/README.md`](../samples/README.md) explains the
analysis → script → player pipeline and inventories the sample JSON, including a
small **runnable** analysis+script pair that uses only shipped templates.

## A note on the server

`apps/server/` is **reference source, not a bootable app** — it has no
`package.json` / `next.config` / `app/layout.tsx`, and it's excluded from the
workspace. It shows how the Studio authoring UIs wire on top of the player; the
HTTP contract a backend must implement to drive generation is in
[`../apps/server/API-CONTRACT.md`](../apps/server/API-CONTRACT.md). The runnable
local experience is the player sandbox above.

> **Backlog (deferred):** making the server minimally bootable — adding a
> `package.json`, `next.config`, `app/layout.tsx`, and a `/login` stub so
> `/studio` mounts locally. Note that even then, the generate/analyze flows
> would error without a backend implementing the API contract, so this is a
> low-priority follow-up rather than part of the template-authoring on-ramp.

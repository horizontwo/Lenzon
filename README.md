# Lenzon

Lenzon turns a GitHub repository or pull request into a **narrated, animated
codebase explainer**; a short, scene-by-scene presentation that walks through
what a codebase (or a PR) does and why. An agent analyzes the code and writes a
structured analysis and another creates a structured spcript; a browser-based
player renders that script into animated scenes with synchronized narration.
You keep up with yours and everyone elses code with visual and auditory explainers.

This repository is the **open source** of Lenzon: the player and template
engine, the shared type contracts, an example server with the Studio authoring
UI, the VS Code extension, and the architecture/infrastructure references. It's
the set of building blocks you can read, run, extend, and contribute to.

We know that some teams will want to build out their own full agentic pipeline 
so we've tried to eplain that as best we can while protecting our own infrastructure.
A great starter option is to use ours which handles public and private repos,
guarantees privacy and scales on AWS cloud infrastructure. You can use our new
VSCode Extension or implement our GitHub App - open a usage based account at 
https://Lenzon.ai

## How it fits together

The system has two layers, and they're cleanly separable:

- **Rendering** — given a `PresentationScript` (a structured list of scenes,
  templates, and narration), the player draws and animates it in the browser.
  This needs no backend.
- **Generation** — turning a repo/PR into that script: clone → triage →
  analysis → producer → (optional) video render. This is driven by a backend
  over an HTTP API. The backend that runs Lenzon's hosted pipeline is not part
  of this repo, but the contract it implements is fully documented (see
  [`apps/server/API-CONTRACT.md`](./apps/server/API-CONTRACT.md)), so the player
  is model- and backend-agnostic by design.

A visitor who just wants to play or embed an existing explainer uses the player
alone. A visitor who wants to generate explainers implements the documented API
contract against their own infrastructure.

## Quickstart

```bash
npm install
npm run dev          # template sandbox at http://localhost:5173
```

That's the whole local setup — the player sandbox needs no backend, no auth, and
no env vars. Full tour and what to do next:
[`docs/quickstart.md`](./docs/quickstart.md). To build a template, see
[`docs/creating-a-template.md`](./docs/creating-a-template.md).

## Repository layout

| Path | What it is | Notable dependencies |
|---|---|---|
| `packages/shared-types/` | `@lenzon/shared-types` — the canonical TypeScript contracts shared across everything: `AnalysisJSON`, `TriageReport`, `PresentationScript`, `UserSettings`, and the record/summary types. Zero runtime dependencies; this is the schema the whole system agrees on. | none (pure types) |
| `apps/player/` | `@lenzon/player` — the Vite + React runtime that plays a `PresentationScript`: the scene engine, the built-in template library, the 2D/DOM/3D rendering layers, voice playback, and the optional `pipeline/*` UI that talks to a backend. Running it with `npm run dev` opens the **template sandbox** — the supported local surface for building templates. Exposed as a package with subpath exports (main render barrel vs. `pipeline/*`). | React 18, three.js, anime.js, Prism, dotLottie; Vite 5 + TypeScript 5 |
| `apps/server/` | **Example** server surfaces, not a bootable app: the `studio` and `studio2` authoring UIs (Next.js app-router pages) that mount the player, a **stubbed** auth module, and the backend `API-CONTRACT.md`. Reference source you read, not an app you run locally — see the folder README. | Next.js; consumes `@lenzon/player` + `@lenzon/shared-types` |
| `apps/vscode-extension/` | `lenzon-explain-pr` — the VS Code extension to watch a Lenzon explainer for a PR without leaving the editor. Device-flow sign-in, token stored in VS Code SecretStorage. | VS Code engine `^1.85` |
| `infra/` | High-level **architecture diagrams** (Mermaid + a rendered SVG/PNG) and one illustrative AWS CDK construct (`job-worker.ts`). Describes the *shape* of the system, not a deployable copy of the environment. See the folder README. | AWS CDK (`job-worker.ts` only, as a reference) |
| `samples/` | Example agent outputs (analysis + the script produced from it), including a small **runnable** pair that uses only shipped templates. See [`samples/README.md`](./samples/README.md). | — |

## Tooling

- **Language:** TypeScript 5 across all packages.
- **Player / demo build:** Vite 5, React 18.
- **Rendering stack:** a 2D canvas + DOM layer, a three.js 3D layer for
  flow/dependency diagrams, anime.js for motion, Prism for code highlighting,
  and dotLottie for chrome/overlay animation.
- **Contracts-first:** `@lenzon/shared-types` is the single source of truth for
  every payload shape; the player and any backend both build against it.

## Status & notes

- This is a **curated public mirror**. It intentionally excludes the hosted
  backend, deployment/account specifics, and internal planning docs. The
  infrastructure material here is reference-only (diagrams + one example
  construct), never a deployable copy.
- Packages are marked `private` / `0.0.1` and wired by the `@lenzon/*` scope
  through npm workspaces (root `package.json`); a published-package setup is not
  yet included here.
- Lenzon is released under the [Apache License 2.0](./LICENSE) (see also
  [`NOTICE`](./NOTICE)). Contributions are welcome under the DCO — see
  [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Docs live in [`docs/`](./docs/): the [quickstart](./docs/quickstart.md), the
  [template-authoring guide](./docs/creating-a-template.md), and
  [how templates reach the producer](./docs/templates-and-the-producer.md). The
  format spec is in
  [`apps/player/playerSpecs/`](./apps/player/playerSpecs/BeatScript-spec.md).

# Creating Your First Template

This is the narrative walkthrough for building a Lenzon template. The canonical
contract reference is
[`apps/player/playerSpecs/BeatScript-spec.md`](../apps/player/playerSpecs/BeatScript-spec.md);
this doc is the hands-on version that gets you from zero to a registered,
rendering template.

The annotated reference template you'll copy from is
[`apps/player/src/templates/hello-template.ts`](../apps/player/src/templates/hello-template.ts).
Read it alongside this doc.

---

## 1. The loop

Templates are developed inside the **player sandbox** — a backend-free local
surface whose only job is to render templates so you can iterate.

```bash
# from the repo root
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

Open <http://localhost:5173>. You'll see **Lenzon — Template Sandbox**: a
toolbar with effect buttons and a **template dropdown**.

> **Every template with a `demo` field appears in that dropdown automatically.**
> Pick one, click **run**, and it renders. That dropdown is your test harness —
> there is no separate test wiring to set up. Edit a template file, save, and
> Vite hot-reloads; pick it again to see the change.

The full analysis → script → playback pipeline lives in the (private) backend.
You don't need it to build templates. See
[`docs/quickstart.md`](./quickstart.md) for what the server folder is and isn't.

---

## 2. Anatomy of a template

A template is a single `.ts` file in `apps/player/src/templates/` that exports
an object satisfying the `Template` interface
([`registry.ts`](../apps/player/src/templates/registry.ts)). The fields:

| Field | Required | What it's for |
|---|---|---|
| `id` | yes | Unique, snake-case. How scripts and the producer refer to your template. |
| `version` | yes | Provenance stamp. Scripts snapshot the id→version map at creation; bump it on any behavior change. |
| `description` | yes | One line, model-facing. The producer reads it to decide when to pick your template. |
| `slots` | recommended | Machine-readable schema hint — the contract the producer uses to know what content to emit. Not validated at runtime. See [templates-and-the-producer.md](./templates-and-the-producer.md). |
| `demo` | recommended | A sample payload. Having one is what surfaces your template in the sandbox dropdown. |
| `render(presenter, content)` | yes | Mounts the scene; returns a `TemplateHandle`. |

The content type is intentionally loose (`Record<string, unknown>`) so each
template defines its own slot shape. Cast it to a typed interface at the top of
`render()`:

```ts
interface HelloContent { title: string; lines?: string[]; }
// inside render():
const content = contentIn as unknown as HelloContent;
```

---

## 3. The Presenter API

`render()` receives a `Presenter`
([`service/presenter.ts`](../apps/player/src/service/presenter.ts)) — the
service facade that owns one canvas `Stage` and one DOM root. The members you'll
use:

| Member | Layer | Use |
|---|---|---|
| `showTextBox(opts)` | canvas | Add a text box; returns a handle with `.box` (the live `TextBox`) and `.dismiss()`. Pass `fx: [{ name, duration }]` for an entrance effect. |
| `domRoot` | DOM | The `HTMLElement` you append structured content to (plates, lists, code, SVG). |
| `stage` | canvas | The canvas surface. `stage.width` / `stage.height` give you the layout box. |
| `stage3d` | 3D | Lazy three.js layer (only built when first accessed). Returns `null` if no 3D host. Most templates don't need it. |
| `clear()` | all | Wipes every layer. The player calls this between scenes — you rarely call it yourself. |
| `showLottie(src, onComplete)` | chrome | Branding/intro animation overlay. Niche. |

### The two-layer model

This is the one idea to internalize (spec
[§Canvas / DOM layer model](../apps/player/playerSpecs/BeatScript-spec.md)):

- **Canvas layer** — text boxes and 2D shapes via `showTextBox` / `stage`. The
  entrance-effect pipeline (`slam`, `grow`, `glow`, `shake`, `zoom`) is
  **canvas-only**. Put anything you want to animate-in here.
- **DOM layer** — native text layout, code blocks, the design-system primitives
  (`.cs-plate`, `.cs-numlist`, …). Append to `presenter.domRoot`.

A template uses one or both. `hello-template` deliberately uses both: a canvas
title and a DOM body plate.

---

## 4. Styling — use the design tokens

The visual language is defined as CSS custom properties in
[`apps/player/src/index.css`](../apps/player/src/index.css) `:root`, and
documented in spec [§Color system](../apps/player/playerSpecs/BeatScript-spec.md).
The non-negotiable rules (spec [§Design rules](../apps/player/playerSpecs/BeatScript-spec.md)):

1. **Never hardcode hex.** Read tokens via `cssVar('--cs-ink-1', fallback)` or
   `resolveColor()` from [`palette.ts`](../apps/player/src/templates/palette.ts).
   The whole player restyles from one place that way.
2. **Accent budget = 1.** `--cs-accent-warm` is reserved for emphasis. At most
   one element is emphasized at a time (see §6 below).
3. **Dismiss is total** (covered in §5).

Key tokens: `--cs-ink-1..4` (text), `--cs-accent-warm/cool/warn/ok`,
`--cs-glass-*` (surfaces), `--cs-font-display/ui/mono`. Reusable DOM classes
include `.cs-plate` (glass surface) and `.cs-numlist` (numbered rows, with a
global `.is-emph` treatment).

---

## 5. The `demo` field and lifecycle

The `demo` is what the sandbox plays:

```ts
demo: {
  label: 'Hello Template (tutorial)',   // dropdown label
  content: { title: 'Hello, template', lines: ['…'] },  // fed to render()
  emphasizeAfter: { target: '1', delayMs: 1600 },        // optional: fire emphasize() after mount
},
```

`render()` returns a `TemplateHandle`:

```ts
interface TemplateHandle {
  dismiss(): void;            // remove EVERYTHING this template added
  emphasize?(target: string): void;
}
```

**`dismiss()` must be total** — remove every canvas box and DOM node, and
**cancel every pending timer / requestAnimationFrame**. A template that leaks a
timer will keep mutating the screen after its scene is gone. The pattern (from
`hello-template.ts`): track timers in an array and a `dismissed` flag, then in
`dismiss()` cancel the RAF, call the canvas handle's `dismiss()`, clear all
timers, and `.remove()` the DOM nodes.

---

## 6. emphasize() and beats

During playback, a script's `beats[]` drive the scene. A beat with
`action: "emphasize"` calls your `emphasize(target)` (see spec
[§BeatAction](../apps/player/playerSpecs/BeatScript-spec.md) and
[§Accent budget = 1](../apps/player/playerSpecs/BeatScript-spec.md)). `target`
is conventionally a row index (`"1"`) or the exact text to match.

Honor the accent budget: clear the previously emphasized element before
emphasizing the next, and auto-clear after a beat. `hello-template.ts` and
`title-bullets.ts` both show the full pattern.

---

## 7. Register it

A template becomes available the moment it's registered — registration *is* the
publish step (more in
[templates-and-the-producer.md](./templates-and-the-producer.md)). Add two lines
to [`apps/player/src/templates/index.ts`](../apps/player/src/templates/index.ts):

```ts
import { yourTemplate } from './your-template';
// …
registerTemplate(yourTemplate);
```

Save — Vite hot-reloads — and your template is in the sandbox dropdown.

---

## 8. Checklist (mirrors spec §Extension)

- [ ] `id` (snake-case, unique), `version`, `description`, `slots`, `demo`.
- [ ] `render()` returns a `TemplateHandle` with `dismiss()` and, where relevant, `emphasize()`.
- [ ] Follow the design rules: accent budget = 1, calm by default, **dismiss is total**.
- [ ] Colors come from tokens (`cssVar` / `resolveColor`), never hardcoded hex.
- [ ] Import + `registerTemplate()` in `index.ts`.
- [ ] Add an entry to the spec's [§Template catalog](../apps/player/playerSpecs/BeatScript-spec.md).
- [ ] Bump `version` on any later behavior change.
- [ ] `npm run typecheck` is green.

Then play it from the sandbox dropdown to confirm it renders, emphasizes, and
clears cleanly.

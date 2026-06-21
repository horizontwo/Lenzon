# PresentationScript 1.0 — Format Specification

> **Status: CURRENT.** This document is the canonical spec for the
> PresentationScript format and the template system it depends on.
> The reference implementation lives in `apps/player/src/templates/`.
> Authored 2026-06-05.

---

## Overview

A **PresentationScript** is the intermediate representation that sits
between an LLM analysis and an animated video presentation. The LLM
does not generate video — it generates a structured script that a
deterministic renderer executes. This separation is the core insight of
the format:

- The LLM's job is tractable: produce valid structured JSON, not pixels.
- Output is consistent and fast to render regardless of model or speed.
- Scripts can be re-rendered, remixed, and re-voiced without re-running
  the expensive analysis pipeline.
- The "narration + animation in sync" problem is solved at the spec
  level, not the generation level.

A script is a **sequence of scenes**. Each scene names a template,
supplies content slots, and carries a beat sequence that drives
real-time emphasis during playback. The player renders each scene in
order, dismissing the previous before mounting the next.

---

## Top-level script shape

```ts
interface PresentationScript {
  /** Format version. This document describes version "1.0". */
  version: string;

  /** Human title for the presentation (repo name, PR title, etc.). */
  title: string;

  /**
   * Snapshot of every registered template's version at script-creation
   * time, keyed by template id. Used for provenance: you can always
   * know what template version rendered any given script.
   * Written by the server at creation time via listTemplateVersions().
   */
  templateVersions: Record<string, string>;

  /** The ordered sequence of scenes. */
  scenes: Scene[];
}
```

---

## Scene

```ts
interface Scene {
  /**
   * The template to mount. Must match a registered template id.
   * See §Template Catalog for the full list.
   */
  template: string;

  /**
   * Structured content slots passed verbatim to the template's
   * render() function. Shape is template-specific — see each
   * template's slot schema in §Template Catalog.
   */
  content: Record<string, unknown>;

  /**
   * Ordered sequence of timed actions the player fires during this
   * scene. The player's clock starts at 0 when the scene mounts.
   */
  beats: BeatAction[];

  /**
   * Approximate duration in milliseconds. Used by the player for
   * progress display and pre-fetch; the actual scene ends on the
   * last beat or when the player advances, whichever comes first.
   */
  durationMs?: number;
}
```

### BeatAction

```ts
type BeatAction =
  | { type: 'wait';      ms: number }
  | { type: 'emphasize'; target: string }
  | { type: 'narrate';   text: string }
  | { type: 'next' };
```

- **wait** — pause the beat sequence for `ms` milliseconds.
- **emphasize** — call `handle.emphasize(target)` on the mounted
  template. What `target` means is template-specific (see §Template
  Catalog). The accent-budget rule (§Design Rules) applies globally.
- **narrate** — synchronize narration text with playback. The player
  displays or speaks the text at this beat.
- **next** — advance to the next scene immediately.

---

## Template contract

Every template is a plain object satisfying the `Template` interface
defined in `apps/player/src/templates/registry.ts`.

```ts
interface Template {
  /** Unique stable identifier. Snake-case, e.g. "flow-diagram". */
  id: string;

  /** Current version string. Bump when behavior changes. */
  version: string;

  /** One-sentence description for tooling and agent discovery. */
  description: string;

  /**
   * Machine-readable slot schema. Keys are slot names; values are
   * plain-English type descriptions. Consumed by the agent
   * tool-discovery endpoint so the producer knows what to emit.
   */
  slots?: Record<string, string>;

  /**
   * Optional sample payload for the demo UI. Every built-in template
   * ships one so any template is exercisable without custom wiring.
   */
  demo?: TemplateDemo;

  /**
   * Mount the template: build DOM/canvas content, start entrance
   * animations, and return a handle. Called once per scene.
   */
  render(presenter: Presenter, content: TemplateContent): TemplateHandle;
}

interface TemplateHandle {
  /** Remove everything the template added. Called before the next scene mounts. */
  dismiss(): void;

  /**
   * Draw attention to a named sub-element. Called by the player when
   * a "emphasize" beat fires. The accent-budget rule applies: clear
   * any prior emphasis before applying the new one.
   */
  emphasize?(target: string): void;
}

interface TemplateDemo {
  label: string;
  content: TemplateContent;
  /** Optional emphasize call scheduled after the template mounts. */
  emphasizeAfter?: { target: string; delayMs: number };
}
```

### The Presenter

`render()` receives a `Presenter` instance which exposes:

- **`domRoot: HTMLElement`** — the container element. Templates append
  their DOM here.
- **Canvas primitives** — for templates that render text or effects on
  a `<canvas>` layer (slam, grow, glow entrance effects, etc.).

Templates must clean up everything they attach in `dismiss()`. They
must not hold references to DOM elements after `dismiss()` is called.

---

## Design rules

These rules apply to every template, built-in and custom.

### 1. Accent budget = 1

At most **one element** carries emphasis at any time. When `emphasize()`
is called, the template must clear any currently-emphasized element
before applying the new one. The warm accent (`--cs-accent-warm`) is
reserved exclusively for the emphasis pulse — it must not appear as a
baseline color on any persistent element.

```ts
// Pattern used by every built-in template:
let activeEl: HTMLElement | null = null;
let activeTimer: number | null = null;

const clearActive = () => {
  if (!activeEl) return;
  activeEl.classList.remove('sb-emphasize');
  if (activeTimer != null) window.clearTimeout(activeTimer);
  activeEl = null; activeTimer = null;
};

emphasize(target) {
  clearActive();
  const el = map[target];
  if (!el) return;
  el.classList.add('sb-emphasize');
  activeEl = el;
  activeTimer = window.setTimeout(() => {
    el.classList.remove('sb-emphasize');
    activeEl = null; activeTimer = null;
  }, 1400);
}
```

### 2. Producer-drift aliases

Templates silently accept common alternate slot names so that minor LLM
naming drift doesn't break renders. The canonical slot always wins when
both are present. Example from `title-card`:

| Canonical slot | Accepted alias |
|---|---|
| `repo` | `title` |
| `blurb` | `subtitle` |
| `kicker` | `accent` |
| `analysisDate` | `date` |
| `commit` | `sha` |

New templates should define aliases for any slot the producer might
plausibly name differently. Document them in the slot schema comment.

### 3. Staggered entrance

Elements reveal progressively, not all at once. Timing is driven by a
`staggerMs` slot where the producer controls pacing, with a sensible
default. Use CSS transitions triggered by a class toggle, not JS
animation loops.

### 4. Calm by default

Continuous motion (floating, spinning, pulsing loops) is opt-in, not
default. Templates that support motion expose an opt-in slot (`float`,
`orbitSpeed`, etc.) and default it to off. The viewer should never feel
visual noise they didn't ask for.

### 5. Version provenance

Every template must have a `version` field. Bump it when the template's
behavior changes in any way that would make a re-render differ from the
original. The server snapshots all versions at script-creation time via
`listTemplateVersions()` — this is how you can always know what rendered
what.

### 6. Fill mode

Each template declares whether it is **full-bleed** (owns the entire
stage rectangle) or **fitted** (sizes to content). Full-bleed templates
use `position: absolute; inset: 0` on their wrapper. Fitted templates
let the player center them. Document the fill mode in the template's
JSDoc header.

### 7. Dismiss is total

`dismiss()` must remove everything the template added: DOM nodes,
canvas drawings, animation frame handles, and timers. A leaked element
or timer that outlives the scene is a bug.

---

## Canvas / DOM layer model

The player renders two layers stacked:

| Layer | What lives here |
|---|---|
| **Canvas** (bottom) | Text with entrance effects (slam, grow, glow). Managed by the Presenter's canvas primitives. |
| **DOM** (top) | All structured content — plates, bullets, diagrams, code blocks, SVG. |

Most templates use both layers: a large headline on canvas (for entrance
fx), supporting content in DOM (for crisp text, accessibility, Prism
highlighting). A few templates (e.g. `emphasis-word`, `center-stage`)
are primarily canvas; a few (e.g. `directory-tree`, `scorecard`) are
DOM-only.

**Canvas templates** call Presenter canvas primitives to draw text.
They must clear their canvas region in `dismiss()`.

**DOM templates** append to `presenter.domRoot`. SVG is DOM — templates
like `flow-diagram`, `sequence-diagram`, and `entity-map` are built on
`document.createElementNS(SVG_NS, ...)` and live in the DOM layer.

---

## Color system

Templates consume the design-system CSS custom properties directly.
Never hardcode hex values in a template.

### Ink scale (text and surfaces)

| Token | Role |
|---|---|
| `--cs-ink-1` | Primary text, brightest |
| `--cs-ink-2` | Secondary text |
| `--cs-ink-3` | Dim text, connector lines |
| `--cs-ink-4` | Subtlest — disabled states, placeholders |

### Semantic accents

| Token | Role |
|---|---|
| `--cs-accent-cool` | Neutral-informative (features, pointers, active state) |
| `--cs-accent-ok` | Positive (strengths, passing grades) |
| `--cs-accent-warn` | Alarm (concerns, low grades, security) |
| `--cs-accent-warm` | **Reserved for emphasis pulse only.** Never use as a baseline color. |

### Glass surface tokens

| Token | Role |
|---|---|
| `--cs-glass-bg` | Background fill for `.cs-plate` |
| `--cs-glass-border` | Border for `.cs-plate` |
| `--cs-glass-sunken-bg` | Background fill for `.cs-plate--sunken` |

### Palette aliases (producer-facing)

The producer emits color values as palette aliases. Templates resolve
them via `resolveColor()` from `palette.ts`:

| Alias | Resolves to |
|---|---|
| `palette.primary` | `var(--cs-accent-cool)` |
| `palette.secondary` | `var(--cs-accent-ok)` |
| `palette.accent` | `var(--cs-accent-warn)` |

`--cs-accent-warm` is intentionally **not** in the palette alias table.
It is the emphasis budget; using it as a group color would fight the
emphasis system.

The producer may also emit raw CSS strings (`#ff6b6b`, `oklch(...)`,
`var(--cs-*)`) — `resolveColor()` passes them through unchanged.

### LLM color autonomy (planned — v1.1)

In a future version, the producer will be able to request named color
roles for a scene (e.g. "this group represents the dangerous path —
use the alarm color"). The color system will expose a `sceneAccents`
slot at the script level that overrides token values for the duration
of a scene. The constraint: the warm accent and the emphasis system
remain immutable — only the cool/ok/warn tokens are reassignable.
This gives the LLM meaningful color autonomy without breaking the
single-emphasis-pulse contract.

---

## Template catalog — v1.0

23 built-in templates, grouped by purpose. All versions are `1.0.0`.

---

### Structural (scene framing)

#### `title-card`
Opening slide of a repo analysis. Full-bleed plate with kicker, org/repo
display headline, optional blurb, and a meta footer.

| Slot | Type | Notes |
|---|---|---|
| `org` | `string` | Owner/organization shown above repo name |
| `repo` | `string` | Repository name — the largest type on the plate |
| `blurb` | `string?` | 1–3 sentence subtitle |
| `kicker` | `string?` | Small mono label above title (default "Codebase analysis") |
| `sceneTag` | `string?` | Top-right badge (default "T-00") |
| `eyebrow` | `string?` | Top-left mono caption |
| `analysisDate` | `string?` | ISO date or pre-formatted string |
| `commit` | `string?` | Short commit SHA |
| `branch` | `string?` | Branch name |
| `brand` | `string?` | Bottom-centre wordmark (default "Lenzon") |

**Drift aliases:** `title→repo`, `subtitle→blurb`, `accent→kicker`,
`date→analysisDate`, `sha→commit`. Accepts `"owner/name"` in `repo`
and splits it automatically.

**emphasize targets:** `repo`, `blurb`, `kicker`, `date`, `commit`

---

#### `pr-title-card`
Opening slide of a PR-explainer analysis. Full-bleed. Anchors on a
giant mono PR number next to an italic-serif PR title — visually
distinct from `title-card` so a PR thumbnail is instantly recognizable.

| Slot | Type | Notes |
|---|---|---|
| `prTitle` | `string` | PR title, italic serif |
| `prNumber` | `string` | "#384" or "384" — leading # normalized |
| `repo` | `string` | Repository name |
| `org` | `string?` | Organization |
| `author` | `string` | PR author |
| `reviewers` | `string[]?` | Reviewer names |
| `branchFrom` | `string` | Source branch |
| `branchTo` | `string` | Target branch |
| `additions` | `number` | Lines added |
| `deletions` | `number` | Lines removed |
| `filesChanged` | `number` | File count |
| `labels` | `{ text, color? }[]?` | PR labels, max 4 |
| `headSha` | `string` | Head commit SHA |
| `analysisDate` | `string?` | Analysis date |
| `brand` | `string?` | Bottom-centre wordmark |

**emphasize targets:** `prTitle`, `prNumber`, `stats`, `labels`, `author`

---

#### `outro-card`
Closing slide of a PR-explainer run. Bookends `pr-title-card`. Anchors
on a takeaway sentence and a colour-coded observation chip. Deliberately
observational — Lenzon does not vote on PRs.

| Slot | Type | Notes |
|---|---|---|
| `takeaway` | `string` | What the analysis saw, in plain language |
| `observation` | `"minor-notes" \| "several-notes" \| "security-concerns"` | Chip type |
| `prNumber` | `string` | For the footer |
| `headSha` | `string` | For the footer |
| `analysisDate` | `string?` | For the footer |
| `nextSteps` | `string[]?` | Up to 3 observational bullets (not a to-do list) |
| `brand` | `string?` | Bottom-centre wordmark |

**emphasize targets:** `takeaway`, `observation`, `nextSteps`, `brand`

---

### Text and narrative

#### `title-bullets`
Large canvas title in Instrument Serif italic with a staggered numbered
DOM list in a glass plate below.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string` | Headline, rendered on canvas |
| `bullets` | `string[]?` | List items in DOM |
| `titleFx` | `EffectSpec[]?` | Entrance effects (default: slam) |

**emphasize targets:** bullet index as string (`"0"`, `"1"`, …)

---

#### `purpose-bullets`
Purpose statement on canvas with typed supporting evidence in a glass
plate. Each support item carries a semantic type that maps to a badge tone.

| Slot | Type | Notes |
|---|---|---|
| `purpose` | `string` | Main purpose headline, on canvas |
| `fileRef` | `string?` | File path shown as a badge |
| `supports` | `{ point, type }[]?` | type: `"feature" \| "detail" \| "concern" \| "strength"` |
| `purposeFx` | `EffectSpec[]?` | Entrance effects (default: grow) |

Badge tones: `feature→cool`, `detail→ink`, `concern→warn`, `strength→ok`

**emphasize targets:** support item index as string

---

#### `emphasis-word`
Single word or short phrase rendered large on canvas in Instrument Serif
italic. The "mic drop" moment. Lands on bare room — no plate wrapper.

| Slot | Type | Notes |
|---|---|---|
| `word` | `string` | The headline word or short phrase |
| `subtitle` | `string?` | Supporting text that fades in below (DOM, eyebrow style) |
| `fx` | `EffectSpec[]?` | Entrance effects (default: slam + warm glow) |
| `style` | `{ size?, weight?, color? }?` | Optional overrides |

---

#### `pr-objectives`
Frames what a PR is trying to do in three tiers: primary objectives,
secondary objectives, and constraints. Rows auto-stagger in; beats can
reveal and check them off as the diff proves them.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Headline (default "What this PR is doing") |
| `primary` | `{ id, statement }[]` | 1–2 large italic-serif objectives |
| `secondary` | `{ id, statement }[]?` | 0–4 medium mono objectives |
| `constraints` | `{ id, statement }[]?` | 0–3 "WON'T" boundaries |
| `staggerMs` | `number?` | Delay between tier reveals (default 400) |

**emphasize target prefixes:**
- `"obj-1"` → pulse only
- `"reveal:obj-1"` → make visible (idempotent)
- `"check:obj-1"` → mark complete (sticky checkmark)
- `"uncheck:obj-1"` → escape hatch

---

### Code

#### `code-zoom`
Code block in a sunken glass plate that zooms in from small. Prism
syntax highlighting. Optional pre-highlighted lines.

| Slot | Type | Notes |
|---|---|---|
| `code` | `string` | Code to display |
| `language` | `string?` | Prism language id (default: `javascript`) |
| `highlight` | `number[]?` | 1-based line numbers to pre-highlight |
| `startScale` | `number?` | Initial zoom scale (default 0.15) |

Supported languages: `javascript`, `typescript`, `jsx`, `tsx`,
`python`, `json`, `bash`

**emphasize targets:** 1-based line number as string (`"5"`, `"12"`, …)

---

#### `code-diff`
Before/after view of a code hunk. Two modes: `split` (side-by-side,
default) and `unified` (single column, red/green gutter). Line
highlights are sticky and layer — multiple lines can be lit at once
to show "this turned into that."

| Slot | Type | Notes |
|---|---|---|
| `before` | `{ code, startLine?, highlight?, language? }` | Left / old side |
| `after` | `{ code, startLine?, highlight?, language? }` | Right / new side |
| `mode` | `"split" \| "unified"?` | Default `"split"` |
| `title` | `string?` | Optional scene headline |

**emphasize target prefixes:**
- `"before:42"` → sticky highlight on line 42 of the before side
- `"after:42"` → sticky highlight on line 42 of the after side
- `"pair:42"` → lights both `before:42` and `after:42`
- `"before"` → pulse the whole before column (transient, 1.4s)
- `"after"` → pulse the whole after column (transient, 1.4s)
- `"clear"` → reset all sticky highlights

---

#### `code-cloud`
Weighted word cloud of code concepts inside a glass plate. Weight drives
font size (0–1). Categories drive color. Supports three entrance styles.

| Slot | Type | Notes |
|---|---|---|
| `items` | `{ text, weight, category }[]` | Cloud items |
| `categoryColors` | `Record<string, string>?` | category → color (CSS, `var(--cs-*)`, or `palette.*`) |
| `entranceStyle` | `"scatter" \| "spiral" \| "typewriter"?` | How items appear |
| `float` | `boolean?` | Opt-in continuous gentle float (default false) |

**emphasize targets:** item text string

---

### Diagrams

#### `flow-diagram`
Directed graph of labeled nodes and edges, rendered as scalable SVG.
Auto-fits to the available frame via viewBox. Auto-detects orientation
from the host aspect ratio.

| Slot | Type | Notes |
|---|---|---|
| `nodes` | `{ id, label, group? }[]` | Graph nodes |
| `edges` | `{ from, to, label? }[]?` | Directed edges |
| `groups` | `{ id, label, color }[]?` | Node groups (color: CSS or `palette.*`) |
| `staggerMs` | `number?` | Delay between node entrances (default 250) |
| `layout` | `"left-to-right" \| "top-to-bottom" \| "radial"?` | Default auto-detected |
| `orbit` | `boolean?` | Accepted for back-compat; no-op in SVG renderer |

Soft cap: 12 nodes. Excess nodes are trimmed by degree (highest-degree
nodes kept) to prevent dense ball-of-lines renders.

**emphasize targets:** node id string

---

#### `sequence-diagram`
UML-style sequence diagram: actor lanes across the top, animated arrows
drawn between them in time order. Activation bars show which actor is
on the stack.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `actors` | `{ id, label }[]` | Max 5 recommended |
| `steps` | `{ from, to?, label, kind? }[]` | kind: `"request" \| "response" \| "self" \| "note"` |
| `staggerMs` | `number?` | Delay between step reveals (default 700) |

For `kind="note"`, `to` is ignored; the note anchors on `from`.

**emphasize targets:** step index as string

---

#### `entity-map`
Entity-relationship diagram. Models/tables as rounded cards showing
fields; relationship lines with plain-English labels ("has many",
"belongs to") instead of crow's-foot notation.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `entities` | `{ id, label, fields?, color?, row?, col? }[]` | 3–10 entities |
| `relationships` | `{ from, to, label, type? }[]` | type: cardinality hint |
| `staggerMs` | `number?` | Delay between card reveals (default 300) |
| `layout` | `"grid" \| "hierarchical"?` | Default `"grid"` |

Color drives the accent stripe on each card. `row`/`col` pin a card to
a specific grid cell.

**emphasize targets:** entity id string. Pulses the card and highlights
all relationship lines connected to it.

---

#### `step-journey`
Horizontal progress walkthrough: numbered circles connected by a
progress line. Steps reveal left-to-right. Think subway map meets
wizard stepper.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `steps` | `{ label, detail? }[]` | 3–7 steps recommended |
| `activeColor` | `string?` | CSS color for lit-up steps (default `var(--cs-accent-cool)`) |
| `staggerMs` | `number?` | Delay between step reveals (default 1000) |

**emphasize targets:** step index as string (`"0"`, `"1"`, …)

---

### Data and analysis

#### `data-pipeline`
Shows data flowing through transformation stages with actual values
visible at each step. Unlike `transform-grid` (abstract stage labels),
this renders the data itself — arrays being filtered, mapped, reduced.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `input` | `{ label, data, display? }` | The starting data |
| `stages` | `{ operation, label, result, highlight?, display? }[]` | 2–5 stages |
| `staggerMs` | `number?` | Delay between stages (default 1500) |

`display` options: `"table"` (default), `"value"`, `"breakdown"`.
`highlight` names the key to visually call out in the result.

**emphasize targets:** stage index as string (`"0"` = first transformation)

---

#### `scorecard`
Report-card grid of metrics with letter grades. Overall grade large at
top; items show label, grade, severity bar, and one-line note.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `overallGrade` | `string` | "A" through "F", optionally with +/- |
| `items` | `{ label, grade, note }[]` | 3–8 items |

Grade tiers: `A/B → good` (cool), `C/D → mid` (warm), `F → poor` (warn).

**emphasize targets:** item index as string

---

#### `risk-matrix`
2×2 triage plot (impact × likelihood) for gotchas. One dot per risk,
with collision-nudge for overlapping positions. Opens the gotchas
movement — gives the viewer the shape of risk before any one risk gets
a deep-dive scene.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `risks` | `{ id, label, impact, likelihood, file?, lineRange? }[]` | 0–1 normalized scores |
| `quadrantLabels` | `{ topRight?, topLeft?, bottomRight?, bottomLeft? }?` | Corner labels |
| `staggerMs` | `number?` | Delay between dot reveals |

**emphasize target prefixes:**
- `"id"` → pulse one risk dot
- `"reveal:id"` → make the dot visible (idempotent)

---

#### `repo-pulse`
Community/liveness signal card for a repo. Surfaces commit cadence,
contributor activity, and an activity signal badge.

| Slot | Type | Notes |
|---|---|---|
| `activitySignal` | `"active" \| "maintained" \| "dormant" \| "archived"` | Badge type |
| `lastCommitDate` | `string` | ISO date |
| `daysSinceLastCommit` | `number` | |
| `commitsLast30Days` | `number` | |
| `commitsLast90Days` | `number` | |
| `commitsLast365Days` | `number` | |
| `uniqueContributorsLast90Days` | `number` | |
| `totalContributors` | `number` | |
| `topContributors` | `{ name, commits, lastActiveDate }[]?` | |
| `branchCount` | `number` | |
| `tagCount` | `number` | |
| `title` | `string?` | Optional headline override |
| `repoLabel` | `string?` | Optional repo name above the title |

Signal badge tones: `active→ok`, `maintained→cool`, `dormant→warm`,
`archived→warn`

**emphasize targets:** `"signal"`, `"stats"`, `"contributors"`,
contributor index as string

---

### Structural / layout

#### `tech-stack-breakdown`
Full-bleed breakdown of a repo's tech stack across up to six standard
categories. Each category is optional — omit any that aren't relevant.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline (default "Tech Stack") |
| `sections` | `{ category, items: { name, role? }[] }[]` | 1–6 sections |

Categories: `"network"`, `"data"`, `"application"`, `"services"`,
`"ui"`, `"devops"`

**emphasize targets:** category id string, or `"N:M"` for a specific
item (section index : item index, both 0-based)

---

#### `directory-tree`
Repository/directory structure view inside a glass plate. Calm template
— tree expands depth-by-depth once, then holds still.

| Slot | Type | Notes |
|---|---|---|
| `root` | `string?` | Root label at top |
| `tree` | `{ name, badge?, note?, highlight?, children? }[]` | Tree nodes |
| `maxDepth` | `number?` | Collapse deeper levels (default 3) |
| `staggerMs` | `number?` | Per-depth reveal delay (default 200) |
| `style` | `"tree" \| "indented" \| "explorer"?` | Default `"tree"` |

`highlight: true` on a node applies the warm accent at baseline — reserve
for one call-out row per scene.

**emphasize targets:** node name string

---

#### `compare-split`
Side-by-side comparison of two parallel options inside glass plates with
a divider. For mode contrasts, analogies, tradeoffs, before/after. Unlike
`transform-grid` (sequential pipeline), this shows two things that exist
in parallel.

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `left` | `{ heading, icon?, bullets?, accent? }` | Left panel |
| `right` | `{ heading, icon?, bullets?, accent? }` | Right panel |
| `divider` | `"vs" \| "or" \| "→" \| "none"?` | Default `"vs"` |
| `staggerMs` | `number?` | Delay between reveals (default 400) |

`accent` resolves through `resolveColor` — accepts `palette.*` aliases.

**emphasize targets:** `"left"`, `"right"`

---

#### `transform-grid`
Horizontal pipeline of stages in nested glass plates that reveal
left-to-right with connector glyphs. Stages can show code or text.
Implies sequential flow (compare: `compare-split` for parallel options).

| Slot | Type | Notes |
|---|---|---|
| `title` | `string?` | Optional headline |
| `stages` | `{ label, display: { type, code?, text?, language? } }[]` | Pipeline stages |
| `staggerMs` | `number?` | Delay between stage reveals (default 600) |
| `connector` | `"arrow" \| "chevron" \| "fade"?` | Glyph between stages |

**emphasize targets:** stage index as string

---

#### `center-stage`
Central concept rendered large on canvas in Instrument Serif italic,
with related terms orbiting around it. Weight drives size and ink
brightness of orbiters.

| Slot | Type | Notes |
|---|---|---|
| `center` | `{ text, size? }` | The central concept |
| `orbiting` | `{ text, weight }[]?` | Satellite terms (weight 0–1) |
| `staggerMs` | `number?` | Delay between orbiter entrances (default 200) |
| `orbitSpeed` | `number?` | Radians/frame for slow rotation (default 0 = static) |
| `centerFx` | `EffectSpec[]?` | Entrance effects for the center word |

**emphasize targets:** orbiter text string

---

## Extension — adding a template

> For the hands-on walkthrough (running the sandbox, the Presenter API, styling
> with design tokens), see [`docs/creating-a-template.md`](../../../docs/creating-a-template.md)
> and the annotated reference at
> [`src/templates/hello-template.ts`](../src/templates/hello-template.ts). The
> checklist below is the terse reference.

1. Create `your-template.ts` in `apps/player/src/templates/`.
2. Implement the `Template` interface. Include `id`, `version`, `description`,
   `slots`, `demo`, and `render()`.
3. `render()` must return a `TemplateHandle` with `dismiss()` and,
   where relevant, `emphasize()`.
4. Follow all design rules in §Design Rules, especially:
   - Accent budget = 1
   - Calm by default
   - Total dismiss
5. Import and `registerTemplate()` in `index.ts`.
6. Add an entry to §Template Catalog in this document.
7. Bump the template's `version` on any subsequent behavior change.

---

## Planned additions (v1.1)

### Analogy template family

LLMs naturally reach for spatial analogies when explaining abstract
concepts (airport terminals, subway stations, post offices, ticket
queues, fish ponds). The current template set handles this awkwardly —
analogies end up forced into `compare-split` or described in
`title-bullets` text.

The planned analogy family adds first-class components with consistent
visual styling across the whole family:

**Candidate templates:**

| Template id | Analogy concept | Good for explaining |
|---|---|---|
| `analogy-terminal` | Airport terminal | Multi-stage pipelines, request routing |
| `analogy-queue` | Ticket line / queue | Job queues, rate limiting, backpressure |
| `analogy-map` | Subway/transit map | Service graphs, dependencies, routes |
| `analogy-post-office` | Post office | Message passing, pub/sub, dispatch |
| `analogy-pond` | Fish pond | Resource pools, connection pools |
| `analogy-bridge` | Bridge / crossing | API contracts, protocol boundaries |

**Design constraints for the family:**
- All analogy templates share a visual language: same stroke weight,
  same type scale for labels, same glass-plate surface for callouts.
- Each supports the standard `emphasize(target)` contract — individual
  elements within the analogy scene (a lane, a counter, a car on the
  bridge) are addressable by name.
- The producer's slot schema for each template must be expressive enough
  that the LLM can map a real technical concept onto the analogy without
  free-form layout control. The template owns the layout; the producer
  owns the semantics.

### Animation and motion (Lottie-style)

The current entrance system (CSS transitions, canvas fx) covers stagger
reveals, zoom-ins, and word-slam entrances. Planned additions:

- **Lottie integration** — a `lottie-scene` template primitive that
  plays a Lottie JSON animation as a scene or as a background layer.
  Useful for ambient motion (data flowing through pipes, packets moving
  across a network) that the current CSS transition system can't express.
- **Beat-driven animation state** — `emphasize()` targets that trigger
  named animation states within a Lottie clip, so the producer can
  synchronize narration beats to specific animation moments.
- **Path-drawing primitives** — SVG stroke-dashoffset draw-in is already
  used in `sequence-diagram`. A shared `drawPath()` Presenter primitive
  would let other templates use the same technique without reimplementing
  the rAF loop.

### Timing standardization

The current `staggerMs` slot is per-template with per-template defaults.
A future version will expose a script-level `timingProfile` that sets
baseline pacing across all scenes:

```ts
interface PresentationScript {
  // ...
  timingProfile?: {
    staggerMs: number;     // global default for all staggerMs slots
    emphasisMs: number;    // global default for emphasis pulse duration (currently hardcoded 1400)
    transitionMs: number;  // scene-to-scene transition duration
  };
}
```

Templates will inherit from the profile and can override locally. This
lets the producer say "this is a fast-paced technical audience" once,
rather than setting `staggerMs` on every scene.

### LLM choice budget

As the template stack grows, the producer faces more choices per scene.
A larger library increases variety but also increases the risk of
mismatched templates and slower generation. The planned mitigation:

- Each template carries a `complexity` rating (`"simple"`, `"moderate"`,
  `"rich"`) that guides the producer toward simpler templates for
  straightforward content.
- The script-level `timingProfile` will include a `templateBudget`
  hint — a maximum number of distinct templates per script — so the
  producer doesn't exhaust its decision budget on template selection
  at the cost of content quality.
- A curated "starter set" of 8–10 templates will be documented as the
  default recommendation for the producer, with the full catalog
  available for opt-in on specific content shapes.

---

## Versioning this spec

This document is versioned independently of the player code. When the
format changes in a backward-incompatible way, bump the major version
in the `PresentationScript.version` field and update this document.

Backward-compatible additions (new templates, new optional slots) bump
the minor version. The current format version is **1.0**.

The reference implementation is `apps/player/src/templates/`. When this
spec and the implementation diverge, the implementation is authoritative
for current behavior; this spec is authoritative for intended behavior.
File a discrepancy as a bug.

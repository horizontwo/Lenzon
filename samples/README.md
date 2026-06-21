# Samples

Worked examples of the data that flows through Lenzon. They let you read the
contracts without standing up the backend.

## The pipeline

```
GitHub repo
  → [Agent 1 · Code Analysis]  →  AnalysisJSON         (agent1-*.json)
  → [Agent 2 · Producer]       →  PresentationScript   (agent2-*.json)
  → [Player]                   →  animated presentation
```

The two JSON shapes are defined in `@lenzon/shared-types` and are the source of
truth:

- **AnalysisJSON** — [`packages/shared-types/src/analysis.ts`](../packages/shared-types/src/analysis.ts)
- **PresentationScript** — [`packages/shared-types/src/script.ts`](../packages/shared-types/src/script.ts)

Each scene in a script names a `primitive.template` (a template `id`) and a
`primitive.content` (matching that template's `slots`). The player renders each
scene by looking the id up in its template registry. See
[`docs/templates-and-the-producer.md`](../docs/templates-and-the-producer.md).

## The files

### Runnable / minimal (start here)

A tiny, end-to-end-coherent pair for a fictional CLI. **Every template it uses
actually ships in the player**, so it renders cleanly.

| File | What it is |
|---|---|
| [`agent1-analysis-minimal.json`](./agent1-analysis-minimal.json) | A trimmed `AnalysisJSON` for `leaflet-cli`. |
| [`agent2-script-minimal.json`](./agent2-script-minimal.json) | The script a producer would emit from it — `title-card` → `flow-diagram` → `step-journey` → `outro-card`. |

### Reference / design-fiction (read, don't run)

A larger, more ambitious pair from an earlier design exploration.

| File | What it is |
|---|---|
| [`agent1-analysis-invoicely.json`](./agent1-analysis-invoicely.json) | A full-size, real-shape `AnalysisJSON` for an "Invoicely" app. Good for seeing a rich analysis. |
| [`agent2-script-invoicely.json`](./agent2-script-invoicely.json) | **⚠️ Design-fiction.** Its own `_commentary` marks it `UNCONSTRAINED` — the producer invents visual primitives it wants, and it references templates that **do not exist** in the player (`narrative-card`, `timeline`, `split-analogy`, `danger-zone`, `before-after`, `hotspot-map`, `ranked-list`). It shows producer *ambition*, not a renderable script. Do not load it into the sandbox — it will throw `unknown template "…"`. |

## How to view a script

The supported local surface is the **player sandbox** (`npm run dev`), which
renders templates one at a time from their `demo` payloads — see
[`docs/quickstart.md`](../docs/quickstart.md) and
[`docs/creating-a-template.md`](../docs/creating-a-template.md). To eyeball a
specific scene, copy its `primitive.content` into the matching template's
`demo.content` and run it from the dropdown.

A full-script player route exists in the server (`app/studio2`), but the server
folder is reference code, not a bootable app — see the quickstart.

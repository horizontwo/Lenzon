# Templates and the Producer

You've built a template (see
[creating-a-template.md](./creating-a-template.md)). This doc answers the next
question: **how does the system know your template exists, and how does the LLM
that writes presentation scripts decide to use it?**

---

## The pipeline, briefly

```
GitHub repo
  → [Agent 1 · Code Analysis]  →  AnalysisJSON
  → [Agent 2 · Producer]       →  PresentationScript   (picks templates, fills slots)
  → [Player]                   →  animated presentation (renders each template)
```

The contracts for the two JSON shapes live in `@lenzon/shared-types`
([`analysis.ts`](../packages/shared-types/src/analysis.ts),
[`script.ts`](../packages/shared-types/src/script.ts)). Worked examples are in
[`samples/`](../samples/) — start with
[`samples/README.md`](../samples/README.md).

Your template is the last hop: the **Producer** emits a `PresentationScript`
whose scenes each name a `primitive.template` (your `id`) and a
`primitive.content` (matching your `slots`). The player looks the id up in the
registry and calls your `render()`.

---

## Registration is the publish step

There is **no separate package registry or plugin manifest.** A template
becomes available the instant it is registered:

```ts
// apps/player/src/templates/index.ts
import { yourTemplate } from './your-template';
registerTemplate(yourTemplate);
```

Importing [`templates/index.ts`](../apps/player/src/templates/index.ts) for its
side effect is how the `Presenter` ends up knowing what templates exist
(see [`registry.ts`](../apps/player/src/templates/registry.ts)). User or agent
code can also call `registerTemplate()` at runtime to add more.

---

## The three discovery surfaces

Everything a backend/producer needs to reason about templates comes from three
functions in [`registry.ts`](../apps/player/src/templates/registry.ts):

| Function | Returns | Used for |
|---|---|---|
| `listTemplates()` | every template's `id`, `description`, and `slots` | the catalog the producer chooses from |
| *(per-template)* `slots` | a `Record<string, string>` schema hint | tells a model what content shape each template takes |
| `listTemplateVersions()` | id → version map | recorded at script-create time for provenance |

The `slots` field is the key contract. From `registry.ts`, verbatim:

> Machine-readable schema hint. Not validated here — intended for an agent
> tool-discovery endpoint that wants to tell a model what slots this template
> takes.

So `slots` + `description` are the entirety of what the producer "sees" about
your template. Write them as if a model has to pick your template from a list of
two dozen with nothing but those two strings — because that's exactly what
happens. A vague `description` or missing `slots` means the producer can't use
your template well, even though it renders fine in the sandbox.

---

## Where the actual selection happens (scoping note)

The Producer's LLM prompt — the "visual primitives catalog" that turns `slots`
into model instructions — lives in the **private backend**, not in this repo.
You'll see it referenced but not present: e.g.
[`palette.ts`](../apps/player/src/templates/palette.ts) points at
`apps/server/lib/agents/producer.system-prompt`, which isn't shipped here.

What this means for a contributor:

- **This repo defines the contract**: your template's `id`, `description`,
  `slots`, and the `palette.*` aliases it understands.
- **The backend implements selection against that contract**: it reads the
  registry's discovery surfaces and prompts the model to choose and fill
  templates.

You can fully build, register, and visually verify a template here without the
backend. When the backend regenerates its catalog from the registry, your
template's `description`/`slots` are what it picks up. (The provider/model seam
itself is "coming soon" — see §C of the OSS release checklist.)

---

## Versioning and provenance

- Bump your template's `version` on any behavior change worth tracking (spec
  [§Version provenance](../apps/player/playerSpecs/BeatScript-spec.md)).
- At script-create time the server snapshots `listTemplateVersions()` into the
  script record's `playerTemplateVersions` (see `ScriptRecord` in
  [`script.ts`](../packages/shared-types/src/script.ts)), so a saved script
  records exactly which template versions it was produced against — that's how
  drift between a stored script and the deployed player is detected.

---

## The round-trip, end to end

The [`samples/`](../samples/) directory shows the full path on one small
example:

1. [`agent1-analysis-minimal.json`](../samples/agent1-analysis-minimal.json) —
   the analysis of a fictional CLI.
2. [`agent2-script-minimal.json`](../samples/agent2-script-minimal.json) — the
   script the producer would emit from it, using only **registered** templates
   (`title-card` → `flow-diagram` → `step-journey` → `outro-card`).
3. The player renders each scene's `primitive` against the registry.

To eyeball a single template from that script in the sandbox, copy a scene's
`primitive.content` into that template's `demo.content` and run it from the
dropdown.

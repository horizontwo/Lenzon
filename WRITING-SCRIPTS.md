# Writing a script

A script is one JSON file. It describes an explainer: a run of animated
scenes, each with a line of narration. `@lenzon/player` plays it.

This guide goes from an empty folder to a script playing. Then it covers
what makes a script good. It ends with a full worked example, an
explainer for a small business idea.

It is written for people and for AI agents alike. An agent asked to write
a script should read this file and `TEMPLATES.md` first.
`npx @lenzon/player skill` installs a Claude Code skill that does that.

## Start

You need Node 18 or newer. Nothing else.

```bash
npx @lenzon/player new my-idea.json
npx @lenzon/player play my-idea.json
```

`new` writes a short script that already plays. `play` opens it in your
browser. Press Play, since browsers will not speak until you click.

Now change the words in the file. Save it, and reload the page. You see
the change straight away.

## The shape of a script

A script has three parts.

```json
{
  "meta": { "title": "…", "generatedAt": "…", "persona": "friendly", "estimatedDuration": 60 },
  "defaults": { "palette": { … }, "transition": { … }, "voice": { … } },
  "scenes": [ … ]
}
```

`meta` describes the whole explainer.

| Field | What it is |
| --- | --- |
| `title` | The explainer's name. The page shows it in the tab. |
| `generatedAt` | When the script was written, as an ISO date. |
| `persona` | The voice the narration is written in. See Persona below. |
| `estimatedDuration` | Total length in seconds. The sum of every scene's `holdSeconds`. |
| `repoUrl` | Optional. Only for an explainer about a code repository. |

`defaults` holds the look and sound shared by every scene.

| Field | What it is |
| --- | --- |
| `palette` | Six colors: `primary`, `secondary`, `accent`, `background`, `text`, `code`. |
| `transition` | How scenes change. `type` is `fade`, `cut`, `slide-left`, `slide-right`, `zoom-in` or `dissolve`. `durationMs` is its length. |
| `voice` | A hint for whoever records the narration: `provider`, `voiceId`, `speed`. `play` uses the browser's voice and ignores it. |

`scenes` is the explainer, in order. Each scene looks like this.

```json
{
  "id": "how",
  "primitive": {
    "template": "step-journey",
    "content": { "title": "How borrowing works", "steps": [{ "label": "Browse" }, { "label": "Reserve" }] }
  },
  "narration": "Here is how it works. You browse the shelf, then reserve a tool.",
  "holdSeconds": 8,
  "beats": [{ "at": 2.2, "action": { "type": "emphasize", "target": "0" } }]
}
```

| Field | What it is |
| --- | --- |
| `id` | A name for the scene. Unique in the script. |
| `primitive.template` | Which template draws the scene. It must be a name from `TEMPLATES.md`, spelled exactly. |
| `primitive.content` | The template's slots. Each template takes its own. `TEMPLATES.md` lists them, with an example. |
| `narration` | What is said aloud during the scene. |
| `holdSeconds` | How long the scene stays up. The player holds at least this long, and longer if the narration runs over. |
| `beats` | Optional. Moments in the scene that point at something. See Beats below. |
| `transition` | Optional. Overrides the default transition into this scene. |
| `narrationAudioUrl` | Optional. A recorded MP3 of the narration. A relative path is read from beside the script. |
| `section` | Optional. A label for which part of the story the scene tells. The player ignores it. |

## Plan the story first

Decide what the viewer should understand at the end. Then work backward.

A good arc moves from what to how to why. For a business idea, that is
often: the problem, the idea, how it works, how it compares, where the
money comes from, what could go wrong, the plan, and the ask.

Give each scene one idea. If a scene needs two headlines, it is two
scenes.

Pick a length before you write.

| Kind | Scenes | About |
| --- | --- | --- |
| An elevator pitch | 4–6 | 1 minute |
| A standard walkthrough | 8–12 | 2–3 minutes |
| A detailed review | 12–18 | 4–5 minutes |
| A deep dive | 18–25 | 6 minutes or more |

## Pick a template by the shape of the idea

Ask what shape the scene's idea has. Then pick the template drawn for that
shape. All of these suit any subject.

| The idea is… | Use |
| --- | --- |
| One word or phrase that should land hard | `emphasis-word` |
| A headline and a few points | `title-bullets` |
| A claim and the evidence for it | `purpose-bullets` |
| A sequence of steps a person goes through | `step-journey` |
| Stages where each one changes the thing before it | `transform-grid` |
| Two options side by side | `compare-split` |
| Who gives what to whom | `flow-diagram` |
| Who talks to whom, in order | `sequence-diagram` |
| One core idea and the things around it | `center-stage` |
| Many terms, some bigger than others | `code-cloud` |
| Things and how they relate | `entity-map` |
| Grades or ratings | `scorecard` |
| Risks, by how likely and how bad | `risk-matrix` |
| A plan in phases, with where you are now | `roadmap-rail` |
| Decisions, made and still open | `decision-ledger` |
| Things you chose not to do | `constraint-wall` |

`TEMPLATES.md` has every slot for each one, and the templates that only
suit code.

Keep on-screen text short. A headline is 3 to 5 words, not a sentence.
Most headlines are drawn large at a fixed size, so a long one wraps, and
can be cut off. A bullet is a few words. The narration carries the
detail, so the screen does not have to. `TEMPLATES.md` gives the limit
where a template has a tight one.

Vary the templates. Three `title-bullets` in a row feels like a slide
deck.

## Write narration for the ear

Narration is read aloud. Every line must make sense heard once, with no
screen to reread.

- Write the way you would say it. Short sentences. Plain words.
- Never mention the slide or the screen. Say "here is how" or "notice
  that" instead.
- No markdown, no brackets, no lists. A voice reads all of it literally.
- Spell out what a voice might stumble on. Write "about half", not "~50%".

### Persona

`meta.persona` names the voice the narration is written in.

- `friendly`: warm and encouraging. Uses "we" and "let's". A smart friend
  explaining over coffee.
- `corporate`: measured and professional. A consultant presenting
  findings.
- `stern`: direct and opinionated. Does not sugarcoat.
- `character`: theatrical and full of metaphor. A documentary narrator.

Pick one and keep to it in every scene.

## Timing

A voice speaks about 130 words a minute. That is about 2.2 words a
second.

**Hold.** Set `holdSeconds` to the narration's word count divided by 2.2,
plus 1 or 2 seconds to breathe. A 30-word line holds for about 16
seconds.

**Total.** Set `meta.estimatedDuration` to the sum of every
`holdSeconds`.

## Beats

A beat points at something on screen at the moment the narration names
it. When the voice says "and then the store donates stock", the store
lights up.

```json
{ "at": 5.3, "action": { "type": "emphasize", "target": "store" } }
```

`at` is seconds from the start of the scene. `target` names a part of the
template, and each template takes different targets. A step index, a
node id, `"left"` or `"right"`. `TEMPLATES.md` says what each one takes.

To time a beat, count the words before the word you want. Divide by 2.2,
and add 0.3.

> "A local hardware store donates older stock."
>
> To light the store on "hardware": 2 words come before it. 2 ÷ 2.2 + 0.3
> is about 1.2 seconds into the line.

Then add the time of any sentences before it in the same scene.

A few rules keep beats feeling right.

- Late is better than early. A beat just after its word feels intended.
  A beat before its word feels like a mistake.
- Never fire a beat before 0.8 seconds.
- Two to four beats a scene is plenty.
- Every `at` must be less than the scene's `holdSeconds`.
- Use `emphasize`. The format also lists `reveal`, `annotate` and `fx`
  actions, but the player does not act on them yet. `highlight-line`
  works only in `code-zoom`.

## Look

Keep the background dark. The player is designed for dark themes, and
`#0f172a` is a safe choice.

Match the palette to the persona. Warm blues and purples with an amber
accent suit `friendly`. Navy, slate and teal suit `corporate`. Dark grays
with a red accent suit `stern`. Bold, saturated colors suit `character`.

Some slots take a color. They accept any CSS color, or
`palette.primary`, `palette.secondary` and `palette.accent`, which follow
the script's palette.

A few templates take entrance effects, such as `titleFx` in
`title-bullets`. The effects are `zoom`, `grow`, `glow`, `slam`, `shake`
and `fadeOut`, each with a `duration` in milliseconds:
`[{ "name": "slam", "duration": 520 }]`.

## Voice

`play` speaks each scene with the browser's own voice. A scene with a
`narrationAudioUrl` plays that file instead, so a script can mix the two.
`--silent` plays with no voice, on a timer.

To use a voice service, record each scene's narration to an MP3 ahead of
time. Put the files beside the script, and set each scene's
`narrationAudioUrl` to its file's name.

## Check it

```bash
npx @lenzon/player check my-idea.json
```

`check` reads the script and lists what is wrong, scene by scene. An
error means the script will not play: an unknown template, a missing
narration, two scenes with one id. A warning means it plays, but worse: a
hold shorter than its narration, a beat that fires too early or after the
scene ends. `play` runs the same check first, and will not start on an
error.

It cannot catch everything. These are the common mistakes it misses.

- A slot name spelled wrong. The template ignores it, so the scene draws
  without it. Copy slot names from `TEMPLATES.md`.
- An edge or relationship that names an id with no node or entity. The
  line is dropped without a word.
- A beat whose target the template does not know. Nothing lights up.

Watch the whole thing once with the sound on. Then watch it again with
`--silent`, and read only the screen. Each pass shows different problems.

## A worked example: a tool library

This explainer pitches Toolshed, a tool library for one street. It runs
eight scenes, about two and a quarter minutes, in the `friendly` persona.
It uses only templates that suit any idea. It has no `repoUrl` and no
`section`, since it is not about code.

| Scene | Template | Why this one |
| --- | --- | --- |
| `open` | `emphasis-word` | The name, landing hard. |
| `problem` | `purpose-bullets` | One claim, "tools sit idle", with three points of evidence. |
| `how` | `step-journey` | Borrowing is four steps a member goes through. |
| `compare` | `compare-split` | Buying and borrowing are two options side by side. |
| `money` | `flow-diagram` | The money is about who gives what to whom. |
| `risks` | `risk-matrix` | Each risk has a likelihood and a cost. |
| `plan` | `roadmap-rail` | The plan is phases, and the pilot is where it stands. |
| `close` | `title-bullets` | The ask is a short list. |

Each beat lands on the word that names its target. In `money`, the voice
says "Members", "hardware", "Volunteers" and "lends", and the matching
node lights up each time.

To play it, save the JSON below as `toolshed.json`. Then run
`npx @lenzon/player play toolshed.json`. It is also exported as
`sampleScripts.idea` from `@lenzon/player/samples`.

<!-- example:begin -->

```json
{
  "meta": {
    "title": "Toolshed — a tool library for one street",
    "generatedAt": "2026-11-10T00:00:00.000Z",
    "persona": "friendly",
    "estimatedDuration": 135
  },
  "defaults": {
    "palette": {
      "primary": "#3b82f6",
      "secondary": "#a855f7",
      "accent": "#f59e0b",
      "background": "#0f172a",
      "text": "#f8fafc",
      "code": "#94a3b8"
    },
    "transition": {"type":"fade","durationMs":400},
    "voice": {"provider":"stub","voiceId":"stub-1","speed":1}
  },
  "scenes": [
    {
      "id": "open",
      "primitive": {
        "template": "emphasis-word",
        "content": {"word":"Toolshed","subtitle":"A tool library for one street"}
      },
      "narration": "Here is an idea for a neighborhood tool library. We call it Toolshed. Instead of every house buying the same drill, the street shares one.",
      "holdSeconds": 13
    },
    {
      "id": "problem",
      "primitive": {
        "template": "purpose-bullets",
        "content": {
          "purpose": "Tools sit idle in garages",
          "supports": [
            {
              "point": "Most tools get used a few times a year",
              "type": "concern"
            },
            {"point":"Every house buys its own copy","type":"concern"},
            {"point":"The space they take up is not free","type":"detail"}
          ]
        }
      },
      "narration": "Start with the problem. Most tools get used a few times a year, then sit in a garage. Every house on the street buys its own copy. And the space they take up is not free either.",
      "holdSeconds": 19,
      "beats": [
        {"at":2.1,"action":{"type":"emphasize","target":"0"}},
        {"at":8.5,"action":{"type":"emphasize","target":"1"}},
        {"at":13.5,"action":{"type":"emphasize","target":"2"}}
      ]
    },
    {
      "id": "how",
      "primitive": {
        "template": "step-journey",
        "content": {
          "title": "How borrowing works",
          "steps": [
            {"label":"Browse","detail":"See what is on the shelf"},
            {"label":"Reserve","detail":"Pick the day you need it"},
            {"label":"Pick up","detail":"From the shed"},
            {"label":"Return","detail":"Within a week"}
          ]
        }
      },
      "narration": "Here is how it works for a member. You browse what is on the shelf, reserve a tool for the day you need it, pick it up from the shed, and bring it back within a week.",
      "holdSeconds": 19,
      "beats": [
        {"at":4.4,"action":{"type":"emphasize","target":"0"}},
        {"at":7.1,"action":{"type":"emphasize","target":"1"}},
        {"at":11.2,"action":{"type":"emphasize","target":"2"}},
        {"at":14.4,"action":{"type":"emphasize","target":"3"}}
      ]
    },
    {
      "id": "compare",
      "primitive": {
        "template": "compare-split",
        "content": {
          "title": "Buying or borrowing",
          "left": {
            "heading": "Buy a drill",
            "bullets": ["Pay full price","Use it twice a year","Store it forever"],
            "accent": "palette.secondary"
          },
          "right": {
            "heading": "Borrow from Toolshed",
            "bullets": [
              "A small yearly fee",
              "There when you need it",
              "Someone else keeps it working"
            ],
            "accent": "palette.primary"
          },
          "divider": "vs"
        }
      },
      "narration": "Compare that with buying. Buying a drill means paying full price for something you use twice a year. Borrowing costs a small yearly fee, and someone else keeps it working.",
      "holdSeconds": 16,
      "beats": [
        {"at":1.7,"action":{"type":"emphasize","target":"left"}},
        {"at":8.5,"action":{"type":"emphasize","target":"right"}}
      ]
    },
    {
      "id": "money",
      "primitive": {
        "template": "flow-diagram",
        "content": {
          "nodes": [
            {"id":"members","label":"Members","group":"people"},
            {"id":"store","label":"Hardware store","group":"partners"},
            {"id":"fixers","label":"Repair volunteers","group":"people"},
            {"id":"shed","label":"Toolshed","group":"shed"}
          ],
          "edges": [
            {"from":"members","to":"shed","label":"yearly fee"},
            {"from":"store","to":"shed","label":"older stock"},
            {"from":"fixers","to":"shed","label":"repairs"}
          ],
          "groups": [
            {"id":"people","label":"Neighbors","color":"palette.primary"},
            {"id":"partners","label":"Partners","color":"palette.secondary"},
            {"id":"shed","label":"The library","color":"palette.accent"}
          ],
          "layout": "left-to-right"
        }
      },
      "narration": "The money is simple. Members pay a yearly fee. A local hardware store donates older stock, for the goodwill. Volunteers fix what breaks. And Toolshed lends it all back out.",
      "holdSeconds": 16,
      "beats": [
        {"at":2.1,"action":{"type":"emphasize","target":"members"}},
        {"at":5.3,"action":{"type":"emphasize","target":"store"}},
        {"at":8.9,"action":{"type":"emphasize","target":"fixers"}},
        {"at":11.7,"action":{"type":"emphasize","target":"shed"}}
      ]
    },
    {
      "id": "risks",
      "primitive": {
        "template": "risk-matrix",
        "content": {
          "title": "What could go wrong",
          "items": [
            {
              "id": "R1",
              "label": "Tools come back broken",
              "impact": 0.45,
              "likelihood": 0.75
            },
            {
              "id": "R2",
              "label": "Too few members to cover rent",
              "impact": 0.8,
              "likelihood": 0.4
            },
            {
              "id": "R3",
              "label": "A tool is never returned",
              "impact": 0.3,
              "likelihood": 0.3
            },
            {
              "id": "R4",
              "label": "Someone is hurt using a tool",
              "impact": 0.9,
              "likelihood": 0.15
            }
          ],
          "quadrantLabels": {
            "topRight": "Plan for first",
            "topLeft": "Insure against",
            "bottomRight": "Expect and absorb",
            "bottomLeft": "Watch"
          }
        }
      },
      "narration": "What could go wrong? Tools will come back broken, so repairs are part of the plan. Too few members would leave the rent unpaid. And an injury is rare but serious, so insurance comes first.",
      "holdSeconds": 18,
      "beats": [
        {"at":3.9,"action":{"type":"emphasize","target":"R1"}},
        {"at":8,"action":{"type":"emphasize","target":"R2"}},
        {"at":12.1,"action":{"type":"emphasize","target":"R4"}}
      ]
    },
    {
      "id": "plan",
      "primitive": {
        "template": "roadmap-rail",
        "content": {
          "title": "Getting to a full shed",
          "stretches": [
            {"id":"pilot","label":"Pilot"},
            {"id":"grow","label":"Grow"},
            {"id":"stand","label":"Stand on its own"}
          ],
          "posts": [
            {
              "label": "Twenty tools, one street",
              "stretch": "pilot",
              "status": "active"
            },
            {
              "label": "Fifty paying members",
              "stretch": "pilot",
              "status": "not-started"
            },
            {"label":"A real shed","stretch":"grow","status":"not-started"},
            {
              "label": "A second neighborhood",
              "stretch": "grow",
              "status": "not-started"
            },
            {
              "label": "Fees cover the rent",
              "stretch": "stand",
              "status": "not-started"
            }
          ],
          "currentPost": 0
        }
      },
      "narration": "The plan starts small. A pilot with twenty tools on one street. Then fifty paying members, and a real shed. A second neighborhood comes next. The goal is the day the fees cover the rent on their own.",
      "holdSeconds": 19,
      "beats": [
        {"at":2.6,"action":{"type":"emphasize","target":"0"}},
        {"at":6.2,"action":{"type":"emphasize","target":"1"}},
        {"at":8.5,"action":{"type":"emphasize","target":"2"}},
        {"at":9.8,"action":{"type":"emphasize","target":"3"}},
        {"at":12.1,"action":{"type":"emphasize","target":"4"}}
      ]
    },
    {
      "id": "close",
      "primitive": {
        "template": "title-bullets",
        "content": {
          "title": "What it takes to start",
          "bullets": [
            "Twenty donated tools",
            "One garage for a summer",
            "Ten neighbors willing to try it"
          ]
        }
      },
      "narration": "So here is what it takes to start. Twenty donated tools. One garage for a summer. And ten neighbors willing to try it. That is the whole ask.",
      "holdSeconds": 15,
      "beats": [
        {"at":3.9,"action":{"type":"emphasize","target":"0"}},
        {"at":5.8,"action":{"type":"emphasize","target":"1"}},
        {"at":8,"action":{"type":"emphasize","target":"2"}}
      ]
    }
  ]
}
```

<!-- example:end -->

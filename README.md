# @lenzon/player

A React runtime that plays a `PresentationScript` as an animated, narrated
explainer.

The script format is its own package, `@lenzon/explainer-format`. Lenzon's
pipeline is one thing that writes scripts. You can write one by hand, or
ask an agent to, or build a tool that does.

## Write your first script

```bash
npx @lenzon/player new my-idea.json
npx @lenzon/player play my-idea.json
```

`new` writes a short script that already plays. Change its words and
reload the page. `npx @lenzon/player check my-idea.json` lists what is
wrong with a script, in the terminal.

Two guides ship in this package, beside this README.

- `WRITING-SCRIPTS.md` goes from an empty file to a good script. It
  covers story, narration, timing and beats, and ends with a worked
  example that is not about code.
- `TEMPLATES.md` lists every template, its slots, and an example of each.
  The ones that suit any idea come first.

An agent asked to write a script should read both first. For Claude
Code, `npx @lenzon/player skill` installs a skill that does, into this
project's `.claude/skills/lenzon-explainer/`. Then ask for an explainer.
Run it again after upgrading the player, to refresh the guides beside it.

## Install

```bash
npm i @lenzon/player @lenzon/explainer-format react react-dom
```

React 18 and React 19 both work.

## Play a script file

To watch a script you already have, you need no app at all:

```bash
npx @lenzon/player play my-script.json
```

It opens the script in your browser, served from your own machine. Press
Play to start, since browsers will not speak until you click. Edit the
file and reload the page to see the change.

- A scene with a `narrationAudioUrl` plays that file. A relative URL is
  read from beside the script. Other scenes use the browser's own voice.
- `--silent` plays with no voice, on a timer.
- `--no-open` prints the address without opening a browser.
- `--port <n>` picks the port.

If a scene names a template the player does not have, the page lists it
and does not play.

To put a script inside your own app instead, read on.

## Play a script

```tsx
import { Presentation, ScriptPlayer, WebSpeechVoicePlayer } from '@lenzon/player';
import type { PresentationScript } from '@lenzon/explainer-format';
import '@lenzon/player/styles.css';

const script: PresentationScript = {
  meta: { title: 'Hello', generatedAt: '2026-11-08', persona: 'friendly', estimatedDuration: 6 },
  defaults: {
    palette: { primary: '#3b82f6', secondary: '#a855f7', accent: '#f59e0b', background: '#0f172a', text: '#f8fafc', code: '#94a3b8' },
    transition: { type: 'fade', durationMs: 400 },
    voice: { provider: 'stub', voiceId: 'browser', speed: 1 },
  },
  scenes: [{
    id: 'hello', holdSeconds: 6,
    narration: 'This explainer was written by hand.',
    primitive: { template: 'title-bullets', content: { title: 'Hello', bullets: ['Written by hand', 'Played by @lenzon/player'] } },
  }],
};

export function Explainer() {
  return (
    <div style={{ width: 960, height: 540 }}>
      <Presentation onReady={(presenter) => new ScriptPlayer(script, presenter, new WebSpeechVoicePlayer()).play()} />
    </div>
  );
}
```

`WebSpeechVoicePlayer` reads the narration with the browser's own voice.
`StubVoicePlayer` plays silently on a timer.

The stylesheet brings its own fonts. They sit beside it in the package,
and your bundler picks them up from the import. You serve nothing.

## Intro and outro

A script plays with no intro or outro by default. To add one, pass a
Lottie animation's URL as the fifth argument:

```tsx
new ScriptPlayer(script, presenter, voice, {}, { chrome: { intro: '/my-intro.lottie' } });
```

`intro: true` plays the animation bundled with the player, which is
Lenzon's logo.

## What is in the package

| Import | What it is |
| --- | --- |
| `@lenzon/player` | `Presentation`, `ScriptPlayer`, the voice players, `Presenter` and the template registry. |
| `@lenzon/player/styles.css` | The player's stylesheet. Import it once. |
| `@lenzon/player/templates` | The built-in templates. Importing the root registers them already. |
| `@lenzon/player/templates/registry` | `registerTemplate`, for adding your own. |
| `@lenzon/player/capture` | Deterministic frame stepping, for recording a script to video. |
| `@lenzon/player/samples` | Four sample scripts, as plain data. Safe to import on a server. `sampleScripts.idea` is the guide's worked example. |

Each template's content slots are listed in `TEMPLATES.md`. The same
text is on each template in the registry, as `slots`, for a tool that
wants to read it.

## Where this comes from

This branch is mirrored from Lenzon's private monorepo on each release.
Issues and pull requests are welcome here. A change merged here is ported
back by hand before the next release, so expect a short delay.

Licensed under Apache-2.0.

# @lenzon/player

A React runtime that plays a `PresentationScript` as an animated, narrated
explainer.

The script format is its own package, `@lenzon/explainer-format`. Lenzon's
pipeline is one thing that writes scripts. You can write one by hand, or
build a tool that does.

## Install

```bash
npm i @lenzon/player @lenzon/explainer-format react react-dom
```

## Play a script

```tsx
import { Presentation, ScriptPlayer, WebSpeechVoicePlayer } from '@lenzon/player';
import type { PresentationScript } from '@lenzon/explainer-format';
import '@lenzon/player/styles.css';

const script: PresentationScript = {
  meta: { title: 'Hello', repoUrl: '', generatedAt: '2026-11-08', persona: 'friendly', estimatedDuration: 6 },
  defaults: {
    palette: { primary: '#3b82f6', secondary: '#a855f7', accent: '#f59e0b', background: '#0f172a', text: '#f8fafc', code: '#94a3b8' },
    transition: { type: 'fade', durationMs: 400 },
    voice: { provider: 'stub', voiceId: 'browser', speed: 1 },
  },
  scenes: [{
    id: 'hello', section: 'plainEnglish', holdSeconds: 6,
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

## What is in the package

| Import | What it is |
| --- | --- |
| `@lenzon/player` | `Presentation`, `ScriptPlayer`, the voice players, `Presenter` and the template registry. |
| `@lenzon/player/styles.css` | The player's stylesheet. Import it once. |
| `@lenzon/player/templates` | The built-in templates. Importing the root registers them already. |
| `@lenzon/player/templates/registry` | `registerTemplate`, for adding your own. |
| `@lenzon/player/capture` | Deterministic frame stepping, for recording a script to video. |
| `@lenzon/player/samples` | Three sample scripts, as plain data. Safe to import on a server. |

Each template documents its content slots in a comment at the top of its
source file under `src/templates/`.

## Where this comes from

This branch is mirrored from Lenzon's private monorepo on each release.
Issues and pull requests are welcome here. A change merged here is ported
back by hand before the next release, so expect a short delay.

Licensed under Apache-2.0.

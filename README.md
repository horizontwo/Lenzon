# @lenzon/explainer-format

The `PresentationScript` format. It is what an explainer producer emits and
a player plays.

This package is types only. It has no runtime code and no dependencies.

## Install

```bash
npm i @lenzon/explainer-format
```

## The shape

A script has three parts.

- `meta`: the title, where it came from, and an estimated length in seconds.
- `defaults`: the palette, the scene transition and the voice.
- `scenes`: the explainer, in order.

Each scene names a template and gives it content. It also carries the
narration and how long to hold.

```ts
import type { PresentationScript } from '@lenzon/explainer-format';

const scene: PresentationScript['scenes'][number] = {
  id: 'intro',
  section: 'plainEnglish',
  narration: 'What this change does, in one sentence.',
  holdSeconds: 5,
  primitive: { template: 'title-bullets', content: { title: 'Intro', bullets: ['One', 'Two'] } },
};
```

`primitive.content` is untyped on purpose. The player checks it against the
template it names. Each template in `@lenzon/player` documents its own
slots.

## Who uses it

`@lenzon/player` plays scripts in this format. Lenzon's pipeline is one
producer of them. Any tool can be another.

## Where this comes from

This branch is mirrored from Lenzon's private monorepo on each release.
Issues and pull requests are welcome here. A change merged here is ported
back by hand before the next release, so expect a short delay.

Licensed under Apache-2.0.

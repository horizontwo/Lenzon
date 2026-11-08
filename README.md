# Lenzon

Explainers are short, animated, narrated walkthroughs of code: a pull
request, a plan, a spec, a repo. This repo holds the open parts. There is a
format any tool can write, and a player that plays it.

## Install

```bash
npm i @lenzon/player @lenzon/explainer-format react react-dom
```

The player's README has an example that plays a hand-written script.

## What is here

Each package lives at the root of its own branch.

| Branch | Package | What it is |
| --- | --- | --- |
| [`player`](https://github.com/horizontwo/Lenzon/tree/player) | `@lenzon/player` | A React runtime that plays an explainer script. |
| [`explainer-format`](https://github.com/horizontwo/Lenzon/tree/explainer-format) | `@lenzon/explainer-format` | The `PresentationScript` format. Types only. |

This `main` branch is the landing page. It carries no code.

## How releases work

The packages are developed in Lenzon's private monorepo. Each release is
published to npm from there. The same release then lands here as one
commit on each branch, tagged `player-v<version>` and
`explainer-format-v<version>`.

Issues and pull requests are welcome, against the `player` or
`explainer-format` branch. A merged change is ported back to the monorepo
by hand before the next release, so expect a short delay.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.

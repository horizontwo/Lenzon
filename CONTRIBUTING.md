# Contributing to Lenzon

Thanks for your interest in contributing. This repository is the public,
open-source surface of Lenzon. Contributions are reviewed here and may be
incorporated into the broader project.

## License of contributions

Lenzon is released under the [Apache License, Version 2.0](./LICENSE). By
contributing, you agree that your contributions are licensed under the same
terms.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/)
(DCO) to certify that you have the right to submit your contribution under the
project's license. The DCO is a lightweight statement — it does not assign
copyright; you retain ownership of your work.

To certify your contribution, add a `Signed-off-by` line to every commit:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git can add this for you automatically:

```
git commit -s -m "Your commit message"
```

The name and email must match your real identity (no anonymous or pseudonymous
contributions). By signing off, you certify the following:

> **Developer Certificate of Origin 1.1**
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the
>     right to submit it under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my
>     knowledge, is covered under an appropriate open source license and I have
>     the right under that license to submit that work with modifications,
>     whether created in whole or in part by me, under the same open source
>     license (unless I am permitted to submit under a different license), as
>     indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who
>     certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public
>     and that a record of the contribution (including all personal information
>     I submit with it, including my sign-off) is maintained indefinitely and
>     may be redistributed consistent with this project or the open source
>     license(s) involved.

## Local development

Get the player running locally in two commands:

```
npm install
npm run dev          # template sandbox at http://localhost:5173
```

See [docs/quickstart.md](./docs/quickstart.md) for the full tour. If you want to
build a template, start with
[docs/creating-a-template.md](./docs/creating-a-template.md) — it walks you from
zero to a registered, rendering template using
[`apps/player/src/templates/hello-template.ts`](./apps/player/src/templates/hello-template.ts)
as the reference.

## How to contribute

1. Fork the repository and create a branch for your change.
2. Make your change, with clear commit messages and a DCO `Signed-off-by` line
   on each commit.
3. Open a pull request describing what you changed and why.
4. A maintainer will review. We may ask for revisions before merging.

## Questions

Open an issue if you have a question, a bug report, or a proposal you'd like to
discuss before writing code.

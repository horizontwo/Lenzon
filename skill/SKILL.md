---
name: lenzon-explainer
description: Write an animated, narrated explainer as a script file that @lenzon/player plays in the browser. Use when someone asks for an explainer, a pitch, a walkthrough or an animated presentation of an idea, a business plan, a process, a concept or a codebase, or asks for a script for @lenzon/player.
---

# Writing an explainer for @lenzon/player

An explainer is one JSON file, a `PresentationScript`. It is a run of
animated scenes, each with a line of narration. `@lenzon/player` plays it.

This skill is the judgment. The facts are in two files beside it.

- `WRITING-SCRIPTS.md`: the script's shape, the timing rules, beats, and a
  full worked example. Read all of it before writing.
- `TEMPLATES.md`: every template, its content slots, what a beat can point
  at in it, and a working example of each. Read the index, then the full
  entry for each template you use.

Do not write a script from memory of these files. Slot names differ
between templates, and a wrong one fails without an error.

## The steps

1. **Settle the subject.** Know what the viewer should understand at the
   end, in one sentence. If the request names the idea, do not stop to
   ask questions. Make sensible choices and say what you chose when you
   hand the file over. Ask only when you cannot tell what the subject is.
2. **Read both guides.**
3. **Outline before writing JSON.** List the scenes: an id, the one idea
   it carries, and the template that draws that idea's shape. Use the
   "pick a template by the shape of the idea" table in the guide. Check
   the length against the guide's scene counts.
4. **Write the narration for every scene,** in one persona.
5. **Compute the timing, do not guess it.** Count the words. Holds and
   beat times follow from the counts, by the guide's rules. A few lines of
   code that count words are more reliable than estimating by eye.
6. **Write the file.** Copy each template's slot names from its entry in
   `TEMPLATES.md`.
7. **Check it:** `npx @lenzon/player check <file>`. Fix every error and
   every warning, then check again. Repeat until it says ok with no
   warnings.
8. **Hand it over** with the command that plays it:
   `npx @lenzon/player play <file>`. Do not run `play` yourself. It
   serves until stopped, and the page is for the person, not for you.

## Judgment

**Use the templates for any idea unless the subject is software.**
`TEMPLATES.md` lists them first. A code template in a business pitch
shows pull request numbers and file paths that mean nothing there.

**One idea per scene.** If a scene needs two headlines, it is two scenes.

**The screen carries the shape, the voice carries the detail.** Headlines
of 3 to 5 words. Bullets of a few words. Never put a narration sentence on
screen. Where a slot in `TEMPLATES.md` gives a length or count limit, keep
to it. Those limits come from text that collides or gets cut off.

**Vary the templates.** The same template three scenes running reads like
a slide deck.

**Every beat lands on a word.** Point at a step when the voice names that
step. A beat with no word to land on is noise. Two to four per scene.

**Do not invent facts about the real world.** No made-up statistics,
prices or quotes, and no real companies' numbers, unless the person gave
them to you. Say "most tools get used a few times a year", not "a drill
is used 13 minutes in its life". If the explainer needs a number you do
not have, use a round, plainly labelled assumption, and tell the person
which numbers to check.

**Narration is for the ear.** Read each line as if spoken. No markdown,
no brackets, no symbols a voice would read aloud.

**Leave out what a code explainer needs.** `meta.repoUrl` and each
scene's `section` are optional. Only include them for an explainer about
a code repository.

## If something is unclear

The guides win over this file, since they ship with the player version
that will play the script. If `check` and the guides disagree, trust
`check`. It reads the template list from the installed player.

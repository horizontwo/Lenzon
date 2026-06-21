import type { Template, TemplateHandle } from './registry';
import { cssVar } from './palette';

/**
 * hello-template — the annotated reference template.
 *
 * This file exists to teach. It is the smallest template that still uses
 * every part of the contract, so a new contributor can read it top to
 * bottom and then copy it as the starting point for their own template.
 * See docs/creating-a-template.md for the prose walkthrough.
 *
 * It demonstrates the two-layer model deliberately:
 *   - the title renders on the CANVAS layer (via presenter.showTextBox),
 *     because the entrance-effect pipeline (slam, grow, glow, …) is
 *     canvas-only.
 *   - the body renders on the DOM layer (a .cs-plate glass surface
 *     appended to presenter.domRoot), because native text layout and the
 *     design-system primitives live in DOM.
 *
 * Patterns here (font invalidation, RAF layout, timer cleanup, the
 * accent-budget-of-1 emphasize) are lifted from title-bullets.ts, just
 * trimmed to the minimum.
 *
 * Slot schema (what the producer is told this template accepts):
 *   title:  string    — the headline, rendered on canvas
 *   lines:  string[]  — body lines, rendered in a DOM glass plate
 */

// 1. A typed view of the content this template expects. The registry types
//    content loosely as Record<string, unknown> so every template can define
//    its own shape; cast to your own interface inside render().
interface HelloContent {
  title: string;
  lines?: string[];
}

export const helloTemplate: Template = {
  // 2. A unique, snake-case id. This is how scripts and the producer refer
  //    to your template, and the key it registers under.
  id: 'hello-template',

  // 3. version is required (a template without one fails type-check).
  //    Scripts snapshot the id→version map at creation time for provenance;
  //    bump this whenever the template's behavior changes in a way worth
  //    tracking. See docs/templates-and-the-producer.md.
  version: '1.0.0',

  // 4. A one-line, model-facing description. The producer reads this (plus
  //    `slots`) to decide when to pick your template.
  description: 'Tutorial reference template: a canvas title over a DOM glass plate with a few body lines.',

  // 5. The machine-readable slot schema. Not validated at runtime — it is
  //    the contract the producer uses to know what content shape to emit.
  slots: {
    title: 'string — the headline, rendered on the canvas layer',
    lines: 'string[] — body lines, rendered in a DOM glass plate',
  },

  // 6. A demo payload. ANY template with a `demo` shows up automatically in
  //    the sandbox dropdown (apps/player/src/App.tsx) — this is how you see
  //    your template locally with `npm run dev`. `emphasizeAfter` schedules
  //    one emphasize() call after mount so the dropdown exercises emphasis.
  demo: {
    label: 'Hello Template (tutorial)',
    content: {
      title: 'Hello, template',
      lines: [
        'Edit apps/player/src/templates/hello-template.ts.',
        'Save — Vite hot-reloads the sandbox.',
        'Pick this from the dropdown and hit run.',
      ],
    },
    emphasizeAfter: { target: '1', delayMs: 1600 },
  },

  // 7. render() mounts the scene and returns a TemplateHandle. The presenter
  //    is the service facade (see service/presenter.ts) that owns the canvas
  //    Stage and the DOM root.
  render(presenter, contentIn) {
    const content = contentIn as unknown as HelloContent;
    const { title, lines = [] } = content;

    // Pull colors/fonts from the design tokens (defined in index.css :root).
    // Never hardcode hex — read tokens via cssVar() so the whole player
    // restyles from one place. The second arg is a fallback for when the
    // template renders outside a styled document (e.g. tests).
    const displayFamily = cssVar('--cs-font-display', "'Times New Roman', serif");
    const titleColor = cssVar('--cs-ink-1', '#f2efe8');

    // --- Canvas layer: the title -------------------------------------------
    // showTextBox returns a handle; its `box` is the live TextBox and
    // `dismiss()` removes it from the canvas Stage. `fx` runs an entrance
    // effect from the canvas fx pipeline (try 'grow', 'glow', 'shake').
    const titleHandle = presenter.showTextBox({
      text: title,
      style: {
        font: displayFamily,
        size: 104,
        weight: 'italic 400',
        color: titleColor,
        shadow: { color: 'rgba(0,0,0,.5)', blur: 16, offsetX: 0, offsetY: 4 },
        padding: 28,
      },
      y: 150,
      fx: [{ name: 'slam', duration: 600 }],
    });

    // --- DOM layer: the body plate -----------------------------------------
    // .cs-plate is the design-system glass surface; .cs-numlist gives the
    // numbered-row treatment, and the global .is-emph rule colors a row with
    // --cs-accent-warm when emphasized. We append into presenter.domRoot.
    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default';
    plate.style.position = 'absolute';
    plate.style.left = '50%';
    plate.style.transform = 'translateX(-50%)';
    plate.style.maxWidth = '60%';

    const list = document.createElement('ol');
    list.className = 'cs-numlist';

    const items: HTMLLIElement[] = [];
    lines.forEach((text, i) => {
      const li = document.createElement('li');
      li.className = 'cs-numlist-item';
      // Start hidden; we reveal with a staggered entrance below. (We set the
      // transition inline here so the template needs no bespoke CSS rule.)
      li.style.opacity = '0';
      li.style.transform = 'translateY(8px)';
      li.style.transition = 'opacity .4s ease, transform .4s ease';

      const num = document.createElement('span');
      num.className = 'cs-numlist-n';
      num.textContent = String(i + 1).padStart(2, '0');

      const body = document.createElement('span');
      body.className = 'cs-numlist-t';
      body.textContent = text;

      li.append(num, body);
      list.appendChild(li);
      items.push(li);
    });

    plate.appendChild(list);
    presenter.domRoot.appendChild(plate);

    // --- Lifecycle bookkeeping ---------------------------------------------
    // Track every timer/RAF so dismiss() can cancel them. A template that
    // leaks timers will keep mutating the DOM after the scene is gone.
    const timers: number[] = [];
    let layoutRaf = 0;
    let dismissed = false;
    let emphTimer: number | null = null;
    let emphRow: HTMLLIElement | null = null;

    // Measure after attach (offsetHeight forces layout), then vertically
    // center the title + plate composition. requestAnimationFrame defers to
    // after the browser has laid the plate out.
    layoutRaf = requestAnimationFrame(() => {
      if (dismissed) return;
      const stageH = presenter.stage.height;
      const plateH = plate.offsetHeight;
      const TITLE_SIZE = 104;
      const GAP = 56;
      const compH = TITLE_SIZE + GAP + plateH;
      const top = Math.max(0, (stageH - compH) / 2);
      titleHandle.box.y = top + TITLE_SIZE / 2;
      plate.style.top = `${top + TITLE_SIZE + GAP}px`;

      // Staggered entrance reveal.
      items.forEach((li, i) => {
        timers.push(
          window.setTimeout(() => {
            li.style.opacity = '1';
            li.style.transform = 'translateY(0)';
          }, 200 + i * 120),
        );
      });
    });

    // 8. The TemplateHandle. dismiss() must remove EVERYTHING this template
    //    added (canvas box, DOM nodes) and cancel every pending timer/RAF —
    //    "dismiss is total". emphasize() honors the accent budget of 1:
    //    only one row is emphasized at a time.
    const handle: TemplateHandle = {
      dismiss: () => {
        dismissed = true;
        if (layoutRaf) cancelAnimationFrame(layoutRaf);
        titleHandle.dismiss();
        timers.forEach((t) => window.clearTimeout(t));
        if (emphTimer != null) window.clearTimeout(emphTimer);
        plate.remove();
      },
      emphasize: (target) => {
        // target may be a row index ("1") or the exact line text.
        const i = Number(target);
        const match = Number.isFinite(i)
          ? items[i]
          : items.find((li) => li.querySelector('.cs-numlist-t')?.textContent === target);
        if (!match) return;

        // Accent budget = 1: clear the previously emphasized row first.
        if (emphRow && emphRow !== match) emphRow.classList.remove('is-emph');
        if (emphTimer != null) window.clearTimeout(emphTimer);

        match.classList.add('is-emph');
        emphRow = match;
        emphTimer = window.setTimeout(() => {
          match.classList.remove('is-emph');
          if (emphRow === match) emphRow = null;
          emphTimer = null;
        }, 1400);
      },
    };
    return handle;
  },
};

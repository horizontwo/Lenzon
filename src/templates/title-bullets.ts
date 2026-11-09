import type { Template, TemplateHandle } from './registry';
import type { EffectSpec } from '../core/types';
import { cssVar } from './palette';

/**
 * title-bullets — a large title on the canvas layer with a numbered body
 * rendered in the DOM layer. Visual language follows lenzon/ui v0.1:
 * the body sits inside a .cs-plate glass surface, the title renders in
 * Instrument Serif italic, and the list uses .cs-numlist with at most
 * one warm emph row at a time (the beat-driven emphasize target).
 *
 * The title stays on the canvas layer because the fx pipeline (slam,
 * grow, …) is canvas-only; the design system's React reference renders
 * the title in DOM, but we preserve the canvas path to keep the
 * entrance-effect contract intact.
 *
 * Slot schema:
 *   title:    string
 *   bullets:  string[]
 *   titleFx:  EffectSpec[]  (optional, defaults to [{ name: "slam" }])
 */

interface TitleBulletsContent {
  title: string;
  bullets?: string[];
  titleFx?: EffectSpec[];
}

export const titleBulletsTemplate: Template = {
  id: 'title-bullets',
  version: '1.0.0',
  description: 'Canvas title in Instrument Serif italic with a staggered DOM numbered list in a glass plate below.',
  slots: {
    title: 'string — the headline, rendered on canvas',
    bullets: 'string[] — list items, rendered in DOM',
    titleFx: 'EffectSpec[] — optional entrance effects for the title',
  },
  demo: {
    label: 'Title + Bullets',
    content: {
      title: 'Why blitting matters',
      bullets: [
        'Rasterize once into an offscreen canvas.',
        'drawImage the cached bitmap every frame.',
        'Animated transforms are free — no re-rasterization.',
        'The cache only rebuilds when text or style changes.',
      ],
      titleFx: [{ name: 'slam', duration: 600 }],
    },
    emphasizeAfter: { target: '1', delayMs: 1800 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as TitleBulletsContent;
    const { title, bullets = [], titleFx = [{ name: 'slam', duration: 600 }] } = content;

    const displayFamily = cssVar('--cs-font-display', "'Times New Roman', serif");
    const titleColor = cssVar('--cs-ink-1', '#f2efe8');

    const TITLE_SIZE = 116;
    const TITLE_PLATE_GAP = 68;

    const titleHandle = presenter.showTextBox({
      text: title,
      style: {
        font: displayFamily,
        size: TITLE_SIZE,
        weight: 'italic 400',
        color: titleColor,
        shadow: { color: 'rgba(0,0,0,.5)', blur: 16, offsetX: 0, offsetY: 4 },
        padding: 32,
      },
      y: 140,
      fx: titleFx,
    });

    // If Instrument Serif hasn't arrived yet (first paint of a fresh tab),
    // the cache rasterizes against the fallback serif. When the real face
    // loads, invalidate the cache so the next frame redraws in Instrument.
    let fontsDismissed = false;
    if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts
        .load(`italic 400 ${TITLE_SIZE}px ${displayFamily}`)
        .then(() => {
          if (!fontsDismissed) titleHandle.box.setStyle({});
        })
        .catch(() => { /* swallow — fallback face is acceptable */ });
    }

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-title-bullets-plate';

    const list = document.createElement('ol');
    list.className = 'cs-numlist sb-bullets';
    const items: HTMLLIElement[] = [];

    bullets.forEach((text, i) => {
      const li = document.createElement('li');
      li.className = 'cs-numlist-item';

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

    const timers: number[] = [];
    let layoutRaf = 0;
    let dismissed = false;

    // Measure the plate once it is attached, then vertically center the
    // title + plate composition in the stage. The canvas title's y is the
    // baseline of its text; shifting it by TITLE_SIZE/2 from the top of
    // the composition puts the center of the glyph-body on that line.
    layoutRaf = requestAnimationFrame(() => {
      if (dismissed) return;
      const plateH = plate.offsetHeight;
      const stageH = presenter.stage.height;
      const compH = TITLE_SIZE + TITLE_PLATE_GAP + plateH;
      const top = Math.max(0, (stageH - compH) / 2);
      titleHandle.box.y = top + TITLE_SIZE / 2;
      plate.style.top = `${top + TITLE_SIZE + TITLE_PLATE_GAP}px`;

      items.forEach((li, i) => {
        timers.push(
          window.setTimeout(() => li.classList.add('sb-visible'), 250 + i * 120),
        );
      });
    });

    const emphTimers = new Map<HTMLLIElement, number>();

    const handle: TemplateHandle = {
      dismiss: () => {
        dismissed = true;
        fontsDismissed = true;
        if (layoutRaf) cancelAnimationFrame(layoutRaf);
        titleHandle.dismiss();
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        plate.remove();
      },
      emphasize: (target) => {
        const i = Number(target);
        const match = Number.isFinite(i)
          ? items[i]
          : items.find((li) => li.querySelector('.cs-numlist-t')?.textContent === target);
        if (!match) return;

        // Accent budget = 1: clear any other rows currently emphasized.
        items.forEach((other) => {
          if (other !== match && other.classList.contains('is-emph')) {
            other.classList.remove('is-emph', 'sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        match.classList.add('is-emph', 'sb-emphasize');
        const existing = emphTimers.get(match);
        if (existing != null) window.clearTimeout(existing);
        emphTimers.set(
          match,
          window.setTimeout(() => {
            match.classList.remove('is-emph', 'sb-emphasize');
            emphTimers.delete(match);
          }, 1400),
        );
      },
    };
    return handle;
  },
};

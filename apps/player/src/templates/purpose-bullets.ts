import type { Template, TemplateHandle } from './registry';
import type { EffectSpec } from '../core/types';
import { cssVar } from './palette';

/**
 * purpose-bullets — a purpose headline on the canvas layer with typed
 * supporting evidence rendered in the DOM layer. Visual language follows
 * lenzon/ui v0.1: the body sits inside a .cs-plate glass surface, the
 * headline renders in Instrument Serif italic, each support row uses the
 * .cs-numlist shape with a .cs-badge tone for its type.
 *
 * Type → badge tone mapping is chosen with the accent-budget rule in mind:
 *   feature  → cool  (neutral-informative)
 *   detail   → ink   (quiet)
 *   concern  → warn  (alarm)
 *   strength → ok    (positive)
 * None of them use `warm`; warm is reserved for the beat-driven
 * emphasize pulse so there is only ever one warm thing visible.
 *
 * Slot schema:
 *   purpose:   string       — the main purpose statement
 *   fileRef:   string       — optional file path badge (e.g. "src/services/auth.ts")
 *   supports:  SupportItem[] — evidence/detail items
 *   purposeFx: EffectSpec[] — optional entrance effects (defaults to grow)
 */

interface SupportItem {
  point: string;
  type: 'feature' | 'detail' | 'concern' | 'strength';
}

interface PurposeBulletsContent {
  purpose: string;
  fileRef?: string;
  supports?: SupportItem[];
  purposeFx?: EffectSpec[];
}

const TYPE_LABEL: Record<SupportItem['type'], string> = {
  feature: 'FEATURE',
  detail: 'DETAIL',
  concern: 'CONCERN',
  strength: 'STRENGTH',
};

const TYPE_TONE: Record<SupportItem['type'], 'cool' | 'ink' | 'warn' | 'ok'> = {
  feature: 'cool',
  detail: 'ink',
  concern: 'warn',
  strength: 'ok',
};

export const purposeBulletsTemplate: Template = {
  id: 'purpose-bullets',
  version: '1.0.0',
  description:
    'Purpose statement on canvas with typed supporting evidence in a glass plate. File reference badge optional.',
  slots: {
    purpose: 'string — the main purpose headline, rendered on canvas',
    fileRef: 'string — optional file path shown as a badge',
    supports: 'SupportItem[] — { point: string, type: feature|detail|concern|strength }',
    purposeFx: 'EffectSpec[] — optional entrance effects for the purpose text',
  },
  demo: {
    label: 'Purpose Bullets',
    content: {
      purpose: 'Handles user authentication and sessions',
      fileRef: 'src/services/auth.ts',
      supports: [
        { point: 'OAuth2 flow with Google and GitHub providers', type: 'feature' },
        { point: 'JWT tokens with 24-hour expiry', type: 'detail' },
        { point: 'No refresh token rotation — sessions die on expiry', type: 'concern' },
        { point: 'Rate limiting on login attempts (good practice)', type: 'strength' },
      ],
    },
    emphasizeAfter: { target: '2', delayMs: 2200 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as PurposeBulletsContent;
    const {
      purpose,
      fileRef,
      supports = [],
      purposeFx = [{ name: 'grow', duration: 700, from: 0.6, to: 1 }],
    } = content;

    const displayFamily = cssVar('--cs-font-display', "'Times New Roman', serif");
    const titleColor = cssVar('--cs-ink-1', '#f2efe8');

    const PURPOSE_SIZE = 96;
    const PURPOSE_PLATE_GAP = 64;

    const purposeHandle = presenter.showTextBox({
      text: purpose,
      style: {
        font: displayFamily,
        size: PURPOSE_SIZE,
        weight: 'italic 400',
        color: titleColor,
        shadow: { color: 'rgba(0,0,0,.45)', blur: 14, offsetX: 0, offsetY: 3 },
        padding: 28,
      },
      y: 120,
      maxWidth: Math.min(1280, presenter.stage.width * 0.85),
      fx: purposeFx,
    });

    // Font-ready cache invalidation — first paint against fallback serif,
    // re-raster once Instrument Serif arrives. Guarded so a late resolve
    // after dismiss() does not touch a disposed handle.
    let fontsDismissed = false;
    if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts
        .load(`italic 400 ${PURPOSE_SIZE}px ${displayFamily}`)
        .then(() => {
          if (!fontsDismissed) purposeHandle.box.setStyle({});
        })
        .catch(() => { /* fallback face is acceptable */ });
    }

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-purpose-plate';

    if (fileRef) {
      const badge = document.createElement('span');
      badge.className = 'cs-badge cs-badge--ink sb-purpose-fileref';
      badge.textContent = fileRef;
      plate.appendChild(badge);
    }

    const list = document.createElement('ol');
    list.className = 'cs-numlist sb-purpose-list';
    const items: HTMLLIElement[] = [];

    supports.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'cs-numlist-item';

      const num = document.createElement('span');
      num.className = 'cs-numlist-n';
      num.textContent = String(i + 1).padStart(2, '0');

      const body = document.createElement('span');
      body.className = 'cs-numlist-t sb-purpose-row';

      const tone = TYPE_TONE[s.type] ?? 'ink';
      const badge = document.createElement('span');
      badge.className = `cs-badge cs-badge--${tone} sb-purpose-typebadge`;
      badge.textContent = TYPE_LABEL[s.type] ?? 'DETAIL';

      const text = document.createElement('span');
      text.className = 'sb-purpose-text';
      text.textContent = s.point;

      body.append(badge, text);
      li.append(num, body);
      list.appendChild(li);
      items.push(li);
    });

    plate.appendChild(list);
    presenter.domRoot.appendChild(plate);

    const timers: number[] = [];
    let layoutRaf = 0;
    let dismissed = false;

    // Measure the plate once attached, then vertically center the title +
    // plate composition in the stage. See title-bullets for the same
    // pattern; the canvas y is the baseline of the glyph, so we offset by
    // PURPOSE_SIZE/2 from the top of the composition.
    layoutRaf = requestAnimationFrame(() => {
      if (dismissed) return;
      const plateH = plate.offsetHeight;
      const stageH = presenter.stage.height;
      const compH = PURPOSE_SIZE + PURPOSE_PLATE_GAP + plateH;
      const top = Math.max(0, (stageH - compH) / 2);
      purposeHandle.box.y = top + PURPOSE_SIZE / 2;
      plate.style.top = `${top + PURPOSE_SIZE + PURPOSE_PLATE_GAP}px`;

      items.forEach((li, i) => {
        timers.push(
          window.setTimeout(() => li.classList.add('sb-visible'), 300 + i * 140),
        );
      });
    });

    const emphTimers = new Map<HTMLLIElement, number>();

    const handle: TemplateHandle = {
      dismiss: () => {
        dismissed = true;
        fontsDismissed = true;
        if (layoutRaf) cancelAnimationFrame(layoutRaf);
        purposeHandle.dismiss();
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        plate.remove();
      },
      emphasize: (target) => {
        const i = Number(target);
        const match = Number.isFinite(i)
          ? items[i]
          : items.find((li) => li.textContent?.includes(target));
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

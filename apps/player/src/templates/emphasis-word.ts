import type { Template, TemplateHandle } from './registry';
import type { EffectSpec } from '../core/types';
import type { TextBoxHandle } from '../service/presenter';
import { cssVar } from './palette';

/**
 * emphasis-word — a single word or short phrase rendered large on the
 * canvas with dramatic entrance effects. The "mic drop" moment. Optionally
 * followed by a mono eyebrow subtitle that fades in below in the DOM
 * layer.
 *
 * lenzon/ui v0.1 styling: the word renders in Instrument Serif italic
 * (canvas) so it reads as a print headline rather than a heavy sans; the
 * subtitle uses the .cs-eyebrow primitive for uppercase-mono supporting
 * copy. Per the migration spec, we do NOT wrap the word in a .cs-plate —
 * this template is meant to land on bare room, and the slam/shake fx
 * would clip against the plate's overflow-hidden surface anyway.
 *
 * Accent budget = 1: the glow defaults to --cs-accent-warm (the one warm
 * element per view). Callers can still override via `style.color`.
 *
 * Slot schema:
 *   word:     string         — the big word/phrase
 *   subtitle: string         — optional supporting text (DOM, eyebrow)
 *   fx:       EffectSpec[]   — entrance effects (defaults to slam + glow)
 *   style:    { size, weight, color } — optional overrides
 */

interface EmphasisWordContent {
  word: string;
  subtitle?: string;
  fx?: EffectSpec[];
  style?: {
    size?: number;
    weight?: string;
    color?: string;
  };
}

export const emphasisWordTemplate: Template = {
  id: 'emphasis-word',
  version: '1.0.0',
  description:
    'Large dramatic word on canvas in Instrument Serif italic with optional mono eyebrow subtitle. Built for verdict statements and key reveals.',
  slots: {
    word: 'string — the headline word or short phrase',
    subtitle: 'string — optional supporting text that fades in below',
    fx: 'EffectSpec[] — entrance effects (defaults to slam + warm glow)',
    style: '{ size?: number, weight?: string, color?: string } — optional overrides',
  },
  demo: {
    label: 'Emphasis Word',
    content: {
      word: 'FRAGILE',
      subtitle: 'This codebase has no tests and 3 god functions over 500 lines each.',
    },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as EmphasisWordContent;
    const { word, subtitle, style: styleOverride = {} } = content;

    const displayFamily = cssVar('--cs-font-display', "'Times New Roman', serif");
    const warm = cssVar('--cs-accent-warm', '#e8a766');
    const ink1 = cssVar('--cs-ink-1', '#f2efe8');

    const color = styleOverride.color ?? ink1;
    // Producer-supplied `size` is treated as a target, not a contract: short
    // words at 200 fit fine, but a long phrase like "PRODUCTION READY" at 200
    // bleeds off the stage. We fit-to-safe-area below.
    const targetSize = styleOverride.size ?? 200;
    const weight = styleOverride.weight ?? 'italic 400';

    // 6% safe-area inset per side (§3.1 of TEMPLATE-SPEC). The padding inside
    // TextBox eats some of the budget — subtract it so the glyph run, not the
    // box, is what we fit.
    const PADDING = 40;
    const SAFE_FRACTION = 0.88; // 1 - 2 * 0.06
    const MIN_SIZE = 64;        // anything smaller stops feeling like a "mic drop"
    const MAX_SIZE = Math.max(targetSize, 280);
    const widthBudget = Math.max(1, presenter.stage.width * SAFE_FRACTION - PADDING * 2);

    const size = fitSize(word, displayFamily, weight, targetSize, widthBudget, MIN_SIZE, MAX_SIZE);

    const fx: EffectSpec[] = content.fx ?? [
      { name: 'slam', duration: 520 },
      { name: 'glow', duration: 1400, strength: 48, color: warm },
    ];

    // The word itself — big, canvas-rendered, in Instrument Serif italic.
    const wordHandle: TextBoxHandle = presenter.showTextBox({
      text: word,
      style: {
        font: displayFamily,
        size,
        weight,
        color,
        shadow: { color: 'rgba(0,0,0,.6)', blur: 20, offsetX: 0, offsetY: 4 },
        padding: PADDING,
      },
      // Slightly above center so the subtitle has room below.
      y: subtitle ? presenter.stage.height * 0.42 : undefined,
      fx,
    });

    // Font-ready cache invalidation. Instrument Serif may not be ready on
    // a fresh tab; force a re-measure + re-raster once the real face loads
    // so the cache isn't stuck with a fallback serif AND so the fit-to-safe-
    // area math uses the real glyph metrics (italic Instrument Serif is
    // noticeably narrower than the fallback Times New Roman).
    let fontsDismissed = false;
    if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts
        .load(`${weight} ${targetSize}px ${displayFamily}`)
        .then(() => {
          if (fontsDismissed) return;
          const refitted = fitSize(word, displayFamily, weight, targetSize, widthBudget, MIN_SIZE, MAX_SIZE);
          wordHandle.box.setStyle(refitted === size ? {} : { size: refitted });
        })
        .catch(() => { /* fallback face is acceptable */ });
    }

    // Subtitle in the DOM layer — mono eyebrow, fades in after the word lands.
    let subtitleEl: HTMLDivElement | null = null;
    let subTimer = 0;
    if (subtitle) {
      subtitleEl = document.createElement('div');
      subtitleEl.className = 'cs-eyebrow cs-eyebrow--dim sb-emphasis-subtitle';
      subtitleEl.textContent = subtitle;
      presenter.domRoot.appendChild(subtitleEl);

      requestAnimationFrame(() => {
        subTimer = window.setTimeout(
          () => subtitleEl?.classList.add('sb-visible'),
          700,
        );
      });
    }

    const handle: TemplateHandle = {
      dismiss: () => {
        fontsDismissed = true;
        if (subTimer) window.clearTimeout(subTimer);
        wordHandle.dismiss();
        subtitleEl?.remove();
      },
      emphasize: (_target) => {
        // Re-trigger a warm glow for re-emphasis. The word is the only
        // element so there is no accent-budget contention to manage.
        wordHandle.applyFx({ name: 'glow', duration: 1000, strength: 56, color: warm });
      },
    };
    return handle;
  },
};

/**
 * Pick the largest font size in [min, max] at which `text` fits within
 * `widthBudget` CSS pixels. Uses a throwaway 2D context for measurement —
 * mirrors TextBox's own measurement so the result is consistent with what
 * gets rasterized.
 *
 * Linear-from-target: measure once at `target`, then scale the size by the
 * ratio (budget / measuredWidth). Glyph widths scale linearly with font
 * size for a fixed face, so a single measurement is sufficient — no binary
 * search needed.
 */
function fitSize(
  text: string,
  font: string,
  weight: string,
  target: number,
  widthBudget: number,
  min: number,
  max: number,
): number {
  if (typeof document === 'undefined') return target;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return target;
  ctx.font = `${weight} ${target}px ${font}`;
  const measured = ctx.measureText(text).width;
  if (measured <= 0) return target;
  const scaled = target * (widthBudget / measured);
  return Math.round(Math.max(min, Math.min(max, scaled)));
}

import type { Renderable } from './Stage';
import type { TextStyle } from './types';

/**
 * TextBox renders a single string to an offscreen canvas (the "cache") once,
 * then blits that cache to the main canvas every frame. This is the classic
 * blit pattern: rasterizing text every frame is expensive, but drawImage of
 * a pre-rendered bitmap is effectively free.
 *
 * Animated properties (scale, rotation, alpha, glow, offset) are applied at
 * draw time via ctx.save/translate/scale — they do NOT invalidate the cache.
 * Only changes to the text or the style (font, color, padding, etc.) cause
 * a rebuild.
 *
 * Effects in fx.ts mutate these animated properties directly via anime.js.
 */

type ResolvedStyle = Required<Omit<TextStyle, 'stroke' | 'shadow'>> & {
  stroke: { color: string; width: number };
  shadow: { color: string; blur: number; offsetX: number; offsetY: number };
};

const DEFAULT_STYLE: ResolvedStyle = {
  font: 'system-ui, -apple-system, sans-serif',
  size: 48,
  weight: 'bold',
  color: '#ffffff',
  stroke: { color: '', width: 0 },
  shadow: { color: '', blur: 0, offsetX: 0, offsetY: 0 },
  padding: 24,
  bgColor: '',
  borderRadius: 12,
};

export class TextBox implements Renderable {
  text: string;
  style: ResolvedStyle;
  maxWidth: number | undefined;

  // Position (center of the box in CSS pixels).
  x = 0;
  y = 0;

  // Animated transform. Effects mutate these directly.
  scale = 1;
  rotation = 0;
  alpha = 1;

  // Animated glow (distinct from the static `style.shadow`).
  glow = 0;
  glowColor = '#ffffff';

  // Animated positional offset, used by shake/slam.
  offsetX = 0;
  offsetY = 0;

  private cache: HTMLCanvasElement | null = null;
  private cacheKey = '';
  private cacheWidth = 0;
  private cacheHeight = 0;

  constructor(text: string, style: TextStyle = {}, maxWidth?: number) {
    this.text = text;
    this.style = resolveStyle(style);
    this.maxWidth = maxWidth;
  }

  /** Update the text or style and invalidate the cache on next render. */
  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.cacheKey = '';
  }

  setStyle(style: TextStyle): void {
    this.style = resolveStyle({ ...this.style, ...style });
    this.cacheKey = '';
  }

  setMaxWidth(maxWidth: number | undefined): void {
    if (maxWidth === this.maxWidth) return;
    this.maxWidth = maxWidth;
    this.cacheKey = '';
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.ensureCache();
    if (!this.cache) return;

    const w = this.cacheWidth;
    const h = this.cacheHeight;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x + this.offsetX, this.y + this.offsetY);
    if (this.rotation !== 0) ctx.rotate(this.rotation);
    if (this.scale !== 1) ctx.scale(this.scale, this.scale);

    if (this.glow > 0) {
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = this.glow;
    }

    ctx.drawImage(this.cache, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  private ensureCache(): void {
    const s = this.style;
    const fontStr = `${s.weight} ${s.size}px ${s.font}`;
    // Key covers everything that affects the rasterized bitmap.
    const key = [
      this.text,
      fontStr,
      s.color,
      s.padding,
      s.bgColor,
      s.borderRadius,
      s.stroke.color,
      s.stroke.width,
      s.shadow.color,
      s.shadow.blur,
      s.shadow.offsetX,
      s.shadow.offsetY,
      this.maxWidth ?? '',
    ].join('|');
    if (key === this.cacheKey && this.cache) return;

    // Measure with a throwaway context.
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = fontStr;
    // Use the font size as a proxy for line height; matches the single-line case.
    const lineHeight = s.size * 1.2;

    // Expand for stroke and static drop shadow so we don't clip.
    const strokePad = s.stroke.width;
    const shadowPad =
      s.shadow.color && s.shadow.blur > 0
        ? s.shadow.blur + Math.max(Math.abs(s.shadow.offsetX), Math.abs(s.shadow.offsetY))
        : 0;
    const extraPad = Math.max(strokePad, shadowPad);

    // Wrap budget for the text itself (excludes padding so the caller's
    // maxWidth refers to the box, not the glyph run).
    const wrapBudget =
      this.maxWidth != null
        ? Math.max(1, this.maxWidth - (s.padding + extraPad) * 2)
        : Infinity;

    const lines = wrapText(this.text, measure, wrapBudget);
    const widest = lines.reduce((m, line) => Math.max(m, measure.measureText(line).width), 0);
    const textBlockHeight = lineHeight * lines.length;

    const w = widest + (s.padding + extraPad) * 2;
    const h = textBlockHeight + (s.padding + extraPad) * 2;

    const dpr = window.devicePixelRatio || 1;
    const cache = document.createElement('canvas');
    cache.width = Math.max(1, Math.ceil(w * dpr));
    cache.height = Math.max(1, Math.ceil(h * dpr));
    const cctx = cache.getContext('2d')!;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background fill (rounded rect).
    if (s.bgColor) {
      cctx.fillStyle = s.bgColor;
      roundRect(cctx, extraPad, extraPad, w - extraPad * 2, h - extraPad * 2, s.borderRadius);
      cctx.fill();
    }

    // Static drop shadow (distinct from the animated glow applied at draw time).
    if (s.shadow.color && s.shadow.blur > 0) {
      cctx.shadowColor = s.shadow.color;
      cctx.shadowBlur = s.shadow.blur;
      cctx.shadowOffsetX = s.shadow.offsetX;
      cctx.shadowOffsetY = s.shadow.offsetY;
    }

    cctx.font = fontStr;
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';

    // Center the line block vertically inside the cache. Each line sits at
    // its row center: top-of-block + (i + 0.5) * lineHeight.
    const blockTop = (h - textBlockHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      const ly = blockTop + (i + 0.5) * lineHeight;
      if (s.stroke.color && s.stroke.width > 0) {
        cctx.strokeStyle = s.stroke.color;
        cctx.lineWidth = s.stroke.width;
        cctx.lineJoin = 'round';
        cctx.strokeText(lines[i], w / 2, ly);
      }
      cctx.fillStyle = s.color;
      cctx.fillText(lines[i], w / 2, ly);
    }

    this.cache = cache;
    this.cacheKey = key;
    this.cacheWidth = w;
    this.cacheHeight = h;
  }
}

/**
 * Greedy word-wrap: split on whitespace, accumulate words until adding the
 * next would exceed maxWidth, then start a new line. A single word longer
 * than maxWidth gets its own line and overflows rather than character-breaking
 * — fine for headlines, where character-breaking reads worse than overflow.
 */
function wrapText(
  text: string,
  measure: CanvasRenderingContext2D,
  maxWidth: number,
): string[] {
  if (!isFinite(maxWidth)) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (measure.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function resolveStyle(style: TextStyle): ResolvedStyle {
  return {
    ...DEFAULT_STYLE,
    ...style,
    stroke: { ...DEFAULT_STYLE.stroke, ...(style.stroke ?? {}) },
    shadow: { ...DEFAULT_STYLE.shadow, ...(style.shadow ?? {}) },
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

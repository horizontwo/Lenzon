import type { Template, TemplateHandle } from './registry';
import type { EffectSpec } from '../core/types';
import type { TextBoxHandle } from '../service/presenter';
import { cssVar } from './palette';

/**
 * center-stage — a central concept rendered large on the canvas, with related
 * terms orbiting around it. Weight drives relative size and glow intensity.
 * The center appears first, then orbiters stagger in with a grow effect.
 * An optional slow orbit rotation can be enabled.
 *
 * lenzon/ui v0.1 styling: the center renders in Instrument Serif italic
 * (display face via --cs-font-display); orbiters render in the UI face.
 * Orbiter color interpolates between --cs-ink-3 (dim) and --cs-ink-1
 * (bright) by weight. Per TEMPLATE-SPEC §9 #6 the orbit default is 0
 * (static). The demo also defaults to static to match the project-wide
 * preference for less kinetic noise; set `orbitSpeed` on the content to
 * opt in.
 *
 * Accent budget = 1: the emphasize pulse uses --cs-accent-warm on a
 * single orbiter at a time. Prior emphases are cleared before the new
 * one fires.
 *
 * Slot schema:
 *   center:     { text: string, size?: number }
 *   orbiting:   { text: string, weight: number }[]   (weight 0–1)
 *   staggerMs:  number (delay between each orbiter, default 200)
 *   orbitSpeed: number (radians/frame for rotation, default 0 = static)
 *   centerFx:   EffectSpec[] (optional, defaults to slam)
 */

interface OrbiterSpec {
  text: string;
  weight: number;
}

interface CenterStageContent {
  center: { text: string; size?: number };
  orbiting?: OrbiterSpec[];
  staggerMs?: number;
  orbitSpeed?: number;
  centerFx?: EffectSpec[];
}

export const centerStageTemplate: Template = {
  id: 'center-stage',
  version: '1.0.0',
  description:
    'Central concept on canvas in Instrument Serif italic with related terms orbiting around it. Weight drives size and ink brightness.',
  slots: {
    center: '{ text: string, size?: number } — the central concept',
    orbiting: '{ text: string, weight: number }[] — satellite terms (weight 0-1)',
    staggerMs: 'number — delay between orbiter entrances (default 200)',
    orbitSpeed: 'number — radians/frame for slow rotation (default 0 = static)',
    centerFx: 'EffectSpec[] — entrance effects for the center word',
  },
  demo: {
    label: 'Center Stage',
    content: {
      center: { text: 'Presenter', size: 144 },
      orbiting: [
        { text: 'Stage', weight: 0.9 },
        { text: 'TextBox', weight: 0.8 },
        { text: 'fx registry', weight: 0.7 },
        { text: 'Templates', weight: 0.85 },
        { text: 'DOM Layer', weight: 0.6 },
        { text: 'Stage3D', weight: 0.3 },
      ],
      staggerMs: 200,
    },
    emphasizeAfter: { target: 'Templates', delayMs: 3000 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as CenterStageContent;
    const {
      center,
      orbiting = [],
      staggerMs = 200,
      orbitSpeed = 0,
      centerFx = [{ name: 'slam', duration: 600 }],
    } = content;

    const displayFamily = cssVar('--cs-font-display', "'Times New Roman', serif");
    const uiFamily = cssVar('--cs-font-ui', 'system-ui, -apple-system, sans-serif');
    const ink1 = cssVar('--cs-ink-1', '#f2efe8');
    const ink3 = cssVar('--cs-ink-3', '#8a897f');
    const warm = cssVar('--cs-accent-warm', '#e8a766');

    const stageW = presenter.stage.width;
    const stageH = presenter.stage.height;
    const cx = stageW / 2;
    const cy = stageH / 2;

    // Orbit radius — sized off the constrained dimension (typically
    // stageH on a 16:9 surface). 0.4 of stageH gives ~432px on 1080,
    // which leaves room for ~84px orbiters at the ring without clipping.
    // The horizontal axis on a wide stage has plenty of room either way.
    const orbitRadius = Math.min(stageW, stageH) * 0.4;

    // Center word — large, display face, italic.
    //
    // Sizing: the design intent is "center always dominates". The
    // Producer occasionally emits a `size` that's a 0–1 multiplier
    // (mistaking the scale for `weight`) or omits it entirely, which
    // shipped tiny center words. So:
    //   1. Compute the largest orbiter pixel size — the floor we never
    //      want the center to read smaller than.
    //   2. Compute a default that scales with the stage (≈ stageH/9, e.g.
    //      ~ 96 at 864px tall) and is at least 2× the largest orbiter.
    //   3. Honor `center.size` only if it's plausibly a pixel value
    //      (>= 24). Anything below that is treated as drift and ignored.
    //   4. Clamp to a hard floor (48) and a max derived from the orbit
    //      ring so the headline never overflows into the orbiters.
    const largestOrbiterSize =
      orbiting.reduce((m, o) => Math.max(m, 36 + (o.weight ?? 0) * 48), 0);
    const stageDefault = Math.round(stageH / 9);
    const minCenter = Math.max(48, largestOrbiterSize * 2);
    const requestedCenter =
      typeof center.size === 'number' && center.size >= 24 ? center.size : null;
    let centerSize = requestedCenter ?? Math.max(stageDefault, minCenter);

    // Cap by the orbit ring so a long center word doesn't crash into the
    // orbiters. Measure with the same display face the TextBox will use.
    const maxCenterWidth = orbitRadius * 2 - 80; // 40px breathing room each side
    if (typeof document !== 'undefined' && maxCenterWidth > 0) {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        // Step the size down until the rendered width fits the ring.
        // Floor at 48 — below that the headline stops dominating and we
        // accept some overflow rather than ship an illegible scene.
        for (let s = centerSize; s >= 48; s -= 4) {
          ctx.font = `italic 400 ${s}px ${displayFamily}`;
          if (ctx.measureText(center.text).width <= maxCenterWidth) {
            centerSize = s;
            break;
          }
          centerSize = s;
        }
      }
    }
    const centerHandle: TextBoxHandle = presenter.showTextBox({
      text: center.text,
      style: {
        font: displayFamily,
        size: centerSize,
        weight: 'italic 400',
        color: ink1,
        shadow: { color: 'rgba(0,0,0,.5)', blur: 18, offsetX: 0, offsetY: 4 },
        padding: 32,
      },
      x: cx,
      y: cy,
      fx: centerFx,
    });

    // Font-ready cache invalidation for the serif display face.
    let fontsDismissed = false;
    if (typeof document !== 'undefined' && (document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts
        .load(`italic 400 ${centerSize}px ${displayFamily}`)
        .then(() => {
          if (!fontsDismissed) centerHandle.box.setStyle({});
        })
        .catch(() => { /* fallback face is acceptable */ });
    }

    const count = orbiting.length;
    const angleStep = count > 0 ? (2 * Math.PI) / count : 0;
    let baseAngleOffset = 0;

    const orbiterHandles: TextBoxHandle[] = [];
    const orbiterAngles: number[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    // Stagger orbiters in. Orbiters use the UI face, color lerps from
    // --cs-ink-3 (low weight) to --cs-ink-1 (high weight).
    orbiting.forEach((spec, i) => {
      const angle = -Math.PI / 2 + i * angleStep; // start from top
      orbiterAngles.push(angle);

      const tid = setTimeout(() => {
        const orbSize = 36 + spec.weight * 48;
        const ox = cx + Math.cos(angle) * orbitRadius;
        const oy = cy + Math.sin(angle) * orbitRadius;

        const h = presenter.showTextBox({
          text: spec.text,
          style: {
            font: uiFamily,
            size: orbSize,
            weight: spec.weight > 0.7 ? '700' : '500',
            color: lerpInk(ink3, ink1, spec.weight),
            shadow: { color: 'rgba(0,0,0,.4)', blur: 10, offsetX: 0, offsetY: 2 },
            padding: 16,
          },
          x: ox,
          y: oy,
          fx: [{ name: 'grow', duration: 500, from: 0, to: 1 }],
        });
        orbiterHandles.push(h);
      }, staggerMs * (i + 1));

      timeouts.push(tid);
    });

    // Optional slow orbit rotation via rAF. Default is 0 (static) per
    // TEMPLATE-SPEC §9 #6 — opt in by setting orbitSpeed > 0 on content.
    let rafId = 0;
    if (orbitSpeed > 0 && count > 0) {
      const tick = () => {
        baseAngleOffset += orbitSpeed;
        orbiterHandles.forEach((h, i) => {
          const angle = orbiterAngles[i] + baseAngleOffset;
          h.box.x = cx + Math.cos(angle) * orbitRadius;
          h.box.y = cy + Math.sin(angle) * orbitRadius;
        });
        rafId = requestAnimationFrame(tick);
      };
      const rotateDelay = staggerMs * (count + 2);
      const rotTid = setTimeout(() => {
        rafId = requestAnimationFrame(tick);
      }, rotateDelay);
      timeouts.push(rotTid);
    }

    // Track the currently-emphasized orbiter so the accent budget stays at 1.
    let activeEmph: TextBoxHandle | null = null;

    const handle: TemplateHandle = {
      dismiss: () => {
        fontsDismissed = true;
        centerHandle.dismiss();
        orbiterHandles.forEach((h) => h.dismiss());
        timeouts.forEach(clearTimeout);
        if (rafId) cancelAnimationFrame(rafId);
        activeEmph = null;
      },
      emphasize: (target) => {
        const i = Number(target);
        const h = Number.isFinite(i) ? orbiterHandles[i] : orbiterHandles.find(
          (oh) => oh.box.text.toLowerCase() === target.toLowerCase(),
        );
        if (!h) return;

        // Accent budget = 1: if a prior orbiter is still emph'd, drop its
        // glow before lighting the new one. The glow fx self-decays so we
        // don't need to run a revert timer — just track the handle.
        if (activeEmph && activeEmph !== h) {
          activeEmph.box.glow = 0;
        }
        activeEmph = h;

        h.applyFx({ name: 'glow', duration: 1000, strength: 50, color: warm });
        h.applyFx({ name: 'shake', duration: 400, intensity: 6 });
      },
    };
    return handle;
  },
};

/**
 * Parse a CSS color string to [r,g,b]. Accepts `rgb(...)`, `#rrggbb`, and
 * `#rgb`. Returns null for anything else (e.g. oklch, hsl) — caller falls
 * back to the raw high-weight color in that case.
 */
function parseRgb(color: string): [number, number, number] | null {
  const s = color.trim();
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex6 = s.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const n = parseInt(hex6[1], 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }
  const hex3 = s.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1].split('');
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  return null;
}

/**
 * Lerp between two ink colors resolved from --cs-ink-3 / --cs-ink-1.
 * Non-destructive: if either side is an unparseable color space we can't
 * mix in (oklch etc.), we just fall back to the bright end, which keeps
 * the orbiter readable.
 */
function lerpInk(loColor: string, hiColor: string, weight: number): string {
  const lo = parseRgb(loColor);
  const hi = parseRgb(hiColor);
  if (!lo || !hi) return hiColor;
  const t = Math.max(0, Math.min(1, weight));
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * t);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * t);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

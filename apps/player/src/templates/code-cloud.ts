import type { Template, TemplateHandle } from './registry';
import { resolveColor } from './palette';

/**
 * code-cloud — a weighted word cloud of code concepts. DOM-based so text stays
 * crisp at any size. Weight drives font size (0.0 → smallest, 1.0 → largest).
 * Categories drive color. Items enter with a configurable style and then
 * (optionally) float gently in place.
 *
 * lenzon/ui v0.1 styling: the whole cloud sits inside a single
 * .cs-plate. Individual items do NOT each get a plate (perf + visual
 * noise). Default per-item color is var(--cs-accent-cool); unknown /
 * neutral categories fall through to var(--cs-ink-3). Producer-emitted
 * `palette.*` aliases still resolve via resolveColor so the category
 * slot contract is unchanged.
 *
 * The `float` slot (CS-19 opt-in) still works. DO NOT make it default-on —
 * the project prefers calmer templates.
 *
 * Slot schema:
 *   items:          { text, weight, category }[]
 *   categoryColors: Record<string, string>  (CSS color, `var(--cs-*)`, or "palette.primary")
 *   entranceStyle:  "scatter" | "spiral" | "typewriter"
 *   float:          boolean — opt-in continuous float (default false)
 */

interface CloudItem {
  text: string;
  weight: number;
  category: string;
}

interface CodeCloudContent {
  items: CloudItem[];
  categoryColors?: Record<string, string>;
  entranceStyle?: 'scatter' | 'spiral' | 'typewriter';
  /** Continuous gentle float after items land. Off by default — enable per
   *  scene when the kinetic feel is desired. See TEMPLATE-SPEC.md §9 #5. */
  float?: boolean;
}

export const codeCloudTemplate: Template = {
  id: 'code-cloud',
  version: '1.0.0',
  description:
    'Weighted DOM word cloud for code concepts inside a glass plate. Scatter / spiral / typewriter entrance; gentle float after placement (opt-in).',
  slots: {
    items: '{ text: string, weight: number, category: string }[] — cloud items',
    categoryColors: 'Record<string, string> — category → color (CSS, var(--cs-*), or palette.* alias)',
    entranceStyle: '"scatter" | "spiral" | "typewriter" — how items appear',
    float: 'boolean — opt-in continuous gentle float after entrance (default false)',
  },
  demo: {
    label: 'Code Cloud',
    content: {
      items: [
        { text: 'React', weight: 1.0, category: 'framework' },
        { text: 'Express', weight: 0.9, category: 'framework' },
        { text: 'useState', weight: 0.85, category: 'pattern' },
        { text: 'prisma', weight: 0.7, category: 'orm' },
        { text: 'JWT', weight: 0.6, category: 'auth' },
        { text: 'WebSocket', weight: 0.4, category: 'transport' },
        { text: 'Redis', weight: 0.3, category: 'cache' },
        { text: 'useEffect', weight: 0.75, category: 'pattern' },
        { text: 'Postgres', weight: 0.65, category: 'orm' },
      ],
      categoryColors: {
        framework: 'var(--cs-accent-cool)',
        pattern: 'var(--cs-ink-1)',
        orm: 'var(--cs-accent-ok)',
        auth: 'var(--cs-accent-warn)',
        transport: 'var(--cs-ink-2)',
        cache: 'var(--cs-ink-3)',
      },
      entranceStyle: 'spiral',
    },
    emphasizeAfter: { target: 'JWT', delayMs: 2500 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as CodeCloudContent;
    const {
      items = [],
      categoryColors = {},
      entranceStyle = 'spiral',
      float = false,
    } = content;

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-cloud-plate';

    const container = document.createElement('div');
    container.className = 'sb-cloud';
    plate.appendChild(container);

    // Sort by weight desc so big items claim space first.
    const sorted = [...items].sort((a, b) => b.weight - a.weight);

    // Size range in px — tuned so max reads as headline, min reads as hint.
    const MIN_SIZE = 28;
    const MAX_SIZE = 110;

    const sizes = sorted.map((item) => MIN_SIZE + (MAX_SIZE - MIN_SIZE) * clamp01(item.weight));

    // Measure the plate (not domRoot) — the cloud is positioned inside it.
    // Using clientWidth rather than getBoundingClientRect because embed
    // CSS transforms break the rect-based sizing.
    const stageW = plate.clientWidth || presenter.domRoot.clientWidth || 1280;
    const stageH = plate.clientHeight || presenter.domRoot.clientHeight || 720;

    const footprints = sorted.map((item, i) => ({
      w: ((item.text.length * sizes[i] * 0.6) / stageW) * 100,
      h: ((sizes[i] * 1.2) / stageH) * 100,
    }));

    const positions = computePositions(sorted, entranceStyle, footprints);

    const itemEls: HTMLSpanElement[] = [];
    sorted.forEach((item, i) => {
      const el = document.createElement('span');
      el.className = 'sb-cloud-item';
      el.textContent = item.text;

      const size = sizes[i];
      el.style.fontSize = `${size.toFixed(1)}px`;
      el.style.fontWeight = item.weight > 0.7 ? '800' : item.weight > 0.4 ? '600' : '500';
      // Default tint when no mapping is provided: cool for "framework-y"
      // things, ink-3 for anything we don't know. Producer-emitted
      // `palette.*` aliases still resolve through resolveColor.
      el.style.color = resolveColor(categoryColors[item.category], 'var(--cs-ink-3)');

      const { x, y } = positions[i];
      el.style.left = `${x.toFixed(2)}%`;
      el.style.top = `${y.toFixed(2)}%`;

      if (float) {
        el.classList.add('sb-cloud-float');
        const floatDur = 4000 + Math.random() * 3000;
        const floatDelay = Math.random() * 2000;
        el.style.setProperty('--sb-cloud-float-dur', `${floatDur}ms`);
        el.style.setProperty('--sb-cloud-float-delay', `${floatDelay}ms`);
      }

      container.appendChild(el);
      itemEls.push(el);
    });

    presenter.domRoot.appendChild(plate);

    // Entrance animation — depends on style.
    const timers: number[] = [];
    const reveal = (el: HTMLSpanElement, delay: number) => {
      const tid = window.setTimeout(() => el.classList.add('sb-visible'), delay);
      timers.push(tid);
    };

    if (entranceStyle === 'typewriter') {
      itemEls.forEach((el, i) => reveal(el, 100 + i * 140));
    } else if (entranceStyle === 'scatter') {
      itemEls.forEach((el, i) => reveal(el, 80 + i * 60 + Math.random() * 200));
    } else {
      itemEls.forEach((el, i) => reveal(el, 150 + i * 90));
    }

    const emphTimers = new Map<HTMLSpanElement, number>();

    const handle: TemplateHandle = {
      dismiss: () => {
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        plate.remove();
      },
      emphasize: (target) => {
        const match = itemEls.find(
          (el) => el.textContent?.toLowerCase() === target.toLowerCase(),
        );
        if (!match) return;

        // Accent budget = 1: clear any other item currently emph'd.
        itemEls.forEach((other) => {
          if (other !== match && other.classList.contains('sb-cloud-emphasize')) {
            other.classList.remove('sb-cloud-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        match.classList.add('sb-cloud-emphasize');
        const prior = emphTimers.get(match);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          match,
          window.setTimeout(() => {
            match.classList.remove('sb-cloud-emphasize');
            emphTimers.delete(match);
          }, 1400),
        );
      },
    };
    return handle;
  },
};

/**
 * Compute positions (in percent of container) for each item based on its
 * index, the chosen entrance style, and each item's footprint. Uses a simple
 * collision-aware placement: each item starts at a style-driven anchor, then
 * nudges outward along the spiral direction until it doesn't overlap any
 * already-placed item (with a small gap for breathing room).
 */
function computePositions(
  items: CloudItem[],
  style: 'scatter' | 'spiral' | 'typewriter',
  footprints: Array<{ w: number; h: number }>
): Array<{ x: number; y: number }> {
  const GAP = 1.2;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some(
      (p) =>
        Math.abs(p.x - x) < (p.w + w) / 2 + GAP &&
        Math.abs(p.y - y) < (p.h + h) / 2 + GAP
    );

  const place = (x: number, y: number, i: number) => {
    const { w, h } = footprints[i];
    placed.push({ x, y, w, h });
    return { x, y };
  };

  if (style === 'typewriter') {
    const positions: Array<{ x: number; y: number }> = [];
    const leftPad = 8;
    const rightEdge = 92;
    const rowGap = 2;
    let cursorX = leftPad;
    let rowY = 20;
    let rowH = 0;
    items.forEach((_, i) => {
      const { w, h } = footprints[i];
      if (cursorX + w > rightEdge && cursorX > leftPad) {
        rowY += rowH + rowGap;
        cursorX = leftPad;
        rowH = 0;
      }
      const cx = cursorX + w / 2;
      const cy = rowY + h / 2;
      positions.push(place(cx, cy, i));
      cursorX += w + GAP;
      rowH = Math.max(rowH, h);
    });
    const totalH = rowY + rowH - 20;
    const shift = Math.max(0, (100 - totalH) / 2 - 20);
    return positions.map((p) => ({ x: p.x, y: p.y + shift }));
  }

  return items.map((_, i) => {
    const { w, h } = footprints[i];
    let ax: number;
    let ay: number;
    if (style === 'scatter') {
      const a = seededRand(i * 9301 + 49297);
      const b = seededRand(i * 7919 + 104729);
      ax = 15 + a * 70;
      ay = 20 + b * 60;
    } else {
      const angle = i * 0.7;
      const radius = 2 + i * 2.6;
      ax = 50 + Math.cos(angle) * radius;
      ay = 50 + Math.sin(angle) * radius * 0.75;
    }

    let x = ax;
    let y = ay;
    if (overlaps(x, y, w, h)) {
      const startAngle = Math.atan2(ay - 50, ax - 50 || 0.0001);
      const startR = Math.hypot(ax - 50, ay - 50);
      for (let step = 1; step <= 240; step++) {
        const t = step * 0.35;
        const r = startR + t * 1.1;
        const ang = startAngle + t * 0.6;
        x = 50 + Math.cos(ang) * r;
        y = 50 + Math.sin(ang) * r * 0.75;
        if (x < 6 || x > 94 || y < 6 || y > 94) continue;
        if (!overlaps(x, y, w, h)) break;
      }
    }
    return place(x, y, i);
  });
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

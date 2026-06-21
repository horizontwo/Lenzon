import type { Template, TemplateHandle } from './registry';

/**
 * risk-matrix — a 2×2 triage plot (impact × likelihood) for gotchas.
 * Opens the gotchas movement: gives the viewer the shape of what's
 * coming before any one risk gets a deep-dive scene.
 *
 * Layout:
 *   - SVG-backed coordinate plot inside a .cs-plate body.
 *   - X axis (likelihood, low → high) along the bottom.
 *   - Y axis (impact,    low → high) up the left side.
 *   - Optional faint quadrant labels in the four corners ("Address
 *     first" / "Monitor" / "Fix soon" / "Acceptable" by convention).
 *   - One dot per RiskItem at (likelihood, impact) in normalized 0–1
 *     space, with a mono ID badge inside the dot and the full label
 *     rendered to the side. The legend lives in the dots themselves.
 *
 * Collision: if two risks plot within ~0.04 in normalized space (the
 * dot radius is ~0.035), the second one is nudged along a small
 * angular offset so the two are visible side by side rather than
 * stacked. We never lie about the position — the nudge is small
 * enough that the qualitative quadrant reading is preserved.
 *
 * Runtime contract (emphasize port, prefix convention per PR-lens-
 * updates §3):
 *
 *   { type: "emphasize", target: id }           → pulse one risk dot
 *   { type: "emphasize", target: "reveal:id" }  → make the dot visible
 *                                                  (idempotent — the
 *                                                  auto-stagger usually
 *                                                  beats this)
 *
 * The producer can therefore use a sequence of `reveal:` beats to
 * drop dots onto the grid one at a time on a paced narration, OR let
 * the auto-stagger handle entrance and only fire `emphasize` beats to
 * pulse specific risks when the narrator names them.
 *
 * Fill mode: full-bleed.
 */

interface RiskItem {
  id: string;
  /** Short label — "Realpath cache miss". Rendered next to the dot. */
  label: string;
  /** 0–1 impact score, low → high (Y axis). */
  impact: number;
  /** 0–1 likelihood score, low → high (X axis). */
  likelihood: number;
  /** Optional file citation, surfaced as a small footnote on the dot. */
  file?: string;
  /** Optional line range string ("L42-L51"). */
  lineRange?: string;
}

interface QuadrantLabels {
  topRight?: string;
  topLeft?: string;
  bottomRight?: string;
  bottomLeft?: string;
}

interface RiskMatrixContent {
  title?: string;
  xAxis?: { label?: string; low?: string; high?: string };
  yAxis?: { label?: string; low?: string; high?: string };
  items: RiskItem[];
  quadrantLabels?: QuadrantLabels;
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

interface PlottedItem extends RiskItem {
  /** Normalized 0–1 plot coords AFTER collision nudge. */
  px: number;
  py: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Clamp value to [0, 1]. Risks scored outside that range are bugs in
 * the analyst output; we clamp rather than throw so the scene still
 * renders something sensible while the analyst learns. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * If two items plot within COLLISION_RADIUS, nudge the second one
 * around the first by NUDGE_DISTANCE on a rotating angle. We process
 * items in array order, so the producer can control which one stays
 * put by ordering: the first one wins its exact position; later ones
 * peel off radially.
 */
function plotWithCollisions(items: RiskItem[]): PlottedItem[] {
  const COLLISION_RADIUS = 0.04;
  const NUDGE_DISTANCE = 0.05;
  const out: PlottedItem[] = [];
  let nudgeCount = 0;

  for (const item of items) {
    let px = clamp01(item.likelihood);
    let py = clamp01(item.impact);

    const collides = out.some(
      (other) => Math.hypot(other.px - px, other.py - py) < COLLISION_RADIUS,
    );

    if (collides) {
      nudgeCount += 1;
      // Walk around the circle as collisions accumulate so a third
      // colliding item doesn't land on top of the second.
      const angle = (nudgeCount * 137.5) * (Math.PI / 180); // golden angle
      px = clamp01(px + Math.cos(angle) * NUDGE_DISTANCE);
      py = clamp01(py + Math.sin(angle) * NUDGE_DISTANCE);
    }

    out.push({ ...item, px, py });
  }

  return out;
}

export const riskMatrixTemplate: Template = {
  id: 'risk-matrix',
  version: '1.0.0',
  description:
    'Triage 2×2 plot for gotchas — impact × likelihood. Each risk renders ' +
    'as an ID-badged dot at (likelihood, impact); colliding dots auto-nudge. ' +
    'Optional faint quadrant labels ("Address first" / "Monitor" / "Fix ' +
    'soon" / "Acceptable") in the corners. Dots stagger in on mount; ' +
    'emphasize(id) pulses one risk.',
  slots: {
    title: 'string — optional headline (default "Risks identified")',
    xAxis: '{ label?, low?, high? } — defaults likelihood, "rare"/"likely"',
    yAxis: '{ label?, low?, high? } — defaults impact, "low"/"high"',
    items: 'RiskItem[] — { id, label, impact 0-1, likelihood 0-1, file?, lineRange? }',
    quadrantLabels: '{ topRight?, topLeft?, bottomRight?, bottomLeft? } — faint corner text',
    staggerMs: 'number — between-dot reveal delay (default 220)',
  },
  demo: {
    label: 'Risk Matrix',
    content: {
      title: 'Risks identified',
      xAxis: { label: 'Likelihood', low: 'Rare', high: 'Likely' },
      yAxis: { label: 'Impact', low: 'Low', high: 'High' },
      items: [
        {
          id: 'R1',
          label: 'Realpath cache miss',
          impact: 0.72,
          likelihood: 0.55,
          file: 'src/upload/path-validator.ts',
          lineRange: 'L42-L51',
        },
        {
          id: 'R2',
          label: 'Symlink outside ROOT slips through on Windows',
          impact: 0.85,
          likelihood: 0.22,
          file: 'src/upload/path-validator.ts',
          lineRange: 'L60-L72',
        },
        {
          id: 'R3',
          label: 'Error message leaks server paths',
          impact: 0.28,
          likelihood: 0.45,
          file: 'src/upload/errors.ts',
          lineRange: 'L8-L14',
        },
      ],
      quadrantLabels: {
        topRight: 'Address first',
        topLeft: 'Monitor',
        bottomRight: 'Fix soon',
        bottomLeft: 'Acceptable',
      },
      staggerMs: 240,
    },
    emphasizeAfter: { target: 'R1', delayMs: 2400 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as RiskMatrixContent;

    const title = c.title?.trim() || 'Risks identified';
    const xAxisLabel = c.xAxis?.label ?? 'Likelihood';
    const xAxisLow = c.xAxis?.low ?? 'Rare';
    const xAxisHigh = c.xAxis?.high ?? 'Likely';
    const yAxisLabel = c.yAxis?.label ?? 'Impact';
    const yAxisLow = c.yAxis?.low ?? 'Low';
    const yAxisHigh = c.yAxis?.high ?? 'High';
    const quadrants = c.quadrantLabels ?? {};
    const stagger = Math.max(80, c.staggerMs ?? 220);
    const items = c.items ?? [];

    const plotted = plotWithCollisions(items);

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-risk-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-risk-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-risk-plate';

    // Header.
    const header = document.createElement('div');
    header.className = 'sb-risk-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-risk-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ / risk-matrix';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--warn sb-risk-tag';
    sceneTag.textContent = c.sceneTag ?? 'RISKS';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    // Title row.
    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-risk-title';
    titleEl.textContent = title;
    plate.appendChild(titleEl);

    // Body — split: grid (left, takes most of the space) + legend (right).
    // The legend is the dot list; the grid is the SVG plot.
    const body = document.createElement('div');
    body.className = 'sb-risk-body';

    // ── Grid (SVG) ──
    // viewBox uses a unit square (0..100) padded by gutters for the axis
    // ticks/labels. We render everything in this space so the layout
    // scales perfectly under container-size queries.
    const GUTTER = 12; // unit-space margin for axis labels
    const VB_SIZE = 100;
    const PLOT_MIN = GUTTER;
    const PLOT_MAX = VB_SIZE - GUTTER * 0.5;
    const PLOT_RANGE = PLOT_MAX - PLOT_MIN;

    const gridWrap = document.createElement('div');
    gridWrap.className = 'sb-risk-grid-wrap';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute(
      'viewBox',
      `0 0 ${VB_SIZE} ${VB_SIZE + GUTTER * 0.5}`,
    );
    svg.setAttribute('class', 'sb-risk-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Quadrant tint backgrounds — faint, give the four cells categorical
    // colour without dominating. Top-right (high impact + high likelihood)
    // is warn; top-left is cool; bottom-right is warn-dim; bottom-left
    // is neutral. This is the conventional triage palette.
    const tints: Array<{
      x: number; y: number; w: number; h: number; cls: string;
    }> = [
      // top-right (high lik, high imp)
      { x: PLOT_MIN + PLOT_RANGE / 2, y: PLOT_MIN, w: PLOT_RANGE / 2, h: PLOT_RANGE / 2, cls: 'sb-risk-quad sb-risk-quad--tr' },
      // top-left (low lik, high imp)
      { x: PLOT_MIN, y: PLOT_MIN, w: PLOT_RANGE / 2, h: PLOT_RANGE / 2, cls: 'sb-risk-quad sb-risk-quad--tl' },
      // bottom-right (high lik, low imp)
      { x: PLOT_MIN + PLOT_RANGE / 2, y: PLOT_MIN + PLOT_RANGE / 2, w: PLOT_RANGE / 2, h: PLOT_RANGE / 2, cls: 'sb-risk-quad sb-risk-quad--br' },
      // bottom-left (low lik, low imp)
      { x: PLOT_MIN, y: PLOT_MIN + PLOT_RANGE / 2, w: PLOT_RANGE / 2, h: PLOT_RANGE / 2, cls: 'sb-risk-quad sb-risk-quad--bl' },
    ];
    for (const t of tints) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(t.x));
      rect.setAttribute('y', String(t.y));
      rect.setAttribute('width', String(t.w));
      rect.setAttribute('height', String(t.h));
      rect.setAttribute('class', t.cls);
      svg.appendChild(rect);
    }

    // Quadrant labels (faint corner text). Positioned at the inner
    // corners so they don't crowd the axis labels.
    const QLABEL_INSET = 2;
    const qLabels: Array<{ x: number; y: number; anchor: string; text?: string }> = [
      { x: PLOT_MAX - QLABEL_INSET, y: PLOT_MIN + QLABEL_INSET + 3, anchor: 'end',   text: quadrants.topRight },
      { x: PLOT_MIN + QLABEL_INSET, y: PLOT_MIN + QLABEL_INSET + 3, anchor: 'start', text: quadrants.topLeft },
      { x: PLOT_MAX - QLABEL_INSET, y: PLOT_MAX - QLABEL_INSET,     anchor: 'end',   text: quadrants.bottomRight },
      { x: PLOT_MIN + QLABEL_INSET, y: PLOT_MAX - QLABEL_INSET,     anchor: 'start', text: quadrants.bottomLeft },
    ];
    for (const q of qLabels) {
      if (!q.text) continue;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(q.x));
      t.setAttribute('y', String(q.y));
      t.setAttribute('text-anchor', q.anchor);
      t.setAttribute('class', 'sb-risk-quad-label');
      t.textContent = q.text;
      svg.appendChild(t);
    }

    // Axes + midline cross. The midlines split the plot into the four
    // quadrants; we draw them last under the dots so dots land on top.
    const axisLines: Array<{ x1: number; y1: number; x2: number; y2: number; cls: string }> = [
      // outer frame
      { x1: PLOT_MIN, y1: PLOT_MAX, x2: PLOT_MAX, y2: PLOT_MAX, cls: 'sb-risk-axis' },
      { x1: PLOT_MIN, y1: PLOT_MIN, x2: PLOT_MIN, y2: PLOT_MAX, cls: 'sb-risk-axis' },
      // midlines
      { x1: PLOT_MIN + PLOT_RANGE / 2, y1: PLOT_MIN, x2: PLOT_MIN + PLOT_RANGE / 2, y2: PLOT_MAX, cls: 'sb-risk-axis-mid' },
      { x1: PLOT_MIN, y1: PLOT_MIN + PLOT_RANGE / 2, x2: PLOT_MAX, y2: PLOT_MIN + PLOT_RANGE / 2, cls: 'sb-risk-axis-mid' },
    ];
    for (const ln of axisLines) {
      const el = document.createElementNS(SVG_NS, 'line');
      el.setAttribute('x1', String(ln.x1));
      el.setAttribute('y1', String(ln.y1));
      el.setAttribute('x2', String(ln.x2));
      el.setAttribute('y2', String(ln.y2));
      el.setAttribute('class', ln.cls);
      svg.appendChild(el);
    }

    // Axis tick labels — low/high at the ends of each axis, axis name
    // centered. X axis ticks sit below the plot; Y axis ticks rotate 90°
    // and sit left of the plot.
    const ticks: Array<{
      x: number; y: number; anchor: string; cls: string; text: string;
      rotate?: { deg: number; cx: number; cy: number };
    }> = [
      // X axis low / high
      { x: PLOT_MIN, y: PLOT_MAX + 6, anchor: 'start', cls: 'sb-risk-tick', text: xAxisLow },
      { x: PLOT_MAX, y: PLOT_MAX + 6, anchor: 'end',   cls: 'sb-risk-tick', text: xAxisHigh },
      // X axis name centered below
      {
        x: PLOT_MIN + PLOT_RANGE / 2,
        y: PLOT_MAX + 10,
        anchor: 'middle',
        cls: 'sb-risk-axis-label',
        text: xAxisLabel,
      },
      // Y axis low/high (rotated -90deg around their own anchor)
      {
        x: PLOT_MIN - 4, y: PLOT_MAX, anchor: 'end', cls: 'sb-risk-tick',
        text: yAxisLow, rotate: { deg: -90, cx: PLOT_MIN - 4, cy: PLOT_MAX },
      },
      {
        x: PLOT_MIN - 4, y: PLOT_MIN, anchor: 'start', cls: 'sb-risk-tick',
        text: yAxisHigh, rotate: { deg: -90, cx: PLOT_MIN - 4, cy: PLOT_MIN },
      },
      // Y axis name centered to the left (rotated)
      {
        x: PLOT_MIN - 8, y: PLOT_MIN + PLOT_RANGE / 2, anchor: 'middle',
        cls: 'sb-risk-axis-label', text: yAxisLabel,
        rotate: { deg: -90, cx: PLOT_MIN - 8, cy: PLOT_MIN + PLOT_RANGE / 2 },
      },
    ];
    for (const t of ticks) {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('x', String(t.x));
      el.setAttribute('y', String(t.y));
      el.setAttribute('text-anchor', t.anchor);
      el.setAttribute('class', t.cls);
      if (t.rotate) {
        el.setAttribute(
          'transform',
          `rotate(${t.rotate.deg} ${t.rotate.cx} ${t.rotate.cy})`,
        );
      }
      el.textContent = t.text;
      svg.appendChild(el);
    }

    // Dots — one <g> per risk so we can toggle classes on it for
    // reveal/pulse without needing to track the inner shapes
    // individually.
    const dotById = new Map<string, SVGGElement>();
    for (const item of plotted) {
      const x = PLOT_MIN + item.px * PLOT_RANGE;
      // Y axis is inverted: high impact (py near 1) plots near the TOP
      // (low y in screen coords).
      const y = PLOT_MIN + (1 - item.py) * PLOT_RANGE;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sb-risk-dot');
      g.setAttribute('transform', `translate(${x} ${y})`);
      g.dataset.riskId = item.id;

      // Halo behind the dot — used by the pulse animation.
      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'sb-risk-dot-halo');
      halo.setAttribute('r', '6');
      g.appendChild(halo);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'sb-risk-dot-core');
      dot.setAttribute('r', '3.5');
      g.appendChild(dot);

      // ID badge — small mono text centered in the dot.
      const idText = document.createElementNS(SVG_NS, 'text');
      idText.setAttribute('class', 'sb-risk-dot-id');
      idText.setAttribute('text-anchor', 'middle');
      idText.setAttribute('dy', '0.36em');
      idText.textContent = item.id;
      g.appendChild(idText);

      svg.appendChild(g);
      dotById.set(item.id, g);
    }

    gridWrap.appendChild(svg);
    body.appendChild(gridWrap);

    // ── Legend (right side) ──
    // One row per risk — small ID badge + label + optional file ref.
    // This is the readable list; the dot positions are the spatial
    // version of the same data.
    const legend = document.createElement('ol');
    legend.className = 'sb-risk-legend';

    const legendItemById = new Map<string, HTMLElement>();
    for (const item of plotted) {
      const row = document.createElement('li');
      row.className = 'sb-risk-legend-row';
      row.dataset.riskId = item.id;

      const badge = document.createElement('span');
      badge.className = 'sb-risk-legend-badge';
      badge.textContent = item.id;

      const rowBody = document.createElement('div');
      rowBody.className = 'sb-risk-legend-body';

      const label = document.createElement('span');
      label.className = 'sb-risk-legend-label';
      label.textContent = item.label;
      rowBody.appendChild(label);

      if (item.file) {
        const cite = document.createElement('span');
        cite.className = 'sb-risk-legend-cite';
        cite.textContent = item.lineRange
          ? `${item.file} · ${item.lineRange}`
          : item.file;
        rowBody.appendChild(cite);
      }

      row.append(badge, rowBody);
      legend.appendChild(row);
      legendItemById.set(item.id, row);
    }

    body.appendChild(legend);
    plate.appendChild(body);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade — header/title first, then grid frame, then dots
    // staggered onto the plot in array order, with each dot's legend
    // row entering at the same beat so the eye can read both at once.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 240));
    timers.push(window.setTimeout(() => svg.classList.add('sb-visible'), 360));

    const perDelay = Math.max(100, Math.floor(stagger));
    plotted.forEach((item, i) => {
      const t = 520 + i * perDelay;
      timers.push(
        window.setTimeout(() => {
          dotById.get(item.id)?.classList.add('sb-visible');
          legendItemById.get(item.id)?.classList.add('sb-visible');
        }, t),
      );
    });

    // Pulse port — accent budget = 1: clear any other dot/row currently
    // pulsing before lighting a new one. Reveal verb is idempotent.
    const pulseTimers = new Map<Element, number>();
    let activeDot: SVGGElement | null = null;
    let activeRow: HTMLElement | null = null;

    const clearActive = () => {
      if (activeDot) {
        activeDot.classList.remove('sb-emphasize');
        const t = pulseTimers.get(activeDot);
        if (t != null) {
          window.clearTimeout(t);
          pulseTimers.delete(activeDot);
        }
        activeDot = null;
      }
      if (activeRow) {
        activeRow.classList.remove('sb-emphasize');
        const t = pulseTimers.get(activeRow);
        if (t != null) {
          window.clearTimeout(t);
          pulseTimers.delete(activeRow);
        }
        activeRow = null;
      }
    };

    return {
      dismiss: () => {
        clearActive();
        for (const t of timers) window.clearTimeout(t);
        pulseTimers.forEach((t) => window.clearTimeout(t));
        pulseTimers.clear();
        wrapper.remove();
      },
      emphasize: (target: string) => {
        if (!target) return;
        const colonIdx = target.indexOf(':');
        const verb = colonIdx >= 0 ? target.slice(0, colonIdx) : 'pulse';
        const id = colonIdx >= 0 ? target.slice(colonIdx + 1) : target;

        const dot = dotById.get(id);
        const row = legendItemById.get(id);
        if (!dot || !row) return;

        if (verb === 'reveal') {
          dot.classList.add('sb-visible');
          row.classList.add('sb-visible');
          return;
        }

        clearActive();
        dot.classList.add('sb-emphasize');
        row.classList.add('sb-emphasize');
        activeDot = dot;
        activeRow = row;
        const clearDot = window.setTimeout(() => {
          dot.classList.remove('sb-emphasize');
          if (activeDot === dot) activeDot = null;
          pulseTimers.delete(dot);
        }, 1400);
        const clearRow = window.setTimeout(() => {
          row.classList.remove('sb-emphasize');
          if (activeRow === row) activeRow = null;
          pulseTimers.delete(row);
        }, 1400);
        pulseTimers.set(dot, clearDot);
        pulseTimers.set(row, clearRow);
      },
    };
  },
};

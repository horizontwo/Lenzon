import type { Template, TemplateHandle } from './registry';

/**
 * review-priority-matrix — a 2×2 reading plan for a series of PRs, under
 * one named lens.
 *
 * Every other series template answers "what happened." This one answers
 * "where should a human look first, and under which reading?" — the only
 * template in the set aimed at the viewer's next action rather than their
 * comprehension. See SERIES-EXPLAINER-CONCEPT.md §4.10 / §4.10a.
 *
 * ── Relationship to risk-matrix ────────────────────────────────────────
 *
 * The layout is deliberately `risk-matrix`'s: same 2×2, likelihood on X,
 * impact on Y, SVG plot left and readable legend right, dots dropping in
 * on a stagger. A viewer who has seen one reads the other instantly, and
 * that is the point of a visual language.
 *
 * It is a separate template rather than `risk-matrix` with different
 * content because three things differ structurally, not cosmetically:
 *
 *  1. **The lens is required and rendered.** A dot at (0.8, 0.9) means
 *     nothing until the viewer knows which question produced it — the same
 *     argument that makes `component-impact`'s `unitLabel` required. And
 *     because a window emits several of these consecutively (§4.10a), the
 *     lens label is what stops the second plot reading as the first one
 *     with the dots moved.
 *  2. **`unscored` has no equivalent.** A PR the corpus cannot speak to
 *     must not vanish from a plot whose whole claim is "here is where to
 *     look" — absent-from-plot and safe-to-skip must not look the same.
 *  3. **`likelihood` is redefined.** On `risk-matrix` it is "will this
 *     defect trigger." Here it is *how review-worthy the PR is* — how
 *     likely a careful reader is to find something worth acting on. That
 *     is what makes this a prioritizer rather than a risk register, and
 *     one word carrying two definitions in one visual language is worth
 *     its own documented semantics.
 *
 *     The rendered axis says "Review worthy" rather than naming the slot.
 *     The slot keeps the name `likelihood` because it is the shared 2×2
 *     contract with `risk-matrix` and the producer tool schema hashes it;
 *     the axis label is what a viewer reads, so that is where the plain
 *     wording belongs.
 *
 * ── Honesty constraints ────────────────────────────────────────────────
 *
 *  - **The plate says these are a reading order, not a measurement.** The
 *    scores are producer judgment applied to computed signals (which paths
 *    a PR touched, its gotchas, its objective kinds) against a lens the
 *    analyst never applied. That is one step further from measurement than
 *    `risk-matrix`'s already-interim heuristic, so the disclosure lives on
 *    the artifact rather than in the narration — a captured frame carries
 *    it too.
 *  - **Unscored PRs are stated, never dropped.** `unscored[]` renders as a
 *    footer line with each PR's reason. Zero unscored renders nothing.
 *  - **Truncation is disclosed.** `maxItems` keeps the highest-priority
 *    PRs (by impact × likelihood) and states how many were withheld, so
 *    the plot never implies it is the whole window.
 *  - **The lens question is rendered verbatim.** `lens.question` is the
 *    one-line reading being applied ("Could this be exploited or leak?").
 *    It sits under the title so the axes have a stated meaning.
 *
 * ── Coordinate space (TEMPLATE-SPEC §9d) ───────────────────────────────
 *
 * Fixed unit-space `viewBox` with `preserveAspectRatio`, exactly as
 * `risk-matrix`. The template measures NOTHING — no `getBoundingClientRect`,
 * no `clientWidth` read, no host-scale normalization — so §9d's screen-px
 * trap is structurally unreachable.
 *
 * ── Runtime contract (emphasize port) ──────────────────────────────────
 *
 *   { type: "emphasize", target: "pr:27" }        → pulse PR #27's dot+row
 *   { type: "emphasize", target: "27" }           → same, bare number
 *   { type: "emphasize", target: "reveal:pr:27" } → reveal one dot
 *   { type: "emphasize", target: "quadrant:topRight" }
 *                                                 → light one cell and
 *                                                   every dot inside it
 *
 * The quadrant verb is the beat this template exists for: "these four are
 * where I'd start" is one sentence and one emphasis, not four. Quadrant
 * membership is computed from the plotted position (>= 0.5 is high on each
 * axis), so it always matches what the viewer sees.
 *
 * Calm, not kinetic: one drop-in stagger, then nothing moves until a beat
 * asks it to.
 *
 * Fill mode: full-bleed.
 */

/** The lens ids this template has an accent hue for, one `sb-rpm--<id>`
 * class each in the stylesheet.
 *
 * This used to be `REVIEW_LENS_IDS`, imported from Lenzon's internal
 * shared-types package.
 * The open player cannot reach Lenzon internals, and what the template
 * really needs is the list of hues it can draw, which is a fact about its
 * own CSS. Lenzon's producer builds its `lens.id` enum from the shared-types
 * list, and apps/server/lib/player-template-contract.test.ts fails the
 * server's typecheck if the two lists stop matching.
 *
 * The template still accepts an unknown id and renders it — being strict here
 * would blank a scene over a label — but the accent falls back to neutral. */
export const REVIEW_PRIORITY_ACCENT_IDS = [
  'security',
  'correctness',
  'architecture',
  'user-experience',
  'operability',
  'compliance',
] as const;

export type ReviewPriorityAccentId = (typeof REVIEW_PRIORITY_ACCENT_IDS)[number];

interface ReviewLens {
  /** Any string. One of REVIEW_PRIORITY_ACCENT_IDS gets its hue; anything
   * else renders neutral. */
  id: string;
  /** Display name — "Security", "User experience". */
  label: string;
  /** The one-line reading applied. Rendered under the title. */
  question?: string;
}

interface PriorityItem {
  prNumber: number;
  /** PR title — the side label. */
  title: string;
  /** 0–1: if something is wrong here, how much does it matter under this lens. */
  impact: number;
  /** 0–1: how review-worthy this PR is — how likely a careful reader is to
   * find something worth acting on. Rendered on the X axis as "Review
   * worthy". NOT probability of failure. */
  likelihood: number;
  /** One line of *why this score*, under this lens. */
  rationale?: string;
  /** Era label the PR belongs to, if the window has eras. */
  era?: string;
  /** Files or areas that drove the score — a short list, rendered truncated. */
  files?: string[];
}

/** A PR in the window that could not be scored. Stated, never dropped. */
interface UnscoredPr {
  prNumber: number;
  /** Why — "no analysis", "errored", "not ready". Rendered verbatim. */
  reason: string;
}

interface QuadrantLabels {
  topRight?: string;
  topLeft?: string;
  bottomRight?: string;
  bottomLeft?: string;
}

type QuadrantKey = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft';

interface ReviewPriorityMatrixContent {
  title?: string;
  lens: ReviewLens;
  items: PriorityItem[];
  unscored?: UnscoredPr[];
  xAxis?: { label?: string; low?: string; high?: string };
  yAxis?: { label?: string; low?: string; high?: string };
  quadrantLabels?: QuadrantLabels;
  maxItems?: number;
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
  /** Override the on-artifact triage disclosure. Cannot be removed. */
  basisNote?: string;
}

interface PlottedItem extends PriorityItem {
  /** Normalized 0–1 plot coords AFTER collision nudge. */
  px: number;
  py: number;
  /** Quadrant computed from the plotted position, so it matches the visual. */
  quadrant: QuadrantKey;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_QUADRANTS: Required<QuadrantLabels> = {
  topRight: 'Examine first',
  topLeft: 'Read closely',
  bottomRight: 'Skim',
  bottomLeft: 'Defer',
};

/**
 * Per-lens accent class. Six lenses, six hues, so two matrices back to
 * back are distinguishable at a glance rather than only by their label.
 * An unknown id gets the neutral class.
 */
function lensAccentClass(id: string): string {
  const known = (REVIEW_PRIORITY_ACCENT_IDS as readonly string[]).includes(id);
  return known ? `sb-rpm--${id}` : 'sb-rpm--neutral';
}

/** Clamp to [0,1]. Scores outside that range are producer bugs; we clamp
 * rather than throw so the scene still renders while the prompt learns. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function quadrantOf(px: number, py: number): QuadrantKey {
  const right = px >= 0.5;
  const top = py >= 0.5;
  if (top && right) return 'topRight';
  if (top) return 'topLeft';
  if (right) return 'bottomRight';
  return 'bottomLeft';
}

/**
 * Priority score used for ranking and for `maxItems` truncation. The
 * product, not the sum: a PR that is high impact but very unlikely to
 * yield anything is not where a reviewer starts, and neither is a
 * certain-to-yield triviality. Both axes have to be up for the top-right
 * quadrant to earn its name.
 */
function priorityOf(item: PriorityItem): number {
  return clamp01(item.impact) * clamp01(item.likelihood);
}

/**
 * Collision nudge, identical in spirit to risk-matrix's: two PRs scored
 * the same would otherwise stack into one dot. Items are processed in
 * the caller's order, so the first keeps its exact position and later
 * ones peel off along the golden angle.
 *
 * The nudge is small enough that the quadrant reading survives — but it
 * CAN push a dot across a midline when the score sits exactly on 0.5.
 * That is why `quadrant` is computed from the nudged position: a dot the
 * viewer sees in the top-right must answer to `quadrant:topRight`, even
 * if its raw score was borderline. The plot is the claim.
 */
function plotWithCollisions(items: PriorityItem[]): PlottedItem[] {
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
      const angle = nudgeCount * 137.5 * (Math.PI / 180); // golden angle
      px = clamp01(px + Math.cos(angle) * NUDGE_DISTANCE);
      py = clamp01(py + Math.sin(angle) * NUDGE_DISTANCE);
    }

    out.push({ ...item, px, py, quadrant: quadrantOf(px, py) });
  }

  return out;
}

/**
 * Apply `maxItems` by keeping the highest-priority PRs. Returns the kept
 * set and what was dropped, because the drop has to be stated: a plot
 * that silently shows 10 of 30 PRs implies those 10 are the window.
 */
function applyCap(
  items: PriorityItem[],
  maxItems: number | undefined,
): { kept: PriorityItem[]; droppedCount: number } {
  if (!maxItems || maxItems <= 0 || items.length <= maxItems) {
    return { kept: items, droppedCount: 0 };
  }
  // Rank by priority, keep the top N, then restore the caller's order so
  // the reveal stagger still follows the narration's sequence.
  const ranked = [...items].sort((a, b) => priorityOf(b) - priorityOf(a));
  const keepSet = new Set(ranked.slice(0, maxItems).map((i) => i.prNumber));
  return {
    kept: items.filter((i) => keepSet.has(i.prNumber)),
    droppedCount: items.length - maxItems,
  };
}

export const reviewPriorityMatrixTemplate: Template = {
  id: 'review-priority-matrix',
  version: '1.0.0',
  description:
    'Reading plan for a series under one lens — a 2×2 of impact × ' +
    'review-worthiness with one dot per PR. The lens (security, correctness, ' +
    'architecture, user-experience, operability, compliance) is required ' +
    'and rendered, since it is what gives the axes meaning. Quadrants are ' +
    'a reading order ("Examine first" / "Read closely" / "Skim" / ' +
    '"Defer"), not a risk verdict. Unscored PRs are stated in the footer ' +
    'rather than omitted. emphasize("quadrant:topRight") lights a whole ' +
    'cell — the "start here" beat.',
  slots: {
    title: 'string — optional headline (default "Where to look first")',
    lens: '{ id, label, question? } — REQUIRED. id is one of security, correctness, architecture, user-experience, operability, compliance',
    items: 'PriorityItem[] — { prNumber, title, impact 0-1, likelihood 0-1, rationale?, era?, files? }',
    unscored: '{ prNumber, reason }[] — PRs in the window that could not be scored; rendered as a stated footer',
    xAxis: '{ label?, low?, high? } — defaults "Review worthy", "unlikely"/"likely"',
    yAxis: '{ label?, low?, high? } — defaults impact under lens, "low"/"high"',
    quadrantLabels: '{ topRight?, topLeft?, bottomRight?, bottomLeft? } — defaults Examine first / Read closely / Skim / Defer',
    maxItems: 'number — keep the N highest-priority PRs; the remainder is disclosed as a count',
    staggerMs: 'number — between-dot reveal delay (default 200)',
    basisNote: 'string — override the on-artifact triage disclosure; it cannot be removed',
  },
  demo: {
    label: 'Review Priority Matrix',
    content: {
      title: 'Where to look first',
      lens: {
        id: 'security',
        label: 'Security',
        question: 'Could this be exploited or leak?',
      },
      xAxis: { label: 'Review worthy', low: 'Unlikely', high: 'Likely' },
      yAxis: { label: 'Impact if wrong', low: 'Low', high: 'High' },
      items: [
        {
          prNumber: 26,
          title: 'Refuse checks with unjoinable inputs',
          impact: 0.82,
          likelihood: 0.78,
          rationale: 'Input validation on a path that now rejects rather than returning empty.',
          era: 'packages/sidecar',
          files: ['packages/sidecar/src/validate.ts'],
        },
        {
          prNumber: 21,
          title: 'Corpus query surface',
          impact: 0.88,
          likelihood: 0.44,
          rationale: 'Tenancy boundary — userId-first, but every new query is a new place to forget it.',
          era: 'packages/sidecar',
          files: ['apps/server/lib/corpus/queries.ts'],
        },
        {
          prNumber: 33,
          title: 'Surface the corpus in the UI',
          impact: 0.61,
          likelihood: 0.72,
          rationale: 'First externally reachable surface for the indexed data.',
          era: 'apps/server',
          files: ['apps/server/app', 'infra/workers'],
        },
        {
          prNumber: 17,
          title: 'Hosted corpus MCP server',
          impact: 0.55,
          likelihood: 0.3,
          rationale: 'Auth is delegated; the token path itself was not touched.',
          era: 'packages/sidecar',
        },
        {
          prNumber: 12,
          title: 'Entity-map coordinate fixes',
          impact: 0.14,
          likelihood: 0.2,
          rationale: 'Rendering geometry only — no data path.',
          era: 'apps/player',
        },
      ],
      unscored: [{ prNumber: 14, reason: 'no analysis' }],
      staggerMs: 220,
    },
    emphasizeAfter: { target: 'quadrant:topRight', delayMs: 2600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as ReviewPriorityMatrixContent;

    const lens: ReviewLens = c.lens ?? { id: 'unknown', label: 'Review' };
    const lensLabel = lens.label?.trim() || lens.id || 'Review';
    const title = c.title?.trim() || 'Where to look first';
    const xAxisLabel = c.xAxis?.label ?? 'Review worthy';
    const xAxisLow = c.xAxis?.low ?? 'Unlikely';
    const xAxisHigh = c.xAxis?.high ?? 'Likely';
    const yAxisLabel = c.yAxis?.label ?? 'Impact if wrong';
    const yAxisLow = c.yAxis?.low ?? 'Low';
    const yAxisHigh = c.yAxis?.high ?? 'High';
    const quadrants: Required<QuadrantLabels> = {
      ...DEFAULT_QUADRANTS,
      ...(c.quadrantLabels ?? {}),
    };
    const stagger = Math.max(80, c.staggerMs ?? 200);
    const unscored = c.unscored ?? [];

    const { kept, droppedCount } = applyCap(c.items ?? [], c.maxItems);
    const plotted = plotWithCollisions(kept);

    const wrapper = document.createElement('div');
    wrapper.className = `sb-rpm-wrapper ${lensAccentClass(lens.id ?? '')}`;

    const stage = document.createElement('div');
    stage.className = 'sb-rpm-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-rpm-plate';

    // ── Header — eyebrow + the lens chip. The chip is the element that
    // makes two consecutive matrices legible as two questions.
    const header = document.createElement('div');
    header.className = 'sb-rpm-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-rpm-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ / review-priority';
    const lensChip = document.createElement('span');
    lensChip.className = 'cs-badge sb-rpm-lens-chip';
    lensChip.textContent = c.sceneTag ?? `LENS · ${lensLabel.toUpperCase()}`;
    header.append(eyebrow, lensChip);
    plate.appendChild(header);

    // ── Title + the lens question. The question is what gives the axes a
    // stated meaning, so it sits with the title rather than in a footnote.
    const titleWrap = document.createElement('div');
    titleWrap.className = 'sb-rpm-title-wrap';
    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-rpm-title';
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);
    if (lens.question?.trim()) {
      const q = document.createElement('p');
      q.className = 'sb-rpm-question';
      q.textContent = lens.question.trim();
      titleWrap.appendChild(q);
    }
    plate.appendChild(titleWrap);

    // ── Body — SVG plot left, legend right.
    const body = document.createElement('div');
    body.className = 'sb-rpm-body';

    const GUTTER = 12;
    const VB_SIZE = 100;
    const PLOT_MIN = GUTTER;
    const PLOT_MAX = VB_SIZE - GUTTER * 0.5;
    const PLOT_RANGE = PLOT_MAX - PLOT_MIN;
    const HALF = PLOT_RANGE / 2;

    const gridWrap = document.createElement('div');
    gridWrap.className = 'sb-rpm-grid-wrap';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_SIZE} ${VB_SIZE + GUTTER * 0.5}`);
    svg.setAttribute('class', 'sb-rpm-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Quadrant tints. Unlike risk-matrix's warn-on-danger palette, the
    // gradient here runs by *reading priority*: the top-right is the
    // lens accent at its strongest and the bottom-left is nearly bare,
    // so the eye is pulled to where the reviewer should start.
    const quadRects = new Map<QuadrantKey, SVGRectElement>();
    const tintSpecs: Array<{ key: QuadrantKey; x: number; y: number }> = [
      { key: 'topRight', x: PLOT_MIN + HALF, y: PLOT_MIN },
      { key: 'topLeft', x: PLOT_MIN, y: PLOT_MIN },
      { key: 'bottomRight', x: PLOT_MIN + HALF, y: PLOT_MIN + HALF },
      { key: 'bottomLeft', x: PLOT_MIN, y: PLOT_MIN + HALF },
    ];
    for (const t of tintSpecs) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(t.x));
      rect.setAttribute('y', String(t.y));
      rect.setAttribute('width', String(HALF));
      rect.setAttribute('height', String(HALF));
      rect.setAttribute('class', `sb-rpm-quad sb-rpm-quad--${t.key}`);
      svg.appendChild(rect);
      quadRects.set(t.key, rect);
    }

    // Quadrant labels — the reading instruction, one per cell.
    const QLABEL_INSET = 2;
    const qLabelSpecs: Array<{
      key: QuadrantKey; x: number; y: number; anchor: string;
    }> = [
      { key: 'topRight', x: PLOT_MAX - QLABEL_INSET, y: PLOT_MIN + QLABEL_INSET + 3, anchor: 'end' },
      { key: 'topLeft', x: PLOT_MIN + QLABEL_INSET, y: PLOT_MIN + QLABEL_INSET + 3, anchor: 'start' },
      { key: 'bottomRight', x: PLOT_MAX - QLABEL_INSET, y: PLOT_MAX - QLABEL_INSET, anchor: 'end' },
      { key: 'bottomLeft', x: PLOT_MIN + QLABEL_INSET, y: PLOT_MAX - QLABEL_INSET, anchor: 'start' },
    ];
    const quadLabelEls = new Map<QuadrantKey, SVGTextElement>();
    for (const q of qLabelSpecs) {
      const text = quadrants[q.key];
      if (!text) continue;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(q.x));
      t.setAttribute('y', String(q.y));
      t.setAttribute('text-anchor', q.anchor);
      t.setAttribute(
        'class',
        `sb-rpm-quad-label sb-rpm-quad-label--${q.key}`,
      );
      t.textContent = text;
      svg.appendChild(t);
      quadLabelEls.set(q.key, t);
    }

    // Frame + midlines.
    const axisLines: Array<{ x1: number; y1: number; x2: number; y2: number; cls: string }> = [
      { x1: PLOT_MIN, y1: PLOT_MAX, x2: PLOT_MAX, y2: PLOT_MAX, cls: 'sb-rpm-axis' },
      { x1: PLOT_MIN, y1: PLOT_MIN, x2: PLOT_MIN, y2: PLOT_MAX, cls: 'sb-rpm-axis' },
      { x1: PLOT_MIN + HALF, y1: PLOT_MIN, x2: PLOT_MIN + HALF, y2: PLOT_MAX, cls: 'sb-rpm-axis-mid' },
      { x1: PLOT_MIN, y1: PLOT_MIN + HALF, x2: PLOT_MAX, y2: PLOT_MIN + HALF, cls: 'sb-rpm-axis-mid' },
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

    // Axis ticks and names.
    const ticks: Array<{
      x: number; y: number; anchor: string; cls: string; text: string;
      rotate?: { deg: number; cx: number; cy: number };
    }> = [
      { x: PLOT_MIN, y: PLOT_MAX + 6, anchor: 'start', cls: 'sb-rpm-tick', text: xAxisLow },
      { x: PLOT_MAX, y: PLOT_MAX + 6, anchor: 'end', cls: 'sb-rpm-tick', text: xAxisHigh },
      {
        x: PLOT_MIN + HALF, y: PLOT_MAX + 10, anchor: 'middle',
        cls: 'sb-rpm-axis-label', text: xAxisLabel,
      },
      {
        x: PLOT_MIN - 4, y: PLOT_MAX, anchor: 'end', cls: 'sb-rpm-tick',
        text: yAxisLow, rotate: { deg: -90, cx: PLOT_MIN - 4, cy: PLOT_MAX },
      },
      {
        x: PLOT_MIN - 4, y: PLOT_MIN, anchor: 'start', cls: 'sb-rpm-tick',
        text: yAxisHigh, rotate: { deg: -90, cx: PLOT_MIN - 4, cy: PLOT_MIN },
      },
      {
        x: PLOT_MIN - 8, y: PLOT_MIN + HALF, anchor: 'middle',
        cls: 'sb-rpm-axis-label', text: yAxisLabel,
        rotate: { deg: -90, cx: PLOT_MIN - 8, cy: PLOT_MIN + HALF },
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

    // ── Dots. One <g> per PR, badged with the PR number.
    const dotById = new Map<number, SVGGElement>();
    const byQuadrant = new Map<QuadrantKey, PlottedItem[]>();
    for (const item of plotted) {
      const x = PLOT_MIN + item.px * PLOT_RANGE;
      // Y inverted: high impact plots near the top (low screen y).
      const y = PLOT_MIN + (1 - item.py) * PLOT_RANGE;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sb-rpm-dot');
      g.setAttribute('transform', `translate(${x} ${y})`);
      g.dataset.prNumber = String(item.prNumber);
      g.dataset.quadrant = item.quadrant;

      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('class', 'sb-rpm-dot-halo');
      halo.setAttribute('r', '6');
      g.appendChild(halo);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'sb-rpm-dot-core');
      dot.setAttribute('r', '4');
      g.appendChild(dot);

      // The badge is the PR number, where risk-matrix reads "R1". Four
      // characters of mono fits ("#127"); beyond that we drop the hash.
      const idText = document.createElementNS(SVG_NS, 'text');
      idText.setAttribute('class', 'sb-rpm-dot-id');
      idText.setAttribute('text-anchor', 'middle');
      idText.setAttribute('dy', '0.36em');
      const numStr = String(item.prNumber);
      idText.textContent = numStr.length > 3 ? numStr : `#${numStr}`;
      g.appendChild(idText);

      svg.appendChild(g);
      dotById.set(item.prNumber, g);
      const bucket = byQuadrant.get(item.quadrant) ?? [];
      bucket.push(item);
      byQuadrant.set(item.quadrant, bucket);
    }

    gridWrap.appendChild(svg);
    body.appendChild(gridWrap);

    // ── Legend — the readable counterpart, ordered by priority so the
    // list itself reads as a reading order top to bottom. The plot shows
    // the same thing spatially; a viewer who prefers a list is not
    // forced to decode quadrants.
    const legendWrap = document.createElement('div');
    legendWrap.className = 'sb-rpm-legend-wrap';

    const legend = document.createElement('ol');
    legend.className = 'sb-rpm-legend';

    const legendRowById = new Map<number, HTMLElement>();
    const byPriority = [...plotted].sort((a, b) => priorityOf(b) - priorityOf(a));
    for (const item of byPriority) {
      const row = document.createElement('li');
      row.className = 'sb-rpm-legend-row';
      row.dataset.prNumber = String(item.prNumber);
      row.dataset.quadrant = item.quadrant;

      const badge = document.createElement('span');
      badge.className = 'sb-rpm-legend-badge';
      badge.textContent = `#${item.prNumber}`;

      const rowBody = document.createElement('div');
      rowBody.className = 'sb-rpm-legend-body';

      const label = document.createElement('span');
      label.className = 'sb-rpm-legend-label';
      label.textContent = item.title;
      rowBody.appendChild(label);

      if (item.rationale?.trim()) {
        const why = document.createElement('span');
        why.className = 'sb-rpm-legend-why';
        why.textContent = item.rationale.trim();
        rowBody.appendChild(why);
      }

      // The quadrant name on the row is what ties the list back to the
      // plot without the viewer having to find the dot.
      const meta = document.createElement('span');
      meta.className = 'sb-rpm-legend-meta';
      const parts: string[] = [quadrants[item.quadrant]];
      if (item.files?.length) {
        parts.push(
          item.files.length === 1
            ? item.files[0]
            : `${item.files[0]} +${item.files.length - 1}`,
        );
      }
      meta.textContent = parts.join(' · ');
      rowBody.appendChild(meta);

      row.append(badge, rowBody);
      legend.appendChild(row);
      legendRowById.set(item.prNumber, row);
    }

    legendWrap.appendChild(legend);

    if (!plotted.length) {
      // No scoreable PRs is a finding, not an empty plate.
      const empty = document.createElement('p');
      empty.className = 'sb-rpm-empty';
      empty.textContent =
        'No PRs in this window could be scored under this lens.';
      legendWrap.appendChild(empty);
    }

    body.appendChild(legendWrap);
    plate.appendChild(body);

    // ── Footer — the disclosures. Three independent lines, each present
    // only when it has something to say, and the basis note always.
    const footer = document.createElement('div');
    footer.className = 'sb-rpm-footer';

    const basis = document.createElement('span');
    basis.className = 'sb-rpm-basis';
    basis.textContent =
      c.basisNote?.trim() ||
      `Reading order under the ${lensLabel.toLowerCase()} lens — a triage ` +
        `judgment, not a measurement.`;
    footer.appendChild(basis);

    if (unscored.length) {
      const un = document.createElement('span');
      un.className = 'sb-rpm-unscored';
      const listed = unscored
        .map((u) => `#${u.prNumber} (${u.reason})`)
        .join(', ');
      un.textContent = `Not scored: ${listed}`;
      footer.appendChild(un);
    }

    if (droppedCount > 0) {
      const cap = document.createElement('span');
      cap.className = 'sb-rpm-capnote';
      cap.textContent =
        `${droppedCount} lower-priority ${droppedCount === 1 ? 'PR' : 'PRs'} ` +
        `not plotted`;
      footer.appendChild(cap);
    }

    plate.appendChild(footer);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // ── Reveal cascade. Chrome, then the grid, then dots in priority
    // order so the first thing to land is the thing to read first.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleWrap.classList.add('sb-visible'), 240));
    timers.push(window.setTimeout(() => svg.classList.add('sb-visible'), 360));
    timers.push(window.setTimeout(() => footer.classList.add('sb-visible'), 700));

    const perDelay = Math.max(100, Math.floor(stagger));
    byPriority.forEach((item, i) => {
      const t = 520 + i * perDelay;
      timers.push(
        window.setTimeout(() => {
          dotById.get(item.prNumber)?.classList.add('sb-visible');
          legendRowById.get(item.prNumber)?.classList.add('sb-visible');
        }, t),
      );
    });

    // ── Emphasis port. Accent budget = 1: a new emphasis clears the
    // previous one, whether it was a PR or a whole quadrant.
    const pulseTimers = new Map<Element, number>();
    let active: Element[] = [];

    const clearActive = () => {
      for (const el of active) {
        el.classList.remove('sb-emphasize');
        const t = pulseTimers.get(el);
        if (t != null) {
          window.clearTimeout(t);
          pulseTimers.delete(el);
        }
      }
      active = [];
    };

    /** Light a set of elements for 1.4s, then self-revert (§6). */
    const pulse = (els: Element[]) => {
      if (!els.length) return;
      clearActive();
      for (const el of els) {
        el.classList.add('sb-emphasize');
        const t = window.setTimeout(() => {
          el.classList.remove('sb-emphasize');
          pulseTimers.delete(el);
          active = active.filter((a) => a !== el);
        }, 1400);
        pulseTimers.set(el, t);
      }
      active = [...els];
    };

    const isQuadrantKey = (s: string): s is QuadrantKey =>
      s === 'topRight' || s === 'topLeft' ||
      s === 'bottomRight' || s === 'bottomLeft';

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

        // `reveal:` may prefix any other verb, so peel it first.
        let rest = target.trim();
        let reveal = false;
        if (rest.startsWith('reveal:')) {
          reveal = true;
          rest = rest.slice('reveal:'.length);
        }

        // quadrant:<key> — light one cell and every dot inside it.
        if (rest.startsWith('quadrant:')) {
          const key = rest.slice('quadrant:'.length);
          if (!isQuadrantKey(key)) return;
          const members = byQuadrant.get(key) ?? [];
          if (reveal) {
            for (const m of members) {
              dotById.get(m.prNumber)?.classList.add('sb-visible');
              legendRowById.get(m.prNumber)?.classList.add('sb-visible');
            }
            return;
          }
          const els: Element[] = [];
          const rect = quadRects.get(key);
          const qLabel = quadLabelEls.get(key);
          if (rect) els.push(rect);
          if (qLabel) els.push(qLabel);
          for (const m of members) {
            // A quadrant beat implies its dots are on screen — otherwise
            // "these four are where I'd start" lights an empty cell.
            dotById.get(m.prNumber)?.classList.add('sb-visible');
            legendRowById.get(m.prNumber)?.classList.add('sb-visible');
            const d = dotById.get(m.prNumber);
            const r = legendRowById.get(m.prNumber);
            if (d) els.push(d);
            if (r) els.push(r);
          }
          pulse(els);
          return;
        }

        // pr:<number> or a bare number.
        const numPart = rest.startsWith('pr:') ? rest.slice('pr:'.length) : rest;
        const prNumber = Number.parseInt(numPart, 10);
        if (!Number.isFinite(prNumber)) return;

        const dot = dotById.get(prNumber);
        const row = legendRowById.get(prNumber);
        if (!dot || !row) return;

        if (reveal) {
          dot.classList.add('sb-visible');
          row.classList.add('sb-visible');
          return;
        }

        dot.classList.add('sb-visible');
        row.classList.add('sb-visible');
        pulse([dot, row]);
      },
    };
  },
};

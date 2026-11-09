import type { Template, TemplateHandle } from './registry';

/**
 * era-timeline — the spine of a series explainer. A dated horizontal axis
 * with one tick per PR, grouped into labelled era bands. This is the
 * template that makes a series feel like a series rather than a playlist,
 * and it is the scene the narration returns to between chapters.
 *
 * Why not step-journey: that models an ordered *process* with uniform
 * steps. This models a dated *axis* with variable density — the gaps
 * between ticks carry information (a quiet week looks quiet), and ticks
 * cluster where the work clustered. Uniform spacing would erase the one
 * thing a timeline is for.
 *
 * Layout (SVG in a fixed unit-space viewBox, DOM legend below):
 *   1. Header strip   — eyebrow + scene tag.
 *   2. Title row      — italic display headline.
 *   3. Era band row   — one labelled band per era, width proportional to
 *                       its span, each carrying its own accent.
 *   4. Axis + ticks   — the axis line with a tick per PR, positioned by
 *                       date. Flagged ticks (unanalyzed PRs) render as a
 *                       hollow ring, never omitted.
 *   5. Date rail      — from/to dates at the axis ends.
 *   6. Legend         — one row per era: accent swatch, label, PR count,
 *                       dominant area.
 *
 * Coordinate space (TEMPLATE-SPEC §9d): the SVG uses a FIXED unit-space
 * viewBox (0 0 1000 220) with preserveAspectRatio, exactly as risk-matrix
 * does. Nothing is measured — no getBoundingClientRect, no clientWidth
 * read, no host-scale normalization — so every stroke width and font size
 * inside the SVG is authored in the same space as the viewBox and scales
 * uniformly with the host transform by construction. This is the cheapest
 * way to be §9d-correct: don't measure at all.
 *
 * Honesty constraints built into the layout rather than left to prose:
 *   - Ticks are positioned by DATE, not by index. Evenly-spacing them
 *     would invent a tempo the work did not have. When dates are absent
 *     or unparseable the template falls back to index spacing and says so
 *     via the axis label, rather than silently implying dated precision.
 *   - `flagged` ticks (a PR in range with no analysis) render as hollow
 *     rings on the axis. The gap stays visible in the spine; it is not
 *     the title card's job alone to disclose it.
 *   - Era bands are drawn from computed from/to dates. The template never
 *     infers a boundary — if two eras overlap or leave a hole, that is
 *     drawn as given, because smoothing it would hide a query-layer bug.
 *
 * Density: ticks are laid out by date, so a dense window collides. Ticks
 * within MIN_TICK_GAP unit-space of each other are pushed apart just
 * enough to stay individually visible, in one left-to-right pass. The
 * nudge is small (sub-day at typical scales) and preserves ordering and
 * the qualitative clustering read — same discipline as risk-matrix's
 * collision nudge: never lie about position, just stay legible.
 *
 * Fill mode: full-bleed.
 * Width token: max via var(--sb-stage-w-max); 16:9 plate like the openers.
 * Calm: one-shot staggered reveal (bands, then ticks left to right), no
 * continuous motion.
 *
 * emphasize(target):
 *   "era:<label>"  → light the band and its legend row
 *   "pr:<number>"  → pop the tick (accepts "pr:33", "pr:#33", or "33")
 *   "axis"         → pulse the axis + date rail
 */

interface Era {
  label: string;
  /** ISO date or display string — the band's left edge. */
  from: string;
  /** ISO date or display string — the band's right edge. */
  to: string;
  prCount?: number;
  /** "apps/player", "packages/sidecar" — the computed dominant area. */
  dominantArea?: string;
  /** 'primary' | 'secondary' | 'accent' | a css color. Cycles when absent. */
  accent?: string;
}

interface Tick {
  prNumber: string | number;
  /** ISO date or display string. */
  at?: string;
  title?: string;
  /** 0–1 relative heft; scales tick height. Absent reads as 0.5. */
  weight?: number;
  /** True when the PR is in range but has no usable analysis. */
  flagged?: boolean;
}

interface EraTimelineContent {
  title?: string;
  eras?: Era[];
  ticks: Tick[];
  /** { from, to } — the axis extent. Derived from ticks/eras when absent. */
  axis?: { from?: string; to?: string };
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/* Unit-space viewBox. Fixed — see the §9d note in the header doc. */
const VB_W = 1000;
const VB_H = 220;
const PAD_X = 28;
const BAND_Y = 16;
const BAND_H = 46;
const AXIS_Y = 132;
const PLOT_MIN = PAD_X;
const PLOT_MAX = VB_W - PAD_X;
const PLOT_RANGE = PLOT_MAX - PLOT_MIN;
/** Minimum unit-space separation between two tick centres. */
const MIN_TICK_GAP = 9;
/** Tick half-heights at weight 0 and weight 1. */
const TICK_H_MIN = 13;
const TICK_H_MAX = 34;

const ACCENT_CYCLE = ['palette.primary', 'palette.secondary', 'palette.accent'];

/** Resolve the three producer-facing aliases to CSS vars; pass through
 *  anything else so a caller can hand us a literal colour. Mirrors
 *  palette.ts's resolveColor contract without importing it, because this
 *  template only ever needs the three aliases. */
function resolveAccent(raw: string | undefined, i: number): string {
  const key = raw ?? ACCENT_CYCLE[i % ACCENT_CYCLE.length];
  switch (key) {
    case 'palette.primary':
      return 'var(--cs-accent-cool)';
    case 'palette.secondary':
      return 'var(--cs-accent-ok)';
    case 'palette.accent':
      return 'var(--cs-accent-warn)';
    default:
      return key;
  }
}

/** ms since epoch, or null when unparseable. */
function ts(input: string | undefined): number | null {
  if (!input) return null;
  const d = new Date(String(input));
  return isNaN(d.getTime()) ? null : d.getTime();
}

function fmtShortDate(input: string | undefined): string {
  if (!input) return '—';
  const d = new Date(String(input));
  if (isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function normalizePr(raw: string | number | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '#—';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/** "pr:#33" / "pr:33" / "33" → "33". Used for emphasize target matching. */
function prKey(raw: string | number | undefined): string {
  return String(raw ?? '').trim().replace(/^#/, '');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export const eraTimelineTemplate: Template = {
  id: 'era-timeline',
  version: '1.0.0',
  description:
    'The spine of a series explainer: a dated horizontal axis with one ' +
    'tick per PR, grouped into labelled era bands coloured by dominant ' +
    'area. Ticks are positioned by date so gaps and clustering carry ' +
    'information; PRs with no analysis render as hollow rings rather ' +
    'than being dropped. Legend lists each era with its PR count and area.',
  slots: {
    title: 'string — optional headline (default "How the work moved")',
    eras:
      '{ label, from, to, prCount?, dominantArea?, accent? }[] — labelled ' +
      'bands; accent is palette.primary|secondary|accent or a css color',
    ticks:
      '{ prNumber, at?, title?, weight?, flagged? }[] — one per PR; `at` ' +
      'is an ISO date (positions the tick), `flagged` marks an ' +
      'unanalyzed PR as a hollow ring',
    axis: '{ from?, to? } — axis extent; derived from ticks when omitted',
    staggerMs: 'number — total tick reveal window (default 900)',
  },
  demo: {
    label: 'Era Timeline',
    content: {
      title: 'How the work moved',
      axis: { from: '2026-07-20', to: '2026-08-14' },
      eras: [
        {
          label: 'Viewer & template polish',
          from: '2026-07-20',
          to: '2026-07-31',
          prCount: 7,
          dominantArea: 'apps/player',
          accent: 'palette.primary',
        },
        {
          label: 'The Sidecar build-out',
          from: '2026-08-05',
          to: '2026-08-13',
          prCount: 14,
          dominantArea: 'packages/sidecar',
          accent: 'palette.secondary',
        },
        {
          label: 'Surfacing it',
          from: '2026-08-14',
          to: '2026-08-14',
          prCount: 2,
          dominantArea: 'apps/server',
          accent: 'palette.accent',
        },
      ],
      ticks: [
        { prNumber: 10, at: '2026-07-20', title: 'Entity-map coordinate fix', weight: 0.4 },
        { prNumber: 11, at: '2026-07-22', title: 'Provenance rail', weight: 0.5 },
        { prNumber: 12, at: '2026-07-24', title: 'PR URL support', weight: 0.3 },
        { prNumber: 13, at: '2026-07-27', title: 'Template spec pass', weight: 0.45 },
        { prNumber: 14, at: '2026-07-28', title: 'Not analyzed', flagged: true },
        { prNumber: 15, at: '2026-07-30', title: 'Palette consolidation', weight: 0.5 },
        { prNumber: 16, at: '2026-07-31', title: 'Calm code-cloud', weight: 0.35 },
        { prNumber: 17, at: '2026-08-05', title: 'Sidecar Step 1', weight: 0.8 },
        { prNumber: 21, at: '2026-08-07', title: 'Corpus query surface', weight: 0.9 },
        { prNumber: 22, at: '2026-08-08', title: 'Hosted corpus MCP server', weight: 0.85 },
        { prNumber: 26, at: '2026-08-10', title: 'Refuse unjoinable checks', weight: 0.6 },
        { prNumber: 30, at: '2026-08-12', title: 'The skill', weight: 0.7 },
        { prNumber: 31, at: '2026-08-13', title: 'Ledger validation', weight: 0.55 },
        { prNumber: 32, at: '2026-08-14', title: 'Clean-machine gate', weight: 0.75 },
        { prNumber: 33, at: '2026-08-14', title: 'Snapshot counts in the UI', weight: 0.5 },
      ],
      staggerMs: 900,
    },
    emphasizeAfter: { target: 'era:The Sidecar build-out', delayMs: 3200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as EraTimelineContent;

    const title = c.title?.trim() || 'How the work moved';
    const eras = Array.isArray(c.eras) ? c.eras.filter(Boolean) : [];
    const ticksIn = Array.isArray(c.ticks) ? c.ticks.filter(Boolean) : [];
    const stagger = Math.max(200, c.staggerMs ?? 900);

    // ── Axis extent ──────────────────────────────────────────────────
    // Prefer the explicit axis, then the era bounds, then the ticks.
    // Everything downstream is a projection into [PLOT_MIN, PLOT_MAX].
    const candidateFrom: number[] = [];
    const candidateTo: number[] = [];
    const axisFromTs = ts(c.axis?.from);
    const axisToTs = ts(c.axis?.to);
    if (axisFromTs != null) candidateFrom.push(axisFromTs);
    if (axisToTs != null) candidateTo.push(axisToTs);
    for (const e of eras) {
      const f = ts(e.from);
      const t = ts(e.to);
      if (f != null) candidateFrom.push(f);
      if (t != null) candidateTo.push(t);
    }
    for (const t of ticksIn) {
      const a = ts(t.at);
      if (a != null) {
        candidateFrom.push(a);
        candidateTo.push(a);
      }
    }

    const axisMin = candidateFrom.length ? Math.min(...candidateFrom) : null;
    const axisMaxRaw = candidateTo.length ? Math.max(...candidateTo) : null;
    // A single-day window has zero span; widen it so the projection
    // doesn't divide by zero and every tick doesn't stack at PLOT_MIN.
    const axisMax =
      axisMin != null && axisMaxRaw != null && axisMaxRaw <= axisMin
        ? axisMin + 86_400_000
        : axisMaxRaw;
    /** True when we have a real dated axis; false → index fallback. */
    const dated =
      axisMin != null &&
      axisMax != null &&
      axisMax > axisMin &&
      ticksIn.some((t) => ts(t.at) != null);

    const project = (t: number): number =>
      PLOT_MIN + ((t - axisMin!) / (axisMax! - axisMin!)) * PLOT_RANGE;

    // ── Tick positions ───────────────────────────────────────────────
    // Dated when we can, index-spaced when we can't. A tick missing its
    // own date inside an otherwise dated axis falls back to its index
    // position rather than being dropped — losing a PR from the spine
    // would be a silent gap, which is the thing this template exists to
    // avoid.
    type Placed = Tick & { x: number; key: string };
    const placed: Placed[] = ticksIn.map((t, i) => {
      const idxX =
        ticksIn.length > 1
          ? PLOT_MIN + (i / (ticksIn.length - 1)) * PLOT_RANGE
          : PLOT_MIN + PLOT_RANGE / 2;
      const at = ts(t.at);
      const x = dated && at != null ? project(at) : idxX;
      return { ...t, x, key: prKey(t.prNumber) };
    });

    // Collision pass — one left-to-right sweep pushing any tick that
    // lands within MIN_TICK_GAP of its predecessor just far enough right
    // to stay individually visible. Ordering is preserved; the nudge is
    // small enough that the clustering read survives.
    placed.sort((a, b) => a.x - b.x);
    for (let i = 1; i < placed.length; i++) {
      const gap = placed[i].x - placed[i - 1].x;
      if (gap < MIN_TICK_GAP) placed[i].x = placed[i - 1].x + MIN_TICK_GAP;
    }
    // If the sweep pushed the tail past the right edge, slide the whole run
    // left so it ends at PLOT_MAX, then compress only if it still does not
    // fit. Sliding first is what saves the degenerate case where every tick
    // shares one date: the sweep lays them out from PLOT_MIN rightward, so
    // a run that starts at the right edge just needs moving, not squeezing.
    //
    // Compressing without sliding would divide by a span that equals the
    // overflow and collapse every tick onto one point — 40 PRs rendering as
    // a single mark, which is exactly the lie this layout exists to avoid.
    if (placed.length > 1) {
      const tail = placed[placed.length - 1].x;
      if (tail > PLOT_MAX) {
        const shift = Math.min(tail - PLOT_MAX, placed[0].x - PLOT_MIN);
        if (shift > 0) for (const p of placed) p.x -= shift;
      }
      // Still overflowing means the run is genuinely wider than the plot
      // (more ticks than PLOT_RANGE / MIN_TICK_GAP can seat). Compress
      // uniformly; ticks get closer than MIN_TICK_GAP but stay distinct and
      // ordered, which beats clipping the tail off the axis.
      const span = placed[placed.length - 1].x - placed[0].x;
      const overflow = placed[placed.length - 1].x - PLOT_MAX;
      if (overflow > 0 && span > 0) {
        const scale = Math.max(0, (span - overflow) / span);
        const originX = placed[0].x;
        for (const p of placed) p.x = originX + (p.x - originX) * scale;
      }
    }

    // ── DOM / SVG construction ───────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'sb-eratl-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-eratl-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-eratl-plate';

    const header = document.createElement('div');
    header.className = 'sb-eratl-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-eratl-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 01 / era-timeline';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-eratl-tag';
    sceneTag.textContent = c.sceneTag ?? 'ERAS';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-eratl-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-eratl-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'sb-eratl-chart-wrap';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'sb-eratl-svg');

    // Era bands. Drawn from the era's own from/to — never inferred, so a
    // gap or overlap in the query layer's output stays visible.
    const bandEls: Array<{ label: string; g: SVGGElement }> = [];
    eras.forEach((era, i) => {
      const accent = resolveAccent(era.accent, i);
      const f = ts(era.from);
      const t = ts(era.to);

      let x0: number;
      let x1: number;
      if (dated && f != null && t != null) {
        x0 = project(f);
        x1 = project(t);
      } else {
        // Undated fallback: split the axis evenly across the eras so the
        // band row still communicates sequence and relative count.
        const w = PLOT_RANGE / Math.max(1, eras.length);
        x0 = PLOT_MIN + i * w;
        x1 = x0 + w;
      }
      // A single-day era projects to zero width; give it a visible floor.
      const MIN_BAND_W = 26;
      if (x1 - x0 < MIN_BAND_W) {
        const mid = (x0 + x1) / 2;
        x0 = mid - MIN_BAND_W / 2;
        x1 = mid + MIN_BAND_W / 2;
      }
      x0 = Math.max(PLOT_MIN, x0);
      x1 = Math.min(PLOT_MAX, x1);

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sb-eratl-band');
      g.dataset.eraLabel = era.label;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x0));
      rect.setAttribute('y', String(BAND_Y));
      rect.setAttribute('width', String(Math.max(1, x1 - x0)));
      rect.setAttribute('height', String(BAND_H));
      rect.setAttribute('rx', '8');
      rect.setAttribute('class', 'sb-eratl-band-rect');
      rect.setAttribute('fill', accent);
      g.appendChild(rect);

      // Band label. Clipped to the band so a long era name in a narrow
      // band can't spill across its neighbour.
      const clipId = `sb-eratl-clip-${i}`;
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      const clipRect = document.createElementNS(SVG_NS, 'rect');
      clipRect.setAttribute('x', String(x0));
      clipRect.setAttribute('y', String(BAND_Y));
      clipRect.setAttribute('width', String(Math.max(1, x1 - x0)));
      clipRect.setAttribute('height', String(BAND_H));
      clip.appendChild(clipRect);
      g.appendChild(clip);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x0 + 10));
      label.setAttribute('y', String(BAND_Y + 20));
      label.setAttribute('class', 'sb-eratl-band-label');
      label.setAttribute('clip-path', `url(#${clipId})`);
      label.textContent = era.label;
      g.appendChild(label);

      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('x', String(x0 + 10));
      sub.setAttribute('y', String(BAND_Y + 37));
      sub.setAttribute('class', 'sb-eratl-band-sub');
      sub.setAttribute('clip-path', `url(#${clipId})`);
      const countPart =
        era.prCount != null
          ? `${era.prCount} ${era.prCount === 1 ? 'PR' : 'PRs'}`
          : '';
      sub.textContent = [countPart, era.dominantArea]
        .filter(Boolean)
        .join(' · ');
      g.appendChild(sub);

      // Drop rule tying the band to the axis, so the eye connects a band
      // to the ticks beneath it.
      const rule = document.createElementNS(SVG_NS, 'line');
      rule.setAttribute('x1', String(x0));
      rule.setAttribute('y1', String(BAND_Y + BAND_H));
      rule.setAttribute('x2', String(x0));
      rule.setAttribute('y2', String(AXIS_Y));
      rule.setAttribute('class', 'sb-eratl-band-rule');
      rule.setAttribute('stroke', accent);
      g.appendChild(rule);

      svg.appendChild(g);
      bandEls.push({ label: era.label, g });
    });

    // Axis line.
    const axisG = document.createElementNS(SVG_NS, 'g');
    axisG.setAttribute('class', 'sb-eratl-axis');
    const axisLine = document.createElementNS(SVG_NS, 'line');
    axisLine.setAttribute('x1', String(PLOT_MIN));
    axisLine.setAttribute('y1', String(AXIS_Y));
    axisLine.setAttribute('x2', String(PLOT_MAX));
    axisLine.setAttribute('y2', String(AXIS_Y));
    axisLine.setAttribute('class', 'sb-eratl-axis-line');
    axisG.appendChild(axisLine);

    // Date rail — the axis ends. When the axis is not dated the rail says
    // so, rather than printing dates the layout did not honour.
    const railFrom = document.createElementNS(SVG_NS, 'text');
    railFrom.setAttribute('x', String(PLOT_MIN));
    railFrom.setAttribute('y', String(VB_H - 6));
    railFrom.setAttribute('class', 'sb-eratl-rail');
    railFrom.textContent = dated
      ? fmtShortDate(c.axis?.from ?? new Date(axisMin!).toISOString())
      : 'in order';
    axisG.appendChild(railFrom);

    const railTo = document.createElementNS(SVG_NS, 'text');
    railTo.setAttribute('x', String(PLOT_MAX));
    railTo.setAttribute('y', String(VB_H - 6));
    railTo.setAttribute('text-anchor', 'end');
    railTo.setAttribute('class', 'sb-eratl-rail');
    railTo.textContent = dated
      ? fmtShortDate(c.axis?.to ?? new Date(axisMax!).toISOString())
      : 'no dates in payload';
    axisG.appendChild(railTo);
    svg.appendChild(axisG);

    // Ticks. Height scales with weight; flagged ticks are hollow rings on
    // the axis with no stem, so a gap reads as absence rather than as a
    // low-weight PR.
    const tickEls = new Map<string, SVGGElement>();
    for (const p of placed) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute(
        'class',
        `sb-eratl-tick${p.flagged ? ' sb-eratl-tick--flagged' : ''}`,
      );
      g.dataset.prKey = p.key;

      if (p.flagged) {
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', String(p.x));
        ring.setAttribute('cy', String(AXIS_Y));
        ring.setAttribute('r', '5.5');
        ring.setAttribute('class', 'sb-eratl-tick-ring');
        g.appendChild(ring);
      } else {
        const h = TICK_H_MIN + clamp01(p.weight ?? 0.5) * (TICK_H_MAX - TICK_H_MIN);
        const stem = document.createElementNS(SVG_NS, 'line');
        stem.setAttribute('x1', String(p.x));
        stem.setAttribute('y1', String(AXIS_Y));
        stem.setAttribute('x2', String(p.x));
        stem.setAttribute('y2', String(AXIS_Y - h));
        stem.setAttribute('class', 'sb-eratl-tick-stem');
        g.appendChild(stem);

        const cap = document.createElementNS(SVG_NS, 'circle');
        cap.setAttribute('cx', String(p.x));
        cap.setAttribute('cy', String(AXIS_Y - h));
        cap.setAttribute('r', '4');
        cap.setAttribute('class', 'sb-eratl-tick-cap');
        g.appendChild(cap);
      }

      // PR number under the axis, rotated so a dense run stays readable.
      const num = document.createElementNS(SVG_NS, 'text');
      num.setAttribute('x', String(p.x));
      num.setAttribute('y', String(AXIS_Y + 16));
      num.setAttribute('text-anchor', 'end');
      num.setAttribute(
        'transform',
        `rotate(-52 ${p.x} ${AXIS_Y + 16})`,
      );
      num.setAttribute('class', 'sb-eratl-tick-num');
      num.textContent = normalizePr(p.prNumber);
      g.appendChild(num);

      svg.appendChild(g);
      tickEls.set(p.key, g);
    }

    chartWrap.appendChild(svg);
    body.appendChild(chartWrap);

    // Legend — one row per era. Carries the counts and areas at readable
    // DOM type rather than inside the SVG, where a narrow band would
    // shrink them below legibility.
    const legendRows = new Map<string, HTMLElement>();
    let legend: HTMLElement | null = null;
    if (eras.length) {
      legend = document.createElement('div');
      legend.className = 'sb-eratl-legend';
      eras.forEach((era, i) => {
        const accent = resolveAccent(era.accent, i);
        const row = document.createElement('div');
        row.className = 'sb-eratl-legend-row';
        row.style.setProperty('--sb-eratl-accent', accent);

        const swatch = document.createElement('span');
        swatch.className = 'sb-eratl-legend-swatch';

        const label = document.createElement('span');
        label.className = 'sb-eratl-legend-label';
        label.textContent = era.label;

        const meta = document.createElement('span');
        meta.className = 'sb-eratl-legend-meta';
        const parts: string[] = [];
        if (era.prCount != null) {
          parts.push(`${era.prCount} ${era.prCount === 1 ? 'PR' : 'PRs'}`);
        }
        if (era.dominantArea) parts.push(era.dominantArea);
        meta.textContent = parts.join(' · ');

        row.append(swatch, label, meta);
        legend!.appendChild(row);
        legendRows.set(era.label, row);
      });
      body.appendChild(legend);
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // ── Reveal cascade ───────────────────────────────────────────────
    // Header/title, then bands, then ticks left to right, then legend.
    // Ticks share one stagger budget so a 50-PR window still finishes
    // before the producer's first likely emphasize beat.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 240));

    bandEls.forEach((b, i) => {
      timers.push(
        window.setTimeout(
          () => b.g.classList.add('sb-visible'),
          380 + i * 140,
        ),
      );
    });

    const bandsDone = 380 + bandEls.length * 140;
    const perTick = Math.max(18, Math.floor(stagger / Math.max(1, placed.length)));
    placed.forEach((p, i) => {
      const g = tickEls.get(p.key);
      if (!g) return;
      timers.push(
        window.setTimeout(() => g.classList.add('sb-visible'), bandsDone + i * perTick),
      );
    });

    if (legend) {
      const legendAt = bandsDone + placed.length * perTick + 120;
      timers.push(
        window.setTimeout(() => legend!.classList.add('sb-visible'), legendAt),
      );
    }

    // ── Emphasize ────────────────────────────────────────────────────
    // "era:<label>" lights the band and its legend row together; the two
    // are one idea shown twice, so they pulse as a pair.
    let activeEls: HTMLElement[] | SVGElement[] = [];
    let activeTimer: number | null = null;

    const clearActive = () => {
      for (const el of activeEls as Array<Element>) {
        el.classList.remove('sb-emphasize');
      }
      activeEls = [];
      if (activeTimer != null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
    };

    const light = (els: Array<Element | null | undefined>) => {
      const present = els.filter(Boolean) as Element[];
      if (!present.length) return;
      clearActive();
      for (const el of present) el.classList.add('sb-emphasize');
      activeEls = present as unknown as HTMLElement[];
      activeTimer = window.setTimeout(() => {
        for (const el of present) el.classList.remove('sb-emphasize');
        activeEls = [];
        activeTimer = null;
      }, 1500);
    };

    return {
      dismiss: () => {
        clearActive();
        for (const t of timers) window.clearTimeout(t);
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const raw = String(target ?? '').trim();
        if (!raw) return;

        if (raw.startsWith('era:')) {
          const label = raw.slice(4);
          const band = bandEls.find((b) => b.label === label);
          light([band?.g, legendRows.get(label)]);
          return;
        }
        if (raw === 'axis') {
          light([axisG]);
          return;
        }
        // "pr:33", "pr:#33", or a bare "33" — the spec (§6) allows either
        // prefixed or bare targets, so accept both rather than making the
        // producer guess.
        const key = prKey(raw.startsWith('pr:') ? raw.slice(3) : raw);
        const tick = tickEls.get(key);
        if (tick) light([tick]);
      },
    };
  },
};

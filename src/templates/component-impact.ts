import type { Template, TemplateHandle } from './registry';

/**
 * component-impact — relative impact of each component across a series,
 * as a rotating isometric city: baseline volume with the series' change
 * stacked on top of it.
 *
 * The visual argument, from
 * [3D-VISUALIZATION-SPEC.md](../../../../docs/active_plans/3D-VISUALIZATION-SPEC.md):
 * a software system read as a city, where districts are modules, blocks are
 * components, and **height carries accumulated history**. The prototype
 * (`Fable/prototype/`) established the metaphor with `h = 0.8 + changes * 1.15`
 * — a viewer reads where the system has been living before parsing a single
 * label. This template narrows that to one question: for this window of work,
 * how much did each component change *relative to what was already there*?
 *
 * So every block is two stacked volumes:
 *
 *   - **Baseline** — what the component was before the window. Muted, solid.
 *   - **Change** — what this series added on top. Accented, and the thing
 *     that animates.
 *
 * That stacking is why this template is dimensional rather than a bar chart.
 * A bar chart can show change or total, and a stacked bar can show both, but
 * neither shows *proportion at a glance across many components* the way a
 * skyline does — a small delta on a tall tower and a large delta on a short
 * one read differently in an instant, which is exactly the comparison
 * "relative impact" asks for.
 *
 * ── Why SVG and not Stage3D ────────────────────────────────────────────
 *
 * This renders a real 3D projection in SVG rather than through
 * `presenter.stage3d`, and reason 2 below is the whole of the argument.
 *
 *  1. ~~**`stage3d` is null in every current host.**~~ **False, corrected
 *     2026-08-30.** `react/Presentation.tsx` constructs the Presenter with a
 *     `stage3dHostRef`, and every host routes through it — the workbench
 *     (`App.tsx`) and the viewer (`Viewer.tsx`) included. So a Stage3D
 *     template would render a real stage, not an empty one. Recorded rather
 *     than deleted because the claim had spread: TEMPLATE-SPEC §9e stated it
 *     too, and this comment cited it as load-bearing, so a reader who found
 *     it here could reasonably carry it somewhere new.
 *  2. **TEMPLATE-SPEC §9b already ruled on this.** `flow-diagram` was
 *     rewritten from Three.js to SVG because WebGL edges become sub-pixel
 *     ghosts at small embed scale while DOM/SVG labels stay crisp, and the
 *     standing guidance is "default to SVG + DOM for diagrams; reach for
 *     Stage3D only when the visual literally needs the third dimension."
 *     The third dimension here is genuinely the message (stacked volume),
 *     but an axonometric projection delivers it without a rasterizer that
 *     degrades — and gets `object-fit: contain` free from `viewBox`.
 *
 * The choice stands on reason 2 alone, which is a rendering-quality argument
 * and does not depend on whether a 3D host exists.
 *
 * The projection is a standard axonometric: a point (x, y, z) in world space
 * lands at (x·cos θ − z·cos θ, y − x·sin θ − z·sin θ) scaled per-axis. Only
 * θ (the yaw) animates, which is what keeps the rotation a single cheap
 * recompute per frame rather than a scene graph update.
 *
 * ── Coordinate space (TEMPLATE-SPEC §9d) ───────────────────────────────
 *
 * Fixed unit-space `viewBox` (1000×560) with `preserveAspectRatio`, following
 * `risk-matrix`. The template measures NOTHING — no
 * `getBoundingClientRect`, no `clientWidth` read, no host-scale
 * normalization — so every numeric attribute it writes lives in the same
 * space as the viewBox and scales uniformly with the host transform by
 * construction. §9d's screen-px trap is structurally unreachable here.
 *
 * ── Animation ──────────────────────────────────────────────────────────
 *
 * Deliberately limited to two moves, in order:
 *
 *  1. **Rotate to view.** One yaw sweep from `fromAngle` to `toAngle` that
 *     settles and stops. This is what makes the scene read as dimensional —
 *     a static axonometric is ambiguous about depth until it moves once —
 *     and it is bounded, not an idle orbit. Per TEMPLATE-SPEC §4,
 *     continuous motion is avoided unless the template name implies it.
 *  2. **Growth of the change.** The change volume rises from zero to full
 *     height on top of its baseline.
 *
 * **Growth is the producer's emphasis hook, not an autoplay.** `emphasize`
 * is what triggers it, so the narration decides when the change appears —
 * "and here is what these twenty PRs did to it" lands on the beat rather
 * than three seconds after mount. `growthMode` controls the default:
 *
 *   - `'on-emphasis'` (default) — baselines settle, change volumes stay at
 *     zero until a beat calls for them. `emphasize('grow')` grows all of
 *     them; `emphasize('grow:<id>')` grows one.
 *   - `'auto'` — the growth runs once after the rotation, for hosts with no
 *     producer driving beats (the workbench demo uses this so the template
 *     is legible without wiring a beat).
 *
 * Because the reduced-motion / capture context cannot rely on JS timers
 * having fired, both moves are pre-resolved there: the scene renders at
 * `toAngle` with change volumes at full height, so the first captured frame
 * is the finished skyline rather than a bare baseline.
 *
 * ── Honesty constraints ────────────────────────────────────────────────
 *
 *  - **Height is linear in the unit the caller passes, never rescaled per
 *    block.** Every block shares one world-units-per-unit scale, so two
 *    blocks of equal height represent equal magnitude. Normalizing each
 *    block to its own maximum would make every component look equally
 *    changed, which is the opposite of "relative impact".
 *  - **`baseline: 0` is drawn as a floor plate, not as nothing.** A
 *    component created during the window has no baseline, and that is a
 *    fact worth seeing — it renders as a change volume sitting directly on
 *    the ground with a `new` marker, distinguishable from a component that
 *    merely has a short baseline.
 *  - **Truncation is disclosed.** `maxBlocks` keeps the largest-change
 *    components and states how many were dropped, plus their combined
 *    change, so the skyline never implies it is the whole system.
 *  - **The unit is named on the artifact.** `unitLabel` is rendered in the
 *    legend. "42" means nothing without knowing whether it counts lines,
 *    touches, or PRs, and the caller knows which.
 *
 * ── Layout ─────────────────────────────────────────────────────────────
 *
 * Cell spacing is deliberately generous (`CELL` well above `FOOT`) because
 * the failure mode of a tight grid is not just a cramped skyline — it is
 * block labels overprinting each other into an unreadable smear. Three
 * passes keep that true at any block count:
 *
 *  0. **A viewBox wider than the plate.** The plate is 16:9, but the scene
 *     sits in the middle row of a three-row grid (title above, legend
 *     below), so its box is shorter than the plate and therefore *wider*
 *     than 16:9. A 16:9 viewBox letterboxes into that box and throws away
 *     about a fifth of the width before anything is even drawn.
 *  1. **Fit to frame.** After placement, the projected ground footprint is
 *     measured and the world x/z scaled so the scene fills the viewBox —
 *     shrinking a dense grid, and growing a two-block scene up to a capped
 *     1.7× so it does not sit as a small clump in an empty frame. Only x/z
 *     scale; tower heights stay on their own shared scale so "equal height
 *     means equal magnitude" never depends on block count.
 *  2. **Vertical re-centre.** Grid rows extend downward from the origin, so
 *     a fixed origin hangs a deep grid off the bottom edge. The origin is
 *     placed from the scene's measured span — deepest ground to highest
 *     tower cap plus label headroom.
 *  3. **Label cull.** Per frame, labels are visited biggest-change-first
 *     and any that would overlap an already-placed one is hidden. Fewer
 *     names beats illegible ones, and the component this window moved most
 *     is the one guaranteed to keep its label. Per frame rather than once,
 *     because label positions move with both the yaw and the growth.
 *
 * Fill mode: full-bleed. Calm: two bounded moves, then still.
 *
 * emphasize(target):
 *   "grow"          → grow every change volume (the main beat)
 *   "grow:<id>"     → grow one component's change volume
 *   "<id>"          → pulse a block (and grow it, so a beat naming a
 *                     component always makes its change visible)
 *   "district:<n>"  → pulse a district plate and its blocks
 *   "reset"         → collapse change volumes back to zero
 */

interface ImpactBlock {
  /** Stable id the producer uses as an emphasize target. */
  id: string;
  label: string;
  /** Size before the window. 0 means the component is new. */
  baseline: number;
  /** How much this window changed it. */
  change: number;
  /** Optional grouping — becomes a district plate. */
  district?: string;
}

interface ComponentImpactContent {
  title?: string;
  blocks: ImpactBlock[];
  /** What baseline/change count — "lines", "touches", "PRs". */
  unitLabel?: string;
  /** Keep the N largest-change blocks; the rest are disclosed as a count. */
  maxBlocks?: number;
  /**
   * Legend words for the two volumes. The defaults are a series's: "baseline"
   * and "changed this window". The spec lens splits a component by delivery
   * rather than by time, so it names its volumes itself.
   */
  baselineLabel?: string;
  changeLabel?: string;
  /**
   * Draw the `NEW` mark on a block with `baseline: 0` (default true). For a
   * series that mark is true: no baseline means created in the window. For a
   * spec it is not: no baseline means every file was touched by a delivery
   * PR, which says nothing about when the component began.
   */
  markNew?: boolean;
  /** Yaw degrees the rotation starts from (default 8). */
  fromAngle?: number;
  /** Yaw degrees it settles at (default 30). */
  toAngle?: number;
  /** 'on-emphasis' (default) | 'auto' */
  growthMode?: 'on-emphasis' | 'auto';
  /** Rotation duration in ms (default 1400). */
  rotateMs?: number;
  /** Per-block growth duration in ms (default 900). */
  growMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/*
 * Fixed unit-space viewBox — see the §9d note in the header doc.
 *
 * Deliberately WIDER than the plate's 16:9. The plate is 16:9, but the
 * scene sits in the middle row of a three-row grid (title above, legend
 * below), so its box is appreciably shorter than the plate and therefore
 * wider than 16:9. A 16:9 viewBox letterboxes into that box and throws
 * away about a fifth of the available width. Matching the box's real
 * proportions is what lets the city use the frame it actually has.
 */
const VB_W = 1000;
const VB_H = 440;
/**
 * Where world-space (0,0,0) lands in viewBox units. X is fixed at the
 * centre; Y is a *default* that the render pass re-centres once it knows
 * how deep the grid is. Pinning Y at a constant works for the counts this
 * template is built for but pushes a deep grid off the bottom edge, since
 * rows extend downward from the origin.
 */
const ORIGIN_X = VB_W / 2;
const ORIGIN_Y_DEFAULT = 330;
/**
 * World units per grid cell, and the block footprint inside a cell.
 *
 * The gap between blocks is `CELL - FOOT`, and it is generous on purpose:
 * at a tighter spacing the towers read as one mass and — worse — the block
 * labels sit close enough to overprint each other. A fit pass (below)
 * scales the whole layout down when a dense scene would outgrow the
 * viewBox, so a large CELL costs nothing at high block counts.
 */
const CELL = 150;
const FOOT = 58;
/** viewBox units of height per unit of baseline/change, set from data. */
const MAX_TOWER_H = 196;
/**
 * Vertical room a block label needs above its cap, in viewBox units. The
 * fit pass subtracts this plus the tallest tower from the height budget,
 * so a dense scene shrinks its ground plane rather than pushing towers or
 * their labels off the top of the frame.
 */
const LABEL_HEADROOM = 34;
/** Vertical squash applied to the projected y of world height. */
const H_SQUASH = 0.86;
/**
 * How steeply the projection tilts — 0 is flat-on, 1 is top-down.
 *
 * Lower than it looks like it should be, and that is the point: tilt is
 * what trades vertical frame budget for horizontal spread. At 0.52 the
 * ground plane is deep on screen, the fit pass has to shrink x/z to make
 * room for it, and the city ends up occupying ~63% of the width with the
 * height maxed out. At 0.34 the same grid reads at ~91% width without
 * losing the dimensional read. Going much below this flattens the boxes
 * until the isometric effect stops working.
 */
const TILT = 0.34;

interface Pt {
  x: number;
  y: number;
}

/**
 * Axonometric projection. `yaw` in radians rotates the scene about the
 * vertical axis; only this changes during the rotation animation, which is
 * what keeps a frame cheap.
 */
/**
 * Vertical origin in effect for the current render. Module-scoped because
 * `project()` is a free function called from several places; every render
 * sets it before drawing, and templates are mounted one at a time per
 * scene so there is no interleaving.
 */
let originY = ORIGIN_Y_DEFAULT;

function project(x: number, y: number, z: number, yaw: number): Pt {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const sx = x * cos - z * sin;
  const sz = x * sin + z * cos;
  return {
    x: ORIGIN_X + sx,
    y: originY - y * H_SQUASH + sz * TILT,
  };
}

function pathOf(pts: Pt[]): string {
  return (
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') +
    ' Z'
  );
}

/** Ease-out cubic — settles rather than stopping dead. */
function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

function fmtNum(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

/**
 * Lay blocks out on a grid, grouped so a district's blocks stay adjacent.
 * Depth-major so the row nearest the viewer is drawn last (painter's
 * order) — the projection has no depth buffer, so draw order IS occlusion.
 */
function gridFor(count: number): { cols: number; rows: number } {
  if (count <= 0) return { cols: 0, rows: 0 };
  const cols = Math.min(6, Math.ceil(Math.sqrt(count * 1.6)));
  return { cols, rows: Math.ceil(count / cols) };
}

export const componentImpactTemplate: Template = {
  id: 'component-impact',
  version: '1.0.0',
  use: 'code',
  emphasizeTargets: '"grow" grows every change volume, and is the main beat. "grow:<id>" grows one. "<id>" pulses a block and grows it. "district:<name>" pulses a district. "reset" collapses them',
  description:
    'Relative impact of each component across a series, as a rotating ' +
    'isometric city: a muted baseline volume with the series\' change ' +
    'stacked on top in accent. One bounded rotation establishes depth, ' +
    'then the change volumes grow — growth is the producer\'s emphasis ' +
    'hook, so the change lands on a narration beat. Height is linear in a ' +
    'named unit and never rescaled per block, so equal heights mean equal ' +
    'magnitude.',
  slots: {
    title: 'string — optional headline (default "Where the work landed")',
    blocks:
      '{ id, label, baseline, change, district? }[] — one per component; ' +
      'baseline 0 marks a component created during the window',
    unitLabel:
      'string — what baseline/change count ("lines", "touches", "PRs"); ' +
      'rendered in the legend because a bare number is not a fact',
    maxBlocks:
      'number — keep the N largest-change blocks; the remainder is ' +
      'disclosed as a count and a combined change total',
    baselineLabel:
      'string — legend word for the muted volume (default "baseline")',
    changeLabel:
      'string — legend word for the accent volume (default "changed this window")',
    markNew:
      'boolean — mark baseline-0 blocks NEW (default true); false when ' +
      'baseline 0 does not mean "created in the window"',
    fromAngle: 'number — yaw degrees the rotation starts from (default 8)',
    toAngle: 'number — yaw degrees it settles at (default 30)',
    growthMode:
      "'on-emphasis' (default) — change volumes wait for a beat; " +
      "'auto' — they grow once after the rotation",
    rotateMs: 'number — rotation duration (default 1400)',
    growMs: 'number — per-block growth duration (default 900)',
  },
  demo: {
    label: 'Component Impact',
    content: {
      title: 'Where the work landed',
      unitLabel: 'touches',
      growthMode: 'auto',
      maxBlocks: 12,
      blocks: [
        { id: 'mcp-server', label: 'mcp/server.ts', baseline: 9, change: 24, district: 'packages/sidecar' },
        { id: 'ledger', label: 'ledger.ts', baseline: 6, change: 7, district: 'packages/sidecar' },
        { id: 'validate', label: 'validate.ts', baseline: 4, change: 5, district: 'packages/sidecar' },
        { id: 'remote', label: 'remote.ts', baseline: 8, change: 3, district: 'packages/sidecar' },
        { id: 'entity-map', label: 'entity-map.ts', baseline: 14, change: 17, district: 'apps/player' },
        { id: 'registry', label: 'templates/registry.ts', baseline: 11, change: 4, district: 'apps/player' },
        { id: 'index-css', label: 'index.css', baseline: 22, change: 9, district: 'apps/player' },
        { id: 'queries', label: 'corpus/queries.ts', baseline: 5, change: 12, district: 'apps/server' },
        { id: 'producer', label: 'agents/producer.ts', baseline: 13, change: 6, district: 'apps/server' },
        { id: 'surface-doc', label: 'SIDECAR-SURFACE.md', baseline: 0, change: 8, district: 'docs' },
        { id: 'series-doc', label: 'SERIES-EXPLAINER.md', baseline: 0, change: 4, district: 'docs' },
      ],
      fromAngle: 8,
      toAngle: 30,
      rotateMs: 1400,
      growMs: 900,
    },
    emphasizeAfter: { target: 'mcp-server', delayMs: 4200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as ComponentImpactContent;

    const title = c.title?.trim() || 'Where the work landed';
    const unitLabel = String(c.unitLabel ?? '').trim();
    const baselineLabel = String(c.baselineLabel ?? '').trim() || 'baseline';
    const changeLabel = String(c.changeLabel ?? '').trim() || 'changed this window';
    const markNew = c.markNew !== false;
    const growthMode = c.growthMode === 'auto' ? 'auto' : 'on-emphasis';
    const rotateMs = Math.max(200, c.rotateMs ?? 1400);
    const growMs = Math.max(200, c.growMs ?? 900);
    // Clamp yaw away from 0° and 90°. At exactly those angles one of the
    // two drawn walls is edge-on (zero screen area), so the box loses a
    // face and reads flat — verified across the whole range. 4°..86° keeps
    // both walls solid at every angle the animation passes through.
    const clampYaw = (v: number, dflt: number): number => {
      const n = Number.isFinite(v) ? v : dflt;
      return Math.min(86, Math.max(4, n));
    };
    const fromAngle = clampYaw(c.fromAngle as number, 8);
    const toAngle = clampYaw(c.toAngle as number, 30);

    const clean = (Array.isArray(c.blocks) ? c.blocks : [])
      .filter(Boolean)
      .map((b, i) => ({
        id: String(b.id ?? `block-${i}`),
        label: String(b.label ?? b.id ?? ''),
        baseline: Math.max(0, Number.isFinite(b.baseline) ? b.baseline : 0),
        change: Math.max(0, Number.isFinite(b.change) ? b.change : 0),
        district: String(b.district ?? '').trim(),
      }));

    // Truncate by change magnitude — the template is about impact, so the
    // biggest changes are what must survive a cap. What is dropped is
    // stated, never silently absent.
    const cap =
      Number.isFinite(c.maxBlocks as number) && (c.maxBlocks as number) > 0
        ? Math.trunc(c.maxBlocks as number)
        : clean.length;
    const ranked = clean.slice().sort((a, b) => b.change - a.change);
    const kept = ranked.slice(0, cap);
    const dropped = ranked.slice(cap);
    const droppedChange = dropped.reduce((a, b) => a + b.change, 0);

    // One shared scale across every block. This is the honesty constraint
    // that makes the skyline comparable: equal height means equal
    // magnitude, everywhere in the scene.
    const maxTotal = kept.reduce((m, b) => Math.max(m, b.baseline + b.change), 0);
    const unitsPerValue = maxTotal > 0 ? MAX_TOWER_H / maxTotal : 0;

    // Group by district, keeping districts ordered by total change so the
    // busiest region reads first.
    const districtOrder: string[] = [];
    const byDistrict = new Map<string, typeof kept>();
    for (const b of kept) {
      const key = b.district || '—';
      if (!byDistrict.has(key)) {
        byDistrict.set(key, []);
        districtOrder.push(key);
      }
      byDistrict.get(key)!.push(b);
    }
    districtOrder.sort((a, b) => {
      const sum = (k: string) =>
        (byDistrict.get(k) ?? []).reduce((acc, x) => acc + x.change, 0);
      return sum(b) - sum(a);
    });

    // ── Placement ────────────────────────────────────────────────────
    // Districts are packed into grid rows; blocks fill their district's
    // own sub-grid. World coords are centred on the origin so the
    // rotation spins about the middle of the scene rather than a corner.
    type Placed = (typeof kept)[number] & {
      wx: number;
      wz: number;
      districtKey: string;
    };
    const placed: Placed[] = [];
    const districtBounds = new Map<
      string,
      { minX: number; maxX: number; minZ: number; maxZ: number }
    >();

    let cursorCol = 0;
    let cursorRow = 0;
    let rowDepth = 0;
    const MAX_COLS = 7;

    for (const key of districtOrder) {
      const items = byDistrict.get(key)!;
      const { cols, rows } = gridFor(items.length);
      if (cursorCol > 0 && cursorCol + cols > MAX_COLS) {
        cursorCol = 0;
        cursorRow += rowDepth + 1;
        rowDepth = 0;
      }
      const baseCol = cursorCol;
      const baseRow = cursorRow;
      items.forEach((b, i) => {
        const col = baseCol + (i % cols);
        const row = baseRow + Math.floor(i / cols);
        placed.push({
          ...b,
          wx: col * CELL,
          wz: row * CELL,
          districtKey: key,
        });
      });
      districtBounds.set(key, {
        minX: baseCol * CELL,
        maxX: (baseCol + cols - 1) * CELL,
        minZ: baseRow * CELL,
        maxZ: (baseRow + rows - 1) * CELL,
      });
      cursorCol += cols;
      rowDepth = Math.max(rowDepth, rows);
    }

    // Centre the whole layout on the origin.
    const xs = placed.map((p) => p.wx);
    const zs = placed.map((p) => p.wz);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    for (const p of placed) {
      p.wx -= cx;
      p.wz -= cz;
    }
    for (const b of districtBounds.values()) {
      b.minX -= cx;
      b.maxX -= cx;
      b.minZ -= cz;
      b.maxZ -= cz;
    }

    // ── Fit to frame ─────────────────────────────────────────────────
    // CELL is sized for legibility at the counts this template is meant
    // for (roughly 8–15 components), which means a denser scene would run
    // off the viewBox. Rather than compromise the spacing for the common
    // case, measure the projected ground footprint and scale the world
    // coordinates so it always fits. This is §3.1's fit-to-frame idea
    // (`computeFitScale` in flow-diagram) applied to the ground plane.
    //
    // Only x/z scale — tower heights are governed by MAX_TOWER_H and must
    // stay on their own shared scale, or the "equal height means equal
    // magnitude" guarantee would silently depend on block count.
    {
      const yawForFit = (toAngle * Math.PI) / 180;
      const pad = FOOT * 0.72;
      let gx0 = Infinity;
      let gx1 = -Infinity;
      let gy0 = Infinity;
      let gy1 = -Infinity;
      const acc = (x: number, z: number) => {
        const pt = project(x, 0, z, yawForFit);
        gx0 = Math.min(gx0, pt.x);
        gx1 = Math.max(gx1, pt.x);
        gy0 = Math.min(gy0, pt.y);
        gy1 = Math.max(gy1, pt.y);
      };
      for (const b of districtBounds.values()) {
        acc(b.minX - pad, b.minZ - pad);
        acc(b.maxX + pad, b.minZ - pad);
        acc(b.maxX + pad, b.maxZ + pad);
        acc(b.minX - pad, b.maxZ + pad);
      }
      // District plates are the ground, but a block's own footprint can
      // reach past its plate's padded corner on the near side. Include
      // every block's footprint or a deep grid clips at the bottom edge.
      for (const p of placed) {
        const h = FOOT / 2;
        acc(p.wx - h, p.wz - h);
        acc(p.wx + h, p.wz - h);
        acc(p.wx + h, p.wz + h);
        acc(p.wx - h, p.wz + h);
      }
      const gw = gx1 - gx0;
      // The ground quad alone is not the scene: towers rise from it and
      // carry a label above their cap, so the vertical budget has to
      // account for the tallest column plus its label before deciding how
      // much room the ground may take. Measuring only the ground is what
      // let dense scenes run off the bottom edge — the back row's towers
      // pushed the top out while the front row held the floor.
      const headroom = MAX_TOWER_H * H_SQUASH + LABEL_HEADROOM;
      const gh = gy1 - gy0;
      const targetW = VB_W * 0.95;
      const targetH = Math.max(VB_H * 0.2, VB_H * 0.97 - headroom);
      // Shrink when the scene is too big; grow, but only modestly, when a
      // two- or three-block scene would otherwise sit as a small clump in
      // the middle of an empty frame. The growth cap keeps CELL/FOOT
      // roughly in proportion — a lone block scaled to fill the width
      // would read as a monolith, not as one component among others.
      const MAX_GROW = 2.4;
      const k = Math.min(
        MAX_GROW,
        gw > 0 ? targetW / gw : 1,
        gh > 0 ? targetH / gh : 1,
      );
      if (Number.isFinite(k) && k > 0 && Math.abs(k - 1) > 0.01) {
        for (const p of placed) {
          p.wx *= k;
          p.wz *= k;
        }
        for (const b of districtBounds.values()) {
          b.minX *= k;
          b.maxX *= k;
          b.minZ *= k;
          b.maxZ *= k;
        }
      }

      // Re-centre vertically. Rows extend downward from the origin, so a
      // deep grid pinned at ORIGIN_Y_DEFAULT hangs off the bottom edge
      // while leaving dead space up top. Measure the scene's real vertical
      // span — the ground at its deepest plus the tallest tower and its
      // label — and place the origin so that span is centred in the frame.
      originY = ORIGIN_Y_DEFAULT;
      {
        let deepest = -Infinity;
        let shallowest = Infinity;
        const measure = (x: number, z: number) => {
          const pt = project(x, 0, z, yawForFit);
          deepest = Math.max(deepest, pt.y);
          shallowest = Math.min(shallowest, pt.y);
        };
        for (const b of districtBounds.values()) {
          measure(b.minX - pad, b.minZ - pad);
          measure(b.maxX + pad, b.minZ - pad);
          measure(b.maxX + pad, b.maxZ + pad);
          measure(b.minX - pad, b.maxZ + pad);
        }
        // The real top of the scene is the highest block CAP plus label
        // headroom — not the shallowest ground lifted by a worst-case
        // tower, since the tallest block is rarely the furthest back. Using
        // the pessimistic figure over-reserves at the top and pushed dense
        // scenes off the bottom instead.
        let highest = Infinity;
        for (const p of placed) {
          const towerH = (p.baseline + p.change) * unitsPerValue;
          const cap = project(p.wx, towerH, p.wz, yawForFit).y;
          highest = Math.min(highest, cap - LABEL_HEADROOM);
        }
        if (Number.isFinite(deepest) && Number.isFinite(highest)) {
          const top = Math.min(highest, shallowest);
          const spanH = deepest - top;
          // Shift the origin by however far the current span sits off
          // centre. project() reads originY, so this moves everything.
          const desiredTop = Math.max(4, (VB_H - spanH) / 2);
          originY += desiredTop - top;
        }
      }
    }

    // Painter's order: farther blocks first, since the projection has no
    // depth buffer and draw order IS occlusion.
    //
    // Screen depth is the projected z term, `x·sin(yaw) + z·cos(yaw)`, NOT
    // `x + z`. Those agree only at yaw 45°; at the 8° start angle the naive
    // key mis-orders ~15% of block pairs, which shows up as blocks
    // occluding the wrong neighbour. Sorting at the SETTLE angle is the
    // right trade: it is exact where the viewer actually reads the scene,
    // and a fixed order avoids blocks popping past each other mid-spin
    // (re-sorting per frame would reorder the DOM every frame anyway).
    const sortYaw = (toAngle * Math.PI) / 180;
    const depthOf = (wx: number, wz: number) =>
      wx * Math.sin(sortYaw) + wz * Math.cos(sortYaw);
    placed.sort((a, b) => depthOf(a.wx, a.wz) - depthOf(b.wx, b.wz));

    // ── DOM / SVG ────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'sb-cimpact-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-cimpact-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-cimpact-plate';

    const header = document.createElement('div');
    header.className = 'sb-cimpact-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-cimpact-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 05 / component-impact';
    const headRight = document.createElement('span');
    headRight.className = 'sb-cimpact-header-right';
    const countChip = document.createElement('span');
    countChip.className =
      dropped.length > 0
        ? 'cs-badge cs-badge--warn sb-cimpact-count'
        : 'cs-badge cs-badge--ink sb-cimpact-count';
    countChip.textContent =
      dropped.length > 0
        ? `${kept.length} of ${clean.length} components`
        : `${kept.length} ${kept.length === 1 ? 'component' : 'components'}`;
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-cimpact-tag';
    sceneTag.textContent = c.sceneTag ?? 'IMPACT';
    headRight.append(countChip, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-cimpact-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-cimpact-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const sceneWrap = document.createElement('div');
    sceneWrap.className = 'sb-cimpact-scene';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'sb-cimpact-svg');

    // Layer groups, back to front: district plates, then blocks.
    const gPlates = document.createElementNS(SVG_NS, 'g');
    gPlates.setAttribute('class', 'sb-cimpact-plates');
    svg.appendChild(gPlates);

    const gBlocks = document.createElementNS(SVG_NS, 'g');
    gBlocks.setAttribute('class', 'sb-cimpact-blocks');
    svg.appendChild(gBlocks);

    // District plate faces, rebuilt each frame from the current yaw.
    type PlateEntry = { key: string; el: SVGPathElement; label: SVGTextElement };
    const plateEls: PlateEntry[] = [];
    for (const key of districtOrder) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sb-cimpact-district');
      g.dataset.districtKey = key;
      const face = document.createElementNS(SVG_NS, 'path');
      face.setAttribute('class', 'sb-cimpact-district-face');
      g.appendChild(face);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'sb-cimpact-district-label');
      label.textContent = key === '—' ? '' : key;
      g.appendChild(label);
      gPlates.appendChild(g);
      plateEls.push({ key, el: face, label });
    }

    /**
     * One block = two stacked boxes. Each box is three visible faces
     * (top, left, right) so the volume reads as solid; the two hidden
     * faces are never drawn, which halves the path count.
     */
    type BoxFaces = {
      top: SVGPathElement;
      left: SVGPathElement;
      right: SVGPathElement;
    };
    // `labelEl` rather than `label`: Placed already carries `label` as the
    // component's display string, and reusing the name would intersect the
    // two types instead of overriding.
    type BlockEntry = Placed & {
      g: SVGGElement;
      base: BoxFaces;
      chg: BoxFaces;
      labelEl: SVGTextElement;
      newMark: SVGTextElement | null;
      /** 0..1 — how much of the change volume is currently shown. */
      grown: number;
    };

    const mkFaces = (parent: SVGGElement, kind: 'base' | 'chg'): BoxFaces => {
      const mk = (side: string) => {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute(
          'class',
          `sb-cimpact-face sb-cimpact-face--${kind} sb-cimpact-face--${side}`,
        );
        parent.appendChild(p);
        return p;
      };
      // Draw order within a box: left and right walls, then the top cap.
      return { left: mk('left'), right: mk('right'), top: mk('top') };
    };

    const blocks: BlockEntry[] = [];
    for (const p of placed) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'sb-cimpact-block');
      g.dataset.blockId = p.id;
      if (p.baseline === 0) g.classList.add('sb-cimpact-block--new');

      const base = mkFaces(g, 'base');
      const chg = mkFaces(g, 'chg');

      const labelEl = document.createElementNS(SVG_NS, 'text');
      labelEl.setAttribute('class', 'sb-cimpact-block-label');
      labelEl.setAttribute('text-anchor', 'middle');
      labelEl.textContent = p.label;
      g.appendChild(labelEl);

      // A component with no baseline gets an explicit mark. "Created in
      // this window" is a fact the geometry alone would understate.
      let newMark: SVGTextElement | null = null;
      if (p.baseline === 0 && markNew) {
        newMark = document.createElementNS(SVG_NS, 'text');
        newMark.setAttribute('class', 'sb-cimpact-block-new');
        newMark.setAttribute('text-anchor', 'middle');
        newMark.textContent = 'NEW';
        g.appendChild(newMark);
      }

      gBlocks.appendChild(g);
      blocks.push({ ...p, g, base, chg, labelEl, newMark, grown: 0 });
    }

    sceneWrap.appendChild(svg);
    body.appendChild(sceneWrap);

    // Legend — names the unit, and the two volumes. Without the unit a
    // height is not a fact, so this is content rather than decoration.
    const legend = document.createElement('div');
    legend.className = 'sb-cimpact-legend';
    const mkKey = (mod: string, text: string) => {
      const k = document.createElement('span');
      k.className = 'sb-cimpact-legend-key';
      const sw = document.createElement('span');
      sw.className = `sb-cimpact-legend-swatch sb-cimpact-legend-swatch--${mod}`;
      const t = document.createElement('span');
      t.className = 'sb-cimpact-legend-text';
      t.textContent = text;
      k.append(sw, t);
      return k;
    };
    legend.appendChild(
      mkKey('base', unitLabel ? `${baselineLabel} (${unitLabel})` : baselineLabel),
    );
    legend.appendChild(
      mkKey('chg', unitLabel ? `${changeLabel} (${unitLabel})` : changeLabel),
    );
    if (dropped.length > 0) {
      const more = document.createElement('span');
      more.className = 'sb-cimpact-legend-more';
      more.textContent =
        `+${dropped.length} smaller ${dropped.length === 1 ? 'component' : 'components'} ` +
        `not shown (${fmtNum(droppedChange)}${unitLabel ? ` ${unitLabel}` : ''})`;
      legend.appendChild(more);
    }
    body.appendChild(legend);

    // Empty state — an impact scene with no components is a real outcome.
    let emptyEl: HTMLElement | null = null;
    if (!blocks.length) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'sb-cimpact-empty';
      emptyEl.textContent = 'No component impact was recorded for this window.';
      body.appendChild(emptyEl);
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Label metrics, in viewBox units. LABEL_CH is the advance width of the
    // 12-unit mono face used by .sb-cimpact-block-label (~0.55em); it only
    // needs to be close enough to predict overlap, not exact.
    const LABEL_CH = 6.6;
    const LABEL_LINE_H = 15;
    // Cull priority, computed once: biggest change first, so the component
    // this window moved most is the one guaranteed to keep its name.
    const labelOrder = blocks
      .map((_, i) => i)
      .sort((a, b) => blocks[b].change - blocks[a].change);

    // ── Frame drawing ────────────────────────────────────────────────
    // Everything geometric is recomputed from (yaw, per-block grown) on
    // each frame. No DOM is created here — only path `d` attributes and
    // text positions change, which is what keeps a rotation frame cheap.
    const drawBox = (
      faces: BoxFaces,
      wx: number,
      wz: number,
      yBottom: number,
      yTop: number,
      yaw: number,
    ): void => {
      const h = FOOT / 2;
      if (yTop - yBottom <= 0.01) {
        faces.top.setAttribute('d', '');
        faces.left.setAttribute('d', '');
        faces.right.setAttribute('d', '');
        return;
      }
      // Four footprint corners, projected at both heights.
      const corners: Array<[number, number]> = [
        [wx - h, wz - h],
        [wx + h, wz - h],
        [wx + h, wz + h],
        [wx - h, wz + h],
      ];
      const top = corners.map(([x, z]) => project(x, yTop, z, yaw));
      const bot = corners.map(([x, z]) => project(x, yBottom, z, yaw));

      faces.top.setAttribute('d', pathOf(top));
      // The two front-facing walls. With yaw in the working range the
      // near corner is index 2, so edges 1→2 and 2→3 are the visible
      // pair; drawing exactly these avoids a per-face normal test.
      faces.right.setAttribute(
        'd',
        pathOf([top[1], top[2], bot[2], bot[1]]),
      );
      faces.left.setAttribute('d', pathOf([top[2], top[3], bot[3], bot[2]]));
    };

    const drawFrame = (yaw: number): void => {
      // District plates sit just under the ground plane.
      for (const pe of plateEls) {
        const b = districtBounds.get(pe.key);
        if (!b) continue;
        const pad = FOOT * 0.72;
        const quad = [
          project(b.minX - pad, 0, b.minZ - pad, yaw),
          project(b.maxX + pad, 0, b.minZ - pad, yaw),
          project(b.maxX + pad, 0, b.maxZ + pad, yaw),
          project(b.minX - pad, 0, b.maxZ + pad, yaw),
        ];
        pe.el.setAttribute('d', pathOf(quad));
        // Label at the plate's near-left corner, nudged clear of blocks.
        const anchor = project(b.minX - pad, 0, b.maxZ + pad, yaw);
        pe.label.setAttribute('x', anchor.x.toFixed(2));
        pe.label.setAttribute('y', (anchor.y + 15).toFixed(2));
      }

      // Positions first, then one collision pass over the labels.
      const anchors: Array<{ b: BlockEntry; x: number; y: number }> = [];
      for (const b of blocks) {
        const baseH = b.baseline * unitsPerValue;
        const chgH = b.change * unitsPerValue * b.grown;
        drawBox(b.base, b.wx, b.wz, 0, baseH, yaw);
        drawBox(b.chg, b.wx, b.wz, baseH, baseH + chgH, yaw);

        // Label rides the current top of the stack.
        const topPt = project(b.wx, baseH + chgH, b.wz, yaw);
        b.labelEl.setAttribute('x', topPt.x.toFixed(2));
        b.labelEl.setAttribute('y', (topPt.y - 12).toFixed(2));
        if (b.newMark) {
          b.newMark.setAttribute('x', topPt.x.toFixed(2));
          b.newMark.setAttribute('y', (topPt.y - 26).toFixed(2));
        }
        anchors.push({ b, x: topPt.x, y: topPt.y - 12 });
      }

      // Label cull. Two labels whose boxes overlap render as one unreadable
      // smear, which is worse than showing fewer names — so the lower
      // priority one is hidden. Priority is change magnitude: the component
      // this window moved most keeps its name.
      //
      // This runs per frame because label positions depend on both the yaw
      // and how far the towers have grown, so a pair that is clear at the
      // start angle can collide at the settle angle. `labelOrder` is
      // precomputed once (below) so the per-frame cost is the O(n²) overlap
      // test only, on the handful of labels that survive.
      const shown: Array<{ x: number; y: number; halfW: number }> = [];
      for (const idx of labelOrder) {
        const a = anchors[idx];
        if (!a) continue;
        const halfW = (a.b.label.length * LABEL_CH) / 2;
        const clash = shown.some(
          (k) =>
            Math.abs(k.x - a.x) < k.halfW + halfW &&
            Math.abs(k.y - a.y) < LABEL_LINE_H,
        );
        if (clash) {
          a.b.labelEl.setAttribute('visibility', 'hidden');
          a.b.newMark?.setAttribute('visibility', 'hidden');
        } else {
          a.b.labelEl.removeAttribute('visibility');
          a.b.newMark?.removeAttribute('visibility');
          shown.push({ x: a.x, y: a.y, halfW });
        }
      }
    };

    // ── Animation ────────────────────────────────────────────────────
    let dismissed = false;
    const rafs = new Set<number>();
    const timers: number[] = [];
    let currentYaw = (fromAngle * Math.PI) / 180;
    const targetYaw = (toAngle * Math.PI) / 180;

    const reduced =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { matchMedia?: unknown }).matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /**
     * In-flight growth frame, tracked separately from the rotation so a
     * new grow — or a reset — can cancel it. Without this, a `reset`
     * followed by a `grow:<id>` would leave the earlier all-blocks
     * animation still running and quietly grow everything.
     */
    let growRaf: number | null = null;
    const cancelGrowth = () => {
      if (growRaf == null) return;
      cancelAnimationFrame(growRaf);
      rafs.delete(growRaf);
      growRaf = null;
    };

    /** Grow a set of blocks from their current value to 1. */
    const growBlocks = (targets: BlockEntry[]): void => {
      if (!targets.length) return;
      cancelGrowth();
      if (reduced) {
        for (const b of targets) b.grown = 1;
        drawFrame(currentYaw);
        return;
      }
      const starts = targets.map((b) => b.grown);
      let t0: number | null = null;
      const step = (now: number) => {
        if (dismissed) return;
        if (t0 == null) t0 = now;
        const p = easeOut((now - t0) / growMs);
        targets.forEach((b, i) => {
          b.grown = starts[i] + (1 - starts[i]) * p;
        });
        drawFrame(currentYaw);
        if (p < 1) {
          const id = requestAnimationFrame(step);
          rafs.add(id);
          growRaf = id;
        } else {
          growRaf = null;
        }
      };
      const id = requestAnimationFrame(step);
      rafs.add(id);
      growRaf = id;
    };

    const runRotation = (onDone: () => void): void => {
      if (reduced) {
        currentYaw = targetYaw;
        drawFrame(currentYaw);
        onDone();
        return;
      }
      const startYaw = currentYaw;
      let t0: number | null = null;
      const step = (now: number) => {
        if (dismissed) return;
        if (t0 == null) t0 = now;
        const p = easeOut((now - t0) / rotateMs);
        currentYaw = startYaw + (targetYaw - startYaw) * p;
        drawFrame(currentYaw);
        if (p < 1) {
          const id = requestAnimationFrame(step);
          rafs.add(id);
        } else {
          onDone();
        }
      };
      const id = requestAnimationFrame(step);
      rafs.add(id);
    };

    // Reduced motion / capture: resolve both moves up front so the very
    // first frame is the finished skyline, not a bare baseline.
    if (reduced) {
      for (const b of blocks) b.grown = 1;
      currentYaw = targetYaw;
    }
    drawFrame(currentYaw);

    // Chrome reveal, then the rotation, then growth if the caller asked
    // for it without a producer to drive the beat.
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 250));
    timers.push(window.setTimeout(() => sceneWrap.classList.add('sb-visible'), 340));
    timers.push(window.setTimeout(() => legend.classList.add('sb-visible'), 520));
    if (emptyEl) {
      timers.push(window.setTimeout(() => emptyEl!.classList.add('sb-visible'), 380));
    }

    timers.push(
      window.setTimeout(() => {
        if (dismissed) return;
        runRotation(() => {
          if (growthMode === 'auto') growBlocks(blocks);
        });
      }, 420),
    );

    // ── Emphasize ────────────────────────────────────────────────────
    // Growth is the hook: a beat naming a component always makes its
    // change visible, so the producer never has to send two beats to get
    // one idea across.
    let activeEls: Element[] = [];
    let activeTimer: number | null = null;

    const clearActive = () => {
      for (const el of activeEls) el.classList.remove('sb-emphasize');
      activeEls = [];
      if (activeTimer != null) {
        window.clearTimeout(activeTimer);
        activeTimer = null;
      }
    };

    const pulse = (els: Array<Element | null | undefined>) => {
      const present = els.filter(Boolean) as Element[];
      if (!present.length) return;
      clearActive();
      for (const el of present) el.classList.add('sb-emphasize');
      activeEls = present;
      activeTimer = window.setTimeout(() => {
        for (const el of present) el.classList.remove('sb-emphasize');
        activeEls = [];
        activeTimer = null;
      }, 1500);
    };

    const byId = new Map(blocks.map((b) => [b.id, b]));

    return {
      dismiss: () => {
        dismissed = true;
        clearActive();
        for (const t of timers) window.clearTimeout(t);
        for (const id of rafs) cancelAnimationFrame(id);
        rafs.clear();
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const raw = String(target ?? '').trim();
        if (!raw) return;

        if (raw === 'grow') {
          growBlocks(blocks);
          return;
        }
        if (raw === 'reset') {
          clearActive();
          cancelGrowth();
          for (const b of blocks) b.grown = 0;
          drawFrame(currentYaw);
          return;
        }
        if (raw.startsWith('grow:')) {
          const b = byId.get(raw.slice(5));
          if (b) growBlocks([b]);
          return;
        }
        if (raw.startsWith('district:')) {
          const key = raw.slice(9);
          const members = blocks.filter((b) => b.districtKey === key);
          const plateEl = plateEls.find((p) => p.key === key);
          growBlocks(members);
          pulse([
            ...(plateEl ? [plateEl.el.parentNode as Element] : []),
            ...members.map((b) => b.g),
          ]);
          return;
        }
        // A bare id: grow it and pulse it. One beat, one idea.
        const b = byId.get(raw);
        if (b) {
          growBlocks([b]);
          pulse([b.g]);
        }
      },
    };
  },
};

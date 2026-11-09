import type { Template, TemplateHandle } from './registry';
import { resolveColor } from './palette';

/**
 * entity-map — a friendly entity-relationship diagram. Models/tables
 * render as rounded cards showing a label and a short field list.
 * Relationship lines connect them with plain-English labels like
 * "has many" or "belongs to" instead of crow's-foot notation.
 *
 * lenzon/ui v0.1 styling: outer wrapper is a .cs-plate; each entity
 * card is a nested .cs-plate--sunken (the canonical nested-plate
 * pattern). SVG strokes consume var(--cs-*) directly — the connector
 * lines use --cs-ink-3 at rest and --cs-accent-warm when a connected
 * entity is emphasized. The `entity.color` slot still resolves through
 * resolveColor/PALETTE_DEFAULTS (Producer contract), and it drives a
 * small left-stripe accent on each card.
 *
 * Slot schema:
 *   title?:          string
 *   entities:        EntitySpec[]           (3–10 entities)
 *   relationships:   RelationshipSpec[]     (edges between entities)
 *   staggerMs?:      number                 (delay between card reveals, default 300)
 *   layout?:         "grid" | "hierarchical" (default "grid" for Phase 0)
 *
 * emphasize(target): target is an entity id string.
 *   Pulses the matching card (warm ring) and highlights all relationship
 *   lines connected to that entity. Accent budget = 1 across cards.
 */

interface EntitySpec {
  /** Unique id, referenced by relationships. */
  id: string;
  /** Display name. */
  label: string;
  /** Key field names shown inside the card. */
  fields?: string[];
  /** CSS color or palette reference for the card accent stripe. */
  color?: string;
  /** Optional 1-indexed grid row. Pair with `col` to pin this card to a
   *  specific cell. Entities without coords auto-pack in array order. */
  row?: number;
  /** Optional 1-indexed grid column. See `row`. */
  col?: number;
}

type RelType = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

interface RelationshipSpec {
  /** Source entity id. */
  from: string;
  /** Target entity id. */
  to: string;
  /** Plain-English label, e.g. "has many", "belongs to". */
  label: string;
  /** Cardinality hint — affects line decoration (optional in Phase 0). */
  type?: RelType;
}

interface EntityMapContent {
  title?: string;
  entities: EntitySpec[];
  relationships: RelationshipSpec[];
  staggerMs?: number;
  layout?: 'grid' | 'hierarchical';
}

const CARDINALITY: Record<RelType, { fromMark: string; toMark: string }> = {
  'one-to-one': { fromMark: '1', toMark: '1' },
  'one-to-many': { fromMark: '1', toMark: 'N' },
  'many-to-one': { fromMark: 'N', toMark: '1' },
  'many-to-many': { fromMark: 'N', toMark: 'N' },
};

export const entityMapTemplate: Template = {
  id: 'entity-map',
  version: '1.0.0',
  description:
    'Friendly ER diagram in nested glass plates: model cards with fields, connected by labeled relationship lines.',
  slots: {
    title: 'string — optional headline',
    entities:
      '{ id, label, fields?, color?, row?, col? }[] — the models/tables (3–10). row/col are 1-indexed grid coords; omit to auto-pack.',
    relationships:
      '{ from, to, label, type? }[] — connections between entities; from/to MUST match an entity id',
    staggerMs: 'number — delay between card reveals (default 300)',
    layout: '"grid" | "hierarchical" — layout strategy (default "grid")',
  },
  demo: {
    label: 'Entity Map',
    content: {
      title: 'Data model at a glance',
      entities: [
        { id: 'org', label: 'Organization', fields: ['id', 'name', 'plan'], row: 1, col: 1 },
        { id: 'user', label: 'User', fields: ['id', 'email', 'name'], row: 1, col: 2 },
        { id: 'project', label: 'Project', fields: ['id', 'name', 'orgId'], row: 2, col: 1 },
        {
          id: 'presentation',
          label: 'Presentation',
          fields: ['id', 'projectId', 'script'],
          row: 2,
          col: 2,
        },
      ],
      relationships: [
        { from: 'org', to: 'user', label: 'has many', type: 'one-to-many' },
        { from: 'org', to: 'project', label: 'has many', type: 'one-to-many' },
        {
          from: 'project',
          to: 'presentation',
          label: 'has many',
          type: 'one-to-many',
        },
      ],
      staggerMs: 300,
    },
    emphasizeAfter: { target: 'project', delayMs: 2800 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as EntityMapContent;
    const entities = c.entities ?? [];
    const relationships = c.relationships ?? [];
    const staggerMs = c.staggerMs ?? 300;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-entity-map-wrapper';

    if (c.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'cs-title cs-title--m sb-entity-map-title';
      titleEl.textContent = c.title;
      wrapper.appendChild(titleEl);
    }

    // Outer container is itself a cs-plate; the inner grid + SVG overlay
    // sit inside it so the SVG coordinate frame matches the card layout.
    const container = document.createElement('div');
    container.className = 'cs-plate cs-plate--default sb-entity-map-container';

    // If any entity supplies row/col, switch the grid to explicit
    // placement and size it to fit the highest coords used. Otherwise
    // fall back to the auto-pack column count tuned to entity count.
    const hasExplicitCoords = entities.some(
      (e) => typeof e.row === 'number' || typeof e.col === 'number',
    );
    const autoCols = entities.length <= 4 ? 2 : entities.length <= 6 ? 3 : 4;
    const cols = hasExplicitCoords
      ? Math.max(autoCols, ...entities.map((e) => e.col ?? 0))
      : autoCols;
    const rows = hasExplicitCoords
      ? Math.max(1, ...entities.map((e) => e.row ?? 0))
      : 0;

    const grid = document.createElement('div');
    grid.className = 'sb-entity-map-grid';
    grid.style.setProperty('--sb-entity-cols', String(cols));
    if (rows > 0) grid.style.setProperty('--sb-entity-rows', String(rows));

    const cardMap = new Map<string, HTMLElement>();
    const timers: number[] = [];

    entities.forEach((entity, i) => {
      // Producer-emitted palette.* aliases still resolve here; fall back
      // to --cs-accent-cool so colorless entities still get a soft tag.
      const accent = entity.color ? resolveColor(entity.color) : 'var(--cs-accent-cool)';
      const card = document.createElement('div');
      card.className = 'cs-plate cs-plate--sunken sb-entity-map-card';
      card.style.setProperty('--sb-entity-color', accent);

      // Pin to a specific cell when coords are supplied; CSS Grid auto
      // -placement handles entities that omit them.
      if (typeof entity.row === 'number') card.style.gridRow = String(entity.row);
      if (typeof entity.col === 'number') card.style.gridColumn = String(entity.col);

      const header = document.createElement('div');
      header.className = entity.fields?.length
        ? 'sb-entity-map-header sb-with-fields'
        : 'sb-entity-map-header';
      const labelEl = document.createElement('span');
      labelEl.className = 'sb-entity-map-label';
      labelEl.textContent = entity.label;
      header.appendChild(labelEl);
      card.appendChild(header);

      if (entity.fields?.length) {
        const fieldList = document.createElement('div');
        fieldList.className = 'sb-entity-map-fields';
        fieldList.textContent = entity.fields.join(', ');
        card.appendChild(fieldList);
      }

      cardMap.set(entity.id, card);
      grid.appendChild(card);

      timers.push(
        window.setTimeout(
          () => card.classList.add('sb-visible'),
          i * staggerMs,
        ),
      );
    });

    container.appendChild(grid);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sb-entity-map-svg');
    container.appendChild(svg);

    wrapper.appendChild(container);
    presenter.domRoot.appendChild(wrapper);

    const lineEls: SVGGElement[] = [];
    const linesByEntity = new Map<string, SVGGElement[]>();

    // Connector strokes/fills read cs vars directly — SVG resolves var()
    // in attributes once the nodes are attached, so this is safe here.
    const INK3 = 'var(--cs-ink-3)';
    const INK4 = 'var(--cs-ink-4)';
    // The label pill must *mask* the dashed stroke behind it, so it needs an
    // opaque fill. --cs-glass-sunken-bg is only 55% opaque (it is designed to
    // sit over a plate and let it through), which let the dashes cut straight
    // through the glyphs — the label and line appeared to overwrite each
    // other. --cs-bg-1 is the stage backdrop these plates sit on, so an
    // opaque pill in it reads as a clean gap in the line.
    const LABEL_BG = 'var(--cs-bg-1)';

    // Label type scale. Authored against the 1920×1080 design surface (see
    // designSize.ts) — the whole surface is transform-scaled to the host box,
    // so these are surface pixels, not device pixels. The old hardcoded 11/10
    // were sized for the earlier ~1280 surface and read as cramped, unanchored
    // text once the surface grew.
    const LABEL_FS = 15; // --cs-fs-6, one step under the card's field text
    const MARK_FS = 13; // --cs-fs-4, subordinate to the relationship label
    const LABEL_PAD_X = 8;
    const LABEL_PAD_Y = 5;

    // Which entity (if any) currently owns the warm edge highlight. A redraw
    // rebuilds every <g> from scratch, so warm state has to live here — keyed
    // by entity id — rather than on the elements, or an emphasize() that
    // lands just before a re-measure would lose its highlight.
    let warmEntity: string | null = null;

    const paintEdge = (g: SVGGElement, warm: boolean) => {
      const line = g.querySelector('line');
      if (!line) return;
      line.setAttribute('stroke', warm ? 'var(--cs-accent-warm)' : INK3);
      line.setAttribute('stroke-width', warm ? '3' : '2');
    };

    /**
     * The embed host scales the whole design surface with a uniform CSS
     * transform (see designSize.ts), so every rect this template measures
     * comes back in *transformed* pixels. The ratio of the container's
     * transformed width to its untransformed layout width recovers that
     * host scale; divide any rect measurement by it to get back to layout
     * px — the space the cards' own CSS (fonts, padding) is authored in.
     * Assumes uniform scale (the designSize contract); rotation/skew would
     * need a full matrix and is not supported by any embed host.
     */
    const hostScale = () => {
      const w = container.offsetWidth;
      return w > 0 ? container.getBoundingClientRect().width / w : 1;
    };

    /**
     * True once the container has a real box and no card is mid-transform.
     *
     * `getBoundingClientRect()` reports the *transformed* box while a card's
     * scale() is animating, whereas `offsetWidth/Height` always report the
     * untransformed layout box. Comparing the two (normalized by the host
     * scale, which affects both card and container rects equally) detects an
     * in-flight scale() — a card resting at scale(1) agrees to within a
     * rounding hair; one at scale(0.9) is off by 10%. A plain non-zero size
     * check can't see this, since scale(0.9) is a perfectly valid-looking box.
     */
    const layoutSettled = () => {
      const cr = container.getBoundingClientRect();
      if (cr.width < 1 || cr.height < 1) return false;
      const s = hostScale();
      for (const card of cardMap.values()) {
        const r = card.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        // Only cards that have begun revealing are expected to be at
        // scale(1); one still waiting its turn is legitimately scaled down
        // and must not block the draw (its own transitionend will re-draw).
        if (!card.classList.contains('sb-visible')) continue;
        // Tolerance must absorb offsetWidth/Height integer rounding (±0.5px
        // — a card whose true layout height is 85.5px reports 86) plus rect
        // quantization amplified by 1/s, while still catching a mid-flight
        // reveal, which sits at scale(0.9) ≈ 8+px off. 1.5px clears the
        // noise floor with an order of magnitude to spare.
        if (
          Math.abs(r.width / s - card.offsetWidth) > 1.5 ||
          Math.abs(r.height / s - card.offsetHeight) > 1.5
        ) {
          return false;
        }
      }
      return true;
    };

    const drawLines = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      lineEls.length = 0;
      linesByEntity.clear();

      const containerRect = container.getBoundingClientRect();
      const s = hostScale();

      // Pin the SVG user-coordinate system to the container's *layout* box
      // (clientWidth/Height — transform-immune, TEMPLATE-SPEC §9b), NOT the
      // bounding rect. The rect is post-transform: sizing the viewBox from it
      // makes 1 SVG user unit = 1 physical pixel at any embed scale, which
      // silently pins every absolute number below — font sizes, pill padding,
      // stroke widths — to *screen* pixels while the cards around them scale
      // with the design surface. That is exactly the "labels are huge in the
      // small embed but fine full-screen" failure. With the viewBox in layout
      // px, user units == design-surface px and the host transform scales
      // labels and cards together.
      svg.setAttribute(
        'viewBox',
        `0 0 ${container.clientWidth} ${container.clientHeight}`,
      );

      // Two paint layers: every stroke goes in `lineLayer`, every label pill
      // in `labelLayer` above it. Without this split the <g>s interleave in
      // document order, so a later edge's dashed line paints straight over an
      // earlier edge's pill — the label looked unmasked even though its own
      // background was correct.
      const lineLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      svg.appendChild(lineLayer);
      svg.appendChild(labelLayer);

      // Placed label boxes, used to dodge overlaps after all edges are built.
      const labelBoxes: {
        x: number;
        y: number;
        w: number;
        h: number;
        text: SVGTextElement;
        bg: SVGRectElement;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }[] = [];

      relationships.forEach((rel) => {
        const fromCard = cardMap.get(rel.from);
        const toCard = cardMap.get(rel.to);
        if (!fromCard || !toCard) {
          const missing = [
            !fromCard ? `from="${rel.from}"` : null,
            !toCard ? `to="${rel.to}"` : null,
          ]
            .filter(Boolean)
            .join(' ');
          console.warn(
            `[entity-map] dropping relationship ${missing} — id not in entities`,
          );
          return;
        }

        const fromRect = fromCard.getBoundingClientRect();
        const toRect = toCard.getBoundingClientRect();

        // Rect deltas are measured in transformed pixels; divide by the host
        // scale to land in the same layout-px space as the viewBox above.
        // clientLeft/Top shift from the container's border edge (where rects
        // measure from) to its padding edge (where the inset:0 SVG sits —
        // .cs-plate carries a 1px border).
        const x1 =
          (fromRect.left - containerRect.left + fromRect.width / 2) / s -
          container.clientLeft;
        const y1 =
          (fromRect.top - containerRect.top + fromRect.height / 2) / s -
          container.clientTop;
        const x2 =
          (toRect.left - containerRect.left + toRect.width / 2) / s -
          container.clientLeft;
        const y2 =
          (toRect.top - containerRect.top + toRect.height / 2) / s -
          container.clientTop;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'sb-entity-map-edge');

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('stroke', INK3);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6 4');
        g.appendChild(line);

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        // Build the text first so the pill can be sized from the *measured*
        // glyph width. The previous `label.length * 6.6` estimate was both
        // wrong and unnecessary: it over-shot by 11–30px on real strings
        // (proportional fonts do not have uniform advance widths), leaving a
        // pill far wider than its text and eating space that adjacent labels
        // needed. Order matters — getComputedTextLength() only works once the
        // node is in the live tree, so append the text, measure, then insert
        // the pill behind it.
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(mx));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('fill', INK3);
        text.setAttribute('font-size', String(LABEL_FS));
        text.setAttribute('font-family', 'var(--cs-font-ui)');
        text.textContent = rel.label;
        // Label goes in the upper layer; the stroke stays in `g` below.
        labelLayer.appendChild(text);
        lineLayer.appendChild(g);

        // Centre the label on the line rather than floating it above. The old
        // geometry put the pill at my-18..my-2 with the baseline at my-6, so
        // the label sat off its own edge and crowded whatever was above it.
        const labelY = my;
        text.setAttribute('y', String(labelY));

        let textW = rel.label.length * LABEL_FS * 0.55; // fallback estimate
        try {
          const measured = text.getComputedTextLength();
          if (measured > 0) textW = measured;
        } catch {
          // getComputedTextLength throws in some headless/detached contexts;
          // the estimate above keeps the pill plausible rather than absent.
        }

        const pillW = textW + LABEL_PAD_X * 2;
        const pillH = LABEL_FS + LABEL_PAD_Y * 2;
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(mx - pillW / 2));
        bg.setAttribute('y', String(labelY - pillH / 2));
        bg.setAttribute('width', String(pillW));
        bg.setAttribute('height', String(pillH));
        bg.setAttribute('rx', '4');
        bg.setAttribute('fill', LABEL_BG);
        labelLayer.insertBefore(bg, text);

        // Record the occupied box so later edges can dodge it.
        labelBoxes.push({
          x: mx - pillW / 2,
          y: labelY - pillH / 2,
          w: pillW,
          h: pillH,
          text,
          bg,
          x1,
          y1,
          x2,
          y2,
        });

        if (rel.type) {
          const marks = CARDINALITY[rel.type];
          if (marks) {
            const addMark = (x: number, y: number, mark: string) => {
              const m = document.createElementNS('http://www.w3.org/2000/svg', 'text');
              m.setAttribute('x', String(x));
              m.setAttribute('y', String(y));
              m.setAttribute('text-anchor', 'middle');
              m.setAttribute('fill', INK4);
              m.setAttribute('font-size', String(MARK_FS));
              m.setAttribute('font-weight', '700');
              m.setAttribute('font-family', 'var(--cs-font-mono)');
              m.textContent = mark;
              labelLayer.appendChild(m);
            };
            // Offset perpendicular to the edge, not always straight up: on a
            // vertical edge a -8 y-offset put the mark on top of the stroke.
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const offX = (-dy / len) * 12;
            const offY = (dx / len) * 12;
            addMark(
              x1 + dx * 0.18 + offX,
              y1 + dy * 0.18 + offY,
              marks.fromMark,
            );
            addMark(
              x1 + dx * 0.82 + offX,
              y1 + dy * 0.82 + offY,
              marks.toMark,
            );
          }
        }

        lineEls.push(g);

        [rel.from, rel.to].forEach((eid) => {
          if (!linesByEntity.has(eid)) linesByEntity.set(eid, []);
          linesByEntity.get(eid)!.push(g);
        });
      });

      // Nudge overlapping labels apart. Every pill starts at its edge's exact
      // midpoint, so two relationships between the same pair of entities — or
      // two edges that cross near their centres — stack character-on-character.
      // Slide the later one along its own line (parametrically, so it stays
      // attached to the edge it describes) until it clears, alternating
      // direction and giving up rather than pushing a label onto a card.
      const overlaps = (
        a: { x: number; y: number; w: number; h: number },
        b: { x: number; y: number; w: number; h: number },
      ) =>
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

      for (let i = 1; i < labelBoxes.length; i += 1) {
        const box = labelBoxes[i];
        const prior = labelBoxes.slice(0, i);
        if (!prior.some((p) => overlaps(box, p))) continue;

        const dx = box.x2 - box.x1;
        const dy = box.y2 - box.y1;
        const edgeLen = Math.hypot(dx, dy) || 1;
        // Step ~1 pill-height along the edge each try, alternating sides, and
        // stay inside the middle 70% so a label never rides onto a card.
        const step = (box.h + 6) / edgeLen;
        let placed = false;
        for (let k = 1; k <= 14 && !placed; k += 1) {
          const delta = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * step;
          const t = 0.5 + delta;
          if (t < 0.15 || t > 0.85) continue;
          const nx = box.x1 + dx * t;
          const ny = box.y1 + dy * t;
          const cand = { x: nx - box.w / 2, y: ny - box.h / 2, w: box.w, h: box.h };
          if (prior.some((p) => overlaps(cand, p))) continue;
          box.x = cand.x;
          box.y = cand.y;
          box.text.setAttribute('x', String(nx));
          box.text.setAttribute('y', String(ny));
          box.bg.setAttribute('x', String(cand.x));
          box.bg.setAttribute('y', String(cand.y));
          placed = true;
        }
      }

      // Freshly-built edges default to rest ink; restore the warm highlight
      // if an emphasize window is still open.
      if (warmEntity) {
        (linesByEntity.get(warmEntity) ?? []).forEach((g) => paintEdge(g, true));
      }
    };

    // Cards transition opacity + transform(scale) over 400ms once
    // .sb-visible is added. Measuring `getBoundingClientRect()` while a
    // card's own scale() is mid-flight returns shrunken/offset values —
    // the source of the "stub line in the upper-left corner" symptom.
    //
    // A single timed draw can't be trusted here: the reveal timers and the
    // draw timer are queued together, so under load (video render, GC pause)
    // they coalesce and the draw can land mid-transition. Worse, nothing
    // re-measured afterwards — a card's scale() and a webfont swap both move
    // card boxes without resizing `container`, so a ResizeObserver on the
    // container alone never fires again and one bad measurement stuck for
    // the life of the scene. So: draw only once layout is settled, retry on
    // the next frame while it isn't, and re-draw on every later signal that
    // could move a card.
    let drawRaf = 0;
    let settleTimer = 0;
    let settleTries = 0;
    // Retry cadence is deliberately coarse, not per-frame: `transitionend`
    // already re-draws the instant each card settles, so this path only
    // covers layout that is unsettled for some *other* reason (a container
    // still sizing, a transition that never fires). Polling those at 60fps
    // would force a layout flush every frame across every card for the whole
    // reveal sequence — measurable cost during a video render, no benefit.
    const SETTLE_RETRY_MS = 100;
    const MAX_SETTLE_TRIES = 30; // ~3s, then draw with whatever we have

    const scheduleDraw = () => {
      if (drawRaf) cancelAnimationFrame(drawRaf);
      drawRaf = requestAnimationFrame(() => {
        drawRaf = 0;
        if (!layoutSettled() && settleTries < MAX_SETTLE_TRIES) {
          settleTries += 1;
          if (!settleTimer) {
            settleTimer = window.setTimeout(() => {
              settleTimer = 0;
              scheduleDraw();
            }, SETTLE_RETRY_MS);
          }
          return;
        }
        if (settleTimer) {
          window.clearTimeout(settleTimer);
          settleTimer = 0;
        }
        settleTries = 0;
        drawLines();
      });
    };

    // Primary trigger: each card's reveal transition actually completing.
    // `transform` is the property whose mid-flight value corrupts measurement,
    // so key off it and ignore the opacity leg of the same transition.
    const onCardTransitionEnd = (ev: TransitionEvent) => {
      if (ev.propertyName === 'transform') scheduleDraw();
    };
    cardMap.forEach((card) => {
      card.addEventListener('transitionend', onCardTransitionEnd);
    });

    // Fallback for when transitions never fire at all — reduced-motion,
    // a card revealed while the stage is display:none, or a headless render
    // that skips compositing. Same budget the old single-shot draw used.
    timers.push(
      window.setTimeout(scheduleDraw, entities.length * staggerMs + 600),
    );

    // Re-measure on resize so lines stay anchored after late font load,
    // embed-scale changes, or window resize. Observe the cards as well as
    // the container: cards are `width: fit-content` inside centred grid
    // cells, so a font swap reflows them without touching the container box.
    //
    // The initial fire that observe() delivers is not suppressed. Counting
    // it out is fragile (the initial entries for N observed elements may
    // arrive in one callback or several, so any counter can either swallow a
    // real resize or be overshot by one batched alongside it) and pointless:
    // scheduleDraw coalesces to one rAF, drawLines is idempotent, and the
    // settle guard rejects a premature measurement anyway.
    const resizeObserver = new ResizeObserver(() => scheduleDraw());
    resizeObserver.observe(container);
    cardMap.forEach((card) => resizeObserver.observe(card));

    const emphTimers = new Map<HTMLElement, number>();
    let warmRevertTimer = 0;

    return {
      dismiss() {
        if (drawRaf) cancelAnimationFrame(drawRaf);
        if (settleTimer) window.clearTimeout(settleTimer);
        resizeObserver.disconnect();
        cardMap.forEach((card) => {
          card.removeEventListener('transitionend', onCardTransitionEnd);
        });
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        if (warmRevertTimer) window.clearTimeout(warmRevertTimer);
        emphTimers.clear();
        wrapper.remove();
      },
      emphasize(target: string) {
        const card = cardMap.get(target);
        if (!card) return;

        // Accent budget = 1: clear any other card currently emph'd,
        // and clear any connected lines currently in their warm state.
        cardMap.forEach((other) => {
          if (other !== card && other.classList.contains('sb-emphasize')) {
            other.classList.remove('sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });
        if (warmEntity) {
          (linesByEntity.get(warmEntity) ?? []).forEach((g) => paintEdge(g, false));
          warmEntity = null;
        }
        if (warmRevertTimer) {
          window.clearTimeout(warmRevertTimer);
          warmRevertTimer = 0;
        }

        card.classList.add('sb-emphasize');
        const prior = emphTimers.get(card);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          card,
          window.setTimeout(() => {
            card.classList.remove('sb-emphasize');
            emphTimers.delete(card);
          }, 1400),
        );

        // Light the connected edges warm for the same window. Recorded on
        // `warmEntity` rather than per-element so a re-measure mid-window
        // rebuilds the edges warm instead of dropping the highlight.
        warmEntity = target;
        (linesByEntity.get(target) ?? []).forEach((g) => paintEdge(g, true));
        warmRevertTimer = window.setTimeout(() => {
          (linesByEntity.get(target) ?? []).forEach((g) => paintEdge(g, false));
          if (warmEntity === target) warmEntity = null;
          warmRevertTimer = 0;
        }, 1400);
      },
    };
  },
};

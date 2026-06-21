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
    const BG = 'var(--cs-glass-sunken-bg)';

    const drawLines = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      lineEls.length = 0;
      linesByEntity.clear();

      const containerRect = container.getBoundingClientRect();

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

        // Deltas between rects in the same transform frame survive CSS
        // transforms on ancestor hosts — safe even under embed scaling.
        const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
        const y1 = fromRect.top - containerRect.top + fromRect.height / 2;
        const x2 = toRect.left - containerRect.left + toRect.width / 2;
        const y2 = toRect.top - containerRect.top + toRect.height / 2;

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

        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(mx - rel.label.length * 3.3 - 4));
        bg.setAttribute('y', String(my - 18));
        bg.setAttribute('width', String(rel.label.length * 6.6 + 8));
        bg.setAttribute('height', '16');
        bg.setAttribute('rx', '3');
        bg.setAttribute('fill', BG);
        g.appendChild(bg);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(mx));
        text.setAttribute('y', String(my - 6));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', INK3);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-family', 'var(--cs-font-ui)');
        text.textContent = rel.label;
        g.appendChild(text);

        if (rel.type) {
          const marks = CARDINALITY[rel.type];
          if (marks) {
            const addMark = (x: number, y: number, mark: string) => {
              const m = document.createElementNS('http://www.w3.org/2000/svg', 'text');
              m.setAttribute('x', String(x));
              m.setAttribute('y', String(y));
              m.setAttribute('text-anchor', 'middle');
              m.setAttribute('fill', INK4);
              m.setAttribute('font-size', '10');
              m.setAttribute('font-weight', '700');
              m.setAttribute('font-family', 'var(--cs-font-mono)');
              m.textContent = mark;
              g.appendChild(m);
            };
            addMark(x1 + (x2 - x1) * 0.2, y1 + (y2 - y1) * 0.2 - 8, marks.fromMark);
            addMark(x1 + (x2 - x1) * 0.8, y1 + (y2 - y1) * 0.8 - 8, marks.toMark);
          }
        }

        svg.appendChild(g);
        lineEls.push(g);

        [rel.from, rel.to].forEach((eid) => {
          if (!linesByEntity.has(eid)) linesByEntity.set(eid, []);
          linesByEntity.get(eid)!.push(g);
        });
      });
    };

    // Cards transition opacity + transform(scale) over 400ms once
    // .sb-visible is added. Measuring `getBoundingClientRect()` while a
    // card's own scale() is mid-flight returns shrunken/offset values —
    // the source of the "stub line in the upper-left corner" symptom.
    // Wait until the last reveal's transition has had time to finish,
    // then defer one more frame so layout is stable before measuring.
    let drawRaf = 0;
    const scheduleDraw = () => {
      if (drawRaf) cancelAnimationFrame(drawRaf);
      drawRaf = requestAnimationFrame(() => {
        drawRaf = 0;
        drawLines();
      });
    };
    timers.push(
      window.setTimeout(scheduleDraw, entities.length * staggerMs + 600),
    );

    // Re-measure on container resize so lines stay anchored after late
    // font load, embed-scale changes, or window resize. Skip the first
    // synchronous fire that ResizeObserver delivers on observe().
    let firstObserve = true;
    const resizeObserver = new ResizeObserver(() => {
      if (firstObserve) {
        firstObserve = false;
        return;
      }
      scheduleDraw();
    });
    resizeObserver.observe(container);

    const emphTimers = new Map<HTMLElement, number>();
    const lineRevertTimers = new Map<SVGGElement, number>();

    return {
      dismiss() {
        if (drawRaf) cancelAnimationFrame(drawRaf);
        resizeObserver.disconnect();
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        lineRevertTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        lineRevertTimers.clear();
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
        lineRevertTimers.forEach((t, g) => {
          const line = g.querySelector('line');
          if (line) {
            line.setAttribute('stroke', INK3);
            line.setAttribute('stroke-width', '2');
          }
          window.clearTimeout(t);
          lineRevertTimers.delete(g);
        });

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

        // Light the connected edges warm for the same window.
        const lines = linesByEntity.get(target) ?? [];
        lines.forEach((g) => {
          const line = g.querySelector('line');
          if (!line) return;
          line.setAttribute('stroke', 'var(--cs-accent-warm)');
          line.setAttribute('stroke-width', '3');
          const t = window.setTimeout(() => {
            line.setAttribute('stroke', INK3);
            line.setAttribute('stroke-width', '2');
            lineRevertTimers.delete(g);
          }, 1400);
          lineRevertTimers.set(g, t);
        });
      },
    };
  },
};

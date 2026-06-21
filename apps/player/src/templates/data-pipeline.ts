import type { Template, TemplateHandle } from './registry';

/**
 * data-pipeline — shows data flowing through transformation stages,
 * with ACTUAL VALUES visible at each step. Unlike transform-grid (which
 * shows abstract stage labels), this renders the data itself — arrays of
 * objects becoming filtered, mapped, reduced, enriched.
 *
 * lenzon/ui v0.1 styling: each card is a .cs-plate--sunken stacked
 * vertically. The operation name reads as a .cs-eyebrow (uppercase mono
 * tag); the human-readable label reads as body text below. The down
 * arrow between stages uses --cs-ink-3 (the neutral connector tint).
 * Highlighted cells / rows take the warm accent — the one warm thing
 * per view. Accent budget is enforced across stage emphasis pulses.
 *
 * The stage cards are sunken but sit on the bare room (no outer
 * default plate), per the migration spec recipe.
 *
 * Slot schema:
 *   title?:     string
 *   input:      InputSpec            (the starting data)
 *   stages:     StageSpec[]          (2–5 transformation stages)
 *   staggerMs?: number               (delay between stages, default 1500)
 *
 * emphasize(target): target is the stage index as a string ("0", "1", …).
 *   Input block is NOT indexed — stage "0" is the first transformation.
 *   Emphasize highlights that stage and pulses a warm ring.
 */

type DisplayMode = 'table' | 'value' | 'breakdown';

interface InputSpec {
  /** Label above the input block, e.g. "Line Items". */
  label: string;
  /** The raw data. Array of objects for table mode, or a single object. */
  data: Record<string, unknown>[] | Record<string, unknown>;
  /** How to render the input data. Default: "table". */
  display?: DisplayMode;
}

interface StageSpec {
  /** Short operation description, e.g. "map → multiply" or "reduce → sum". */
  operation: string;
  /** Human-readable label, e.g. "Calculate each line total". */
  label: string;
  /** The data AFTER this stage runs. Shape depends on display mode. */
  result: Record<string, unknown>[] | Record<string, unknown>;
  /** Which key to visually highlight in the result (the "new" value). */
  highlight?: string;
  /** How to render this stage's result. Default: "table". */
  display?: DisplayMode;
}

interface DataPipelineContent {
  title?: string;
  input: InputSpec;
  stages: StageSpec[];
  /** Ms between each stage revealing. Default: 1500. */
  staggerMs?: number;
}

function coerceData(
  data: unknown,
  mode: DisplayMode,
): Record<string, unknown>[] | Record<string, unknown> {
  if (data == null) return mode === 'table' ? [] : {};
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return { value: data };
  }
  if (Array.isArray(data)) {
    return data.map((row) =>
      row != null && typeof row === 'object'
        ? (row as Record<string, unknown>)
        : { value: row },
    );
  }
  return data as Record<string, unknown>;
}

function renderDataBlock(
  dataIn: unknown,
  mode: DisplayMode,
  highlight?: string,
): HTMLElement {
  const data = coerceData(dataIn, mode);
  const block = document.createElement('div');
  block.className = 'sb-pipeline-block';

  if (mode === 'table' && Array.isArray(data)) {
    const table = document.createElement('table');
    table.className = 'sb-pipeline-table';

    if (data.length > 0) {
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      Object.keys(data[0]).forEach((key) => {
        const th = document.createElement('th');
        th.className = 'sb-pipeline-th';
        th.textContent = key;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
    }

    const tbody = document.createElement('tbody');
    data.forEach((row) => {
      const tr = document.createElement('tr');
      Object.entries(row).forEach(([key, val]) => {
        const td = document.createElement('td');
        td.className =
          key === highlight ? 'sb-pipeline-td sb-highlight' : 'sb-pipeline-td';
        td.textContent = String(val);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    block.appendChild(table);
  } else if (mode === 'value') {
    const obj = Array.isArray(data) ? data[0] ?? {} : data;
    Object.entries(obj).forEach(([key, val]) => {
      const row = document.createElement('div');
      row.className =
        key === highlight
          ? 'sb-pipeline-value-row sb-highlight'
          : 'sb-pipeline-value-row';
      const kSpan = document.createElement('span');
      kSpan.className = 'sb-pipeline-value-key';
      kSpan.textContent = key;
      const vSpan = document.createElement('span');
      vSpan.textContent = typeof val === 'number' ? val.toLocaleString() : String(val);
      row.appendChild(kSpan);
      row.appendChild(vSpan);
      block.appendChild(row);
    });
  } else {
    const obj = Array.isArray(data) ? data[0] ?? {} : data;
    Object.entries(obj).forEach(([key, val]) => {
      const row = document.createElement('div');
      row.className =
        key === highlight
          ? 'sb-pipeline-breakdown-row sb-highlight'
          : 'sb-pipeline-breakdown-row';
      const kSpan = document.createElement('span');
      kSpan.textContent = key;
      const vSpan = document.createElement('span');
      vSpan.textContent = typeof val === 'number' ? val.toLocaleString() : String(val);
      row.appendChild(kSpan);
      row.appendChild(vSpan);
      block.appendChild(row);
    });
  }

  return block;
}

export const dataPipelineTemplate: Template = {
  id: 'data-pipeline',
  version: '1.0.0',
  description:
    'Animated data transformation pipeline showing actual values flowing through stacked sunken glass cards (map, filter, reduce, etc.).',
  slots: {
    title: 'string — optional headline',
    input: '{ label, data, display? } — the starting data',
    stages:
      '{ operation, label, result, highlight?, display? }[] — transformation stages (2–5)',
    staggerMs: 'number — delay between stage reveals (default 1500)',
  },
  demo: {
    label: 'Data Pipeline',
    content: {
      title: 'Checkout math',
      input: {
        label: 'Line Items',
        display: 'table',
        data: [
          { sku: 'A1', qty: 2, price: 12 },
          { sku: 'B3', qty: 1, price: 30 },
          { sku: 'C7', qty: 3, price: 5 },
        ],
      },
      stages: [
        {
          operation: 'map → qty × price',
          label: 'Line totals',
          display: 'table',
          highlight: 'total',
          result: [
            { sku: 'A1', qty: 2, price: 12, total: 24 },
            { sku: 'B3', qty: 1, price: 30, total: 30 },
            { sku: 'C7', qty: 3, price: 5, total: 15 },
          ],
        },
        {
          operation: 'reduce → sum(total)',
          label: 'Subtotal',
          display: 'value',
          highlight: 'subtotal',
          result: { subtotal: 69 },
        },
        {
          operation: 'apply discount + tax',
          label: 'Grand total',
          display: 'breakdown',
          highlight: 'total',
          result: { subtotal: 69, discount: -5, tax: 5.76, total: 69.76 },
        },
      ],
      staggerMs: 1400,
    },
    emphasizeAfter: { target: '2', delayMs: 4600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as DataPipelineContent;
    const stages = c.stages ?? [];
    const staggerMs = c.staggerMs ?? 1500;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-pipeline-wrapper';

    if (c.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'cs-title cs-title--m sb-pipeline-title';
      titleEl.textContent = c.title;
      wrapper.appendChild(titleEl);
    }

    const column = document.createElement('div');
    column.className = 'sb-pipeline-column';

    const stageCards: HTMLElement[] = [];

    const makeCard = (
      headerText: string,
      subText: string | undefined,
      data: unknown,
      display: DisplayMode,
      highlight?: string,
    ): HTMLElement => {
      const card = document.createElement('div');
      card.className = 'cs-plate cs-plate--sunken sb-pipeline-card';

      const header = document.createElement('div');
      header.className = subText
        ? 'cs-eyebrow cs-eyebrow--cool sb-pipeline-card-header sb-with-sub'
        : 'cs-eyebrow cs-eyebrow--cool sb-pipeline-card-header';
      header.textContent = headerText;
      card.appendChild(header);

      if (subText) {
        const sub = document.createElement('div');
        sub.className = 'sb-pipeline-card-sub';
        sub.textContent = subText;
        card.appendChild(sub);
      }

      card.appendChild(renderDataBlock(data, display, highlight));
      return card;
    };

    const makeArrow = (): HTMLElement => {
      const arrow = document.createElement('div');
      arrow.className = 'sb-pipeline-arrow';
      arrow.textContent = '\u25BC'; // ▼
      return arrow;
    };

    const inputCard = makeCard(
      c.input.label,
      undefined,
      c.input.data,
      c.input.display ?? 'table',
    );
    column.appendChild(inputCard);

    const arrows: HTMLElement[] = [];

    stages.forEach((stage) => {
      const arrow = makeArrow();
      arrows.push(arrow);
      column.appendChild(arrow);

      const card = makeCard(
        stage.operation,
        stage.label,
        stage.result,
        stage.display ?? 'table',
        stage.highlight,
      );
      stageCards.push(card);
      column.appendChild(card);
    });

    wrapper.appendChild(column);
    presenter.domRoot.appendChild(wrapper);

    // Fit long header/sub text — Producer sometimes hands long operation
    // names that wrap one word per line in the narrow column, reading as
    // "vertical text". Step the font down until each line fits. See
    // TEMPLATE-SPEC.md §9c.
    const HEADER_STEPS = [11, 10, 9];
    const SUB_STEPS = [14, 13, 12, 11];
    const rafFitId = requestAnimationFrame(() => {
      const fit = (el: HTMLElement, steps: number[]) => {
        el.style.whiteSpace = 'nowrap';
        for (const size of steps) {
          el.style.fontSize = `${size}px`;
          if (el.scrollWidth <= el.clientWidth) return;
        }
        el.style.whiteSpace = '';
      };
      wrapper
        .querySelectorAll<HTMLElement>('.sb-pipeline-card-header')
        .forEach((el) => fit(el, HEADER_STEPS));
      wrapper
        .querySelectorAll<HTMLElement>('.sb-pipeline-card-sub')
        .forEach((el) => fit(el, SUB_STEPS));
    });

    const timers: number[] = [];

    requestAnimationFrame(() => inputCard.classList.add('sb-visible'));

    const revealStage = (index: number) => {
      arrows[index]?.classList.add('sb-visible');
      stageCards[index]?.classList.add('sb-visible');
    };

    stages.forEach((_, i) => {
      timers.push(window.setTimeout(() => revealStage(i), (i + 1) * staggerMs));
    });

    const emphTimers = new Map<HTMLElement, number>();

    return {
      dismiss() {
        cancelAnimationFrame(rafFitId);
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        wrapper.remove();
      },
      emphasize(target: string) {
        const idx = parseInt(target, 10);
        if (Number.isNaN(idx) || !stageCards[idx]) return;
        revealStage(idx);
        const card = stageCards[idx];

        // Accent budget = 1: clear any other stage currently pulsing.
        stageCards.forEach((other) => {
          if (other !== card && other.classList.contains('sb-emphasize')) {
            other.classList.remove('sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
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
      },
    };
  },
};

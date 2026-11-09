import type { Template, TemplateHandle } from './registry';

/**
 * objective-ledger — the "what got done" beat of a series explainer. The
 * series analogue of pr-objectives: rolls objectives across the whole
 * window into one ledger, grouped by era, every line attributed to the
 * PR it came from.
 *
 * Why not title-bullets with grouped content: for a 3-PR series it
 * probably should be, and the producer should reach for the simpler
 * template there. This one earns its place at 20+ PRs, where three things
 * become structural rather than cosmetic — grouping by era, per-line PR
 * attribution, and kind-colouring (primary / secondary / constraint).
 * A flat bullet list of 30 statements with no attribution answers
 * "what got done" but not "when" or "by which change", which is most of
 * what a series viewer wants to know.
 *
 * Layout:
 *   1. Header strip  — eyebrow + scene tag + coverage chip.
 *   2. Title row     — italic display headline.
 *   3. Group blocks  — one per era: a small era label rule, then rows.
 *   4. Row           — mono PR ref (fixed column) + statement + kind dot.
 *   5. Overflow note — when maxItems truncates, the count left out is
 *                      stated rather than silently dropped.
 *
 * Honesty constraints built into the layout:
 *   - `maxItems` truncation is DISCLOSED. A ledger that quietly showed 20
 *     of 113 objectives would read as complete. When rows are dropped the
 *     template renders "+93 more not shown" as a real row, and the header
 *     chip carries "N of M". This is the §5-of-ROLLUP-TRIAGE-SIGNALS rule
 *     ("the rollup states its own coverage") applied at template level, so
 *     it holds even if the producer forgets to narrate it.
 *   - Truncation is spread across groups, not taken off the tail. Cutting
 *     the tail would silently delete the most recent era entirely; instead
 *     each group keeps a proportional share so every era stays represented.
 *   - Constraint rows carry no check affordance. Per pr-objectives, a
 *     constraint is asserted, never proven, so it cannot be ticked off.
 *
 * Fill mode: full-bleed.
 * Calm: one-shot staggered reveal. Scrolls (overflow-y: auto) rather than
 * shrinking type when the ledger outgrows the plate — a ledger is for
 * reading, and illegible rows serve nobody.
 *
 * emphasize(target):
 *   "pr:<number>"    → pulse every row from that PR (accepts "pr:#33")
 *   "era:<label>"    → pulse the whole group block
 *   "item:<index>"   → pulse one row by its flat 0-based index
 *   "<index>"        → same, bare numeric form (§6 allows either)
 */

type ObjectiveKind = 'primary' | 'secondary' | 'constraint';

interface LedgerItem {
  prNumber: string | number;
  statement: string;
  kind?: ObjectiveKind;
}

interface LedgerGroup {
  era: string;
  items: LedgerItem[];
}

interface ObjectiveLedgerContent {
  title?: string;
  groups: LedgerGroup[];
  /** Which kinds to render. Default: all three. */
  showKinds?: ObjectiveKind[];
  /** Cap on rendered rows. Truncation is disclosed, never silent. */
  maxItems?: number;
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

const ALL_KINDS: ObjectiveKind[] = ['primary', 'secondary', 'constraint'];

function normalizeKind(raw: string | undefined): ObjectiveKind {
  return raw === 'secondary' || raw === 'constraint' ? raw : 'primary';
}

function normalizePr(raw: string | number | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '#—';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function prKey(raw: string | number | undefined): string {
  return String(raw ?? '').trim().replace(/^#/, '');
}

/**
 * Spread a row budget across groups proportionally to their size, so
 * truncation does not delete a whole era off the tail.
 *
 * Two guarantees are in tension and the resolution matters:
 *
 *   1. Every non-empty group should keep at least one row — a single
 *      surviving row still tells the viewer that era existed.
 *   2. The rendered total must never exceed `budget`.
 *
 * When `budget` is at least the number of non-empty groups, both hold:
 * each group starts at one row and the remainder is distributed by
 * proportional claim.
 *
 * When `budget` is smaller than the number of non-empty groups, they
 * cannot both hold and **the budget wins** — the strongest `budget`
 * claims get one row each and the rest get none. Honouring the per-group
 * floor instead would silently render more rows than the caller asked
 * for, which is the same class of dishonesty as silent truncation: the
 * caller set a cap because something downstream (a plate, a reading pace)
 * cannot take more. The unseated groups are then disclosed by the caller
 * — their rows count into `hiddenTotal` and the footer names how many
 * eras were dropped — so an era is stated as a number, never quietly
 * absent.
 */
function allocate(sizes: number[], budget: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total <= budget) return sizes.slice();
  if (budget <= 0) return sizes.map(() => 0);

  const nonEmpty = sizes.reduce((a, n) => a + (n > 0 ? 1 : 0), 0);

  // Rank groups by proportional claim (largest remainder of the exact
  // share). Used both to decide who gets a floor row when the budget is
  // too small to seat everyone, and to decide who surrenders a surplus
  // row when it isn't.
  const exact = sizes.map((n) => (n / total) * budget);
  const byClaim = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);

  // Pathological case: fewer rows than groups. Some era genuinely cannot
  // be seated, so seat the `budget` strongest claims with one row each.
  // The budget is a hard ceiling — the unseated eras are disclosed as a
  // count by the caller (see the note above).
  if (budget < nonEmpty) {
    const out: number[] = sizes.map(() => 0);
    let seated = 0;
    for (const { i } of byClaim) {
      if (seated >= budget) break;
      if (sizes[i] > 0) {
        out[i] = 1;
        seated++;
      }
    }
    return out;
  }

  // Normal case: the budget can seat every non-empty group. Give each one
  // its floor row first, then distribute the remainder by proportional
  // claim. Starting from the floor rather than from Math.floor(exact)
  // means no group can be left at zero while another holds a surplus.
  const out: number[] = sizes.map((n) => (n > 0 ? 1 : 0));
  let used = out.reduce((a, b) => a + b, 0);

  let guard = 0;
  while (used < budget && guard++ < 10_000) {
    let moved = false;
    for (const { i } of byClaim) {
      if (used >= budget) break;
      if (out[i] < sizes[i]) {
        out[i]++;
        used++;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export const objectiveLedgerTemplate: Template = {
  id: 'objective-ledger',
  version: '1.0.0',
  description:
    'The "what got done" beat of a series explainer: objectives from many ' +
    'PRs rolled into one ledger, grouped by era, each line attributed to ' +
    'its PR and coloured by kind (primary / secondary / constraint). When ' +
    'maxItems truncates the list, the number left out is stated in a row ' +
    'and in the header coverage chip rather than silently dropped.',
  slots: {
    title: 'string — optional headline (default "What the work set out to do")',
    groups: '{ era, items: { prNumber, statement, kind? }[] }[] — grouped by era',
    showKinds:
      "('primary'|'secondary'|'constraint')[] — which kinds to render " +
      '(default all three)',
    maxItems:
      'number — cap on rendered rows, spread across groups so no era ' +
      'vanishes; the remainder is disclosed, not hidden',
    staggerMs: 'number — total row reveal window (default 1100)',
  },
  demo: {
    label: 'Objective Ledger',
    content: {
      title: 'What the work set out to do',
      showKinds: ['primary', 'constraint'],
      maxItems: 14,
      groups: [
        {
          era: 'Viewer & template polish',
          items: [
            { prNumber: 10, statement: 'Fix entity-map connector coordinates under embed scaling', kind: 'primary' },
            { prNumber: 11, statement: 'Give every scene a provenance rail', kind: 'primary' },
            { prNumber: 12, statement: 'Accept a PR URL as run input', kind: 'primary' },
            { prNumber: 15, statement: 'Collapse three palette maps into one source of truth', kind: 'primary' },
            { prNumber: 16, statement: 'Keep templates calm by default', kind: 'constraint' },
          ],
        },
        {
          era: 'The Sidecar build-out',
          items: [
            { prNumber: 17, statement: 'Stand up the ledger as the doc-state record', kind: 'primary' },
            { prNumber: 21, statement: 'Expose the corpus as a typed query surface', kind: 'primary' },
            { prNumber: 21, statement: 'Preserve Analysis as authoritative source; index remains a cache', kind: 'constraint' },
            { prNumber: 22, statement: 'Host the corpus MCP server', kind: 'primary' },
            { prNumber: 26, statement: 'Refuse checks with unjoinable inputs rather than reporting empty results', kind: 'constraint' },
            { prNumber: 30, statement: 'Ship the skill that drives the doctrine', kind: 'primary' },
            { prNumber: 31, statement: 'Validate ledger entries against the schema', kind: 'primary' },
          ],
        },
        {
          era: 'Surfacing it',
          items: [
            { prNumber: 32, statement: 'Run the clean-machine gate and fix what it found', kind: 'primary' },
            { prNumber: 33, statement: 'Show snapshot counts in the UI', kind: 'primary' },
            { prNumber: 33, statement: 'Preserve no snapshot as distinct from empty or zero counts', kind: 'constraint' },
          ],
        },
      ],
      staggerMs: 1100,
    },
    emphasizeAfter: { target: 'pr:21', delayMs: 3400 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as ObjectiveLedgerContent;

    const title = c.title?.trim() || 'What the work set out to do';
    const stagger = Math.max(200, c.staggerMs ?? 1100);
    const showKinds: ObjectiveKind[] =
      Array.isArray(c.showKinds) && c.showKinds.length
        ? c.showKinds.filter((k) => ALL_KINDS.includes(k))
        : ALL_KINDS;

    // Filter by kind first, so maxItems budgets over what will actually
    // render rather than over the raw payload.
    const groupsIn = (Array.isArray(c.groups) ? c.groups : [])
      .filter(Boolean)
      .map((g) => ({
        era: g.era ?? '',
        items: (Array.isArray(g.items) ? g.items : [])
          .filter(Boolean)
          .filter((it) => showKinds.includes(normalizeKind(it.kind))),
      }))
      .filter((g) => g.items.length > 0);

    const totalAvailable = groupsIn.reduce((a, g) => a + g.items.length, 0);
    const budget =
      Number.isFinite(c.maxItems as number) && (c.maxItems as number) > 0
        ? Math.trunc(c.maxItems as number)
        : totalAvailable;

    const perGroup = allocate(
      groupsIn.map((g) => g.items.length),
      budget,
    );
    const allocated = groupsIn.map((g, i) => ({
      era: g.era,
      items: g.items.slice(0, perGroup[i]),
      /** How many of this group's rows the budget cut. */
      hidden: g.items.length - perGroup[i],
    }));
    // A group the budget could not fund at all is dropped from the render
    // rather than shown as a bare era label over nothing. Its rows still
    // count into hiddenTotal, and the number of dropped eras is stated in
    // the footer — so the era is disclosed as a count, never silently
    // absent. See the note on allocate().
    const groups = allocated.filter((g) => g.items.length > 0);
    const droppedEras = allocated.length - groups.length;
    const shown = groups.reduce((a, g) => a + g.items.length, 0);
    const hiddenTotal = totalAvailable - shown;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-objledger-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-objledger-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-objledger-plate';

    // Header — eyebrow, coverage chip, scene tag. The coverage chip is
    // the template's own disclosure of what it is not showing.
    const header = document.createElement('div');
    header.className = 'sb-objledger-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-objledger-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 02 / objective-ledger';

    const headRight = document.createElement('span');
    headRight.className = 'sb-objledger-header-right';
    const coverage = document.createElement('span');
    coverage.className = hiddenTotal > 0
      ? 'cs-badge cs-badge--warn sb-objledger-coverage'
      : 'cs-badge cs-badge--ink sb-objledger-coverage';
    coverage.textContent =
      hiddenTotal > 0
        ? `${shown} of ${totalAvailable}`
        : `${totalAvailable} ${totalAvailable === 1 ? 'objective' : 'objectives'}`;
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-objledger-tag';
    sceneTag.textContent = c.sceneTag ?? 'LEDGER';
    headRight.append(coverage, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-objledger-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-objledger-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const scroll = document.createElement('div');
    scroll.className = 'sb-objledger-scroll';

    type RowEntry = { el: HTMLElement; prKey: string; index: number };
    const rows: RowEntry[] = [];
    const groupEls = new Map<string, HTMLElement>();
    let flatIndex = 0;

    for (const group of groups) {
      const block = document.createElement('section');
      block.className = 'sb-objledger-group';
      block.dataset.era = group.era;

      const eraHead = document.createElement('div');
      eraHead.className = 'sb-objledger-era';
      const eraLabel = document.createElement('span');
      eraLabel.className = 'sb-objledger-era-label';
      eraLabel.textContent = group.era;
      const eraCount = document.createElement('span');
      eraCount.className = 'sb-objledger-era-count';
      eraCount.textContent =
        group.hidden > 0
          ? `${group.items.length} of ${group.items.length + group.hidden}`
          : String(group.items.length);
      eraHead.append(eraLabel, eraCount);
      block.appendChild(eraHead);

      const list = document.createElement('ol');
      list.className = 'sb-objledger-list';

      for (const item of group.items) {
        const kind = normalizeKind(item.kind);
        const row = document.createElement('li');
        row.className = `sb-objledger-row sb-objledger-row--${kind}`;
        row.dataset.prKey = prKey(item.prNumber);
        row.dataset.index = String(flatIndex);

        const ref = document.createElement('span');
        ref.className = 'sb-objledger-ref';
        ref.textContent = normalizePr(item.prNumber);

        const text = document.createElement('span');
        text.className = 'sb-objledger-text';
        text.textContent = item.statement ?? '';

        const kindMark = document.createElement('span');
        kindMark.className = `sb-objledger-kind sb-objledger-kind--${kind}`;
        // Constraints get the word, not a dot — "WON'T" is the same
        // framing pr-objectives uses, so the two templates read as one
        // family and a constraint is never mistaken for a deliverable.
        kindMark.textContent = kind === 'constraint' ? "WON'T" : '';

        row.append(ref, text, kindMark);
        list.appendChild(row);
        rows.push({ el: row, prKey: prKey(item.prNumber), index: flatIndex });
        flatIndex++;
      }

      block.appendChild(list);

      // Per-group truncation note. Stated at the point of the cut so the
      // viewer knows WHICH era they are seeing partially.
      if (group.hidden > 0) {
        const more = document.createElement('div');
        more.className = 'sb-objledger-more';
        more.textContent = `+${group.hidden} more in this era not shown`;
        block.appendChild(more);
      }

      scroll.appendChild(block);
      groupEls.set(group.era, block);
    }

    body.appendChild(scroll);

    // Whole-ledger truncation footer — the coverage claim in words, so it
    // survives even if the header chip is cropped in a thumbnail.
    let footer: HTMLElement | null = null;
    if (hiddenTotal > 0) {
      footer = document.createElement('div');
      footer.className = 'sb-objledger-footer';
      const eraPart =
        droppedEras > 0
          ? `${groups.length} of ${allocated.length} eras`
          : `${groups.length} ${groups.length === 1 ? 'era' : 'eras'}`;
      footer.textContent =
        `Showing ${shown} of ${totalAvailable} objectives across ` +
        `${eraPart}. ${hiddenTotal} not shown` +
        (droppedEras > 0
          ? `, including every objective from ${droppedEras} ` +
            `${droppedEras === 1 ? 'era' : 'eras'}.`
          : '.');
      body.appendChild(footer);
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal — header/title, then rows on a shared stagger budget.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 250));

    // Era heads reveal just ahead of their first row (scheduled below)
    // rather than on their own cadence, so a group never sits on stage as
    // a lone label with no rows under it.
    const perRow = Math.max(30, Math.floor(stagger / Math.max(1, rows.length)));
    rows.forEach((r, i) => {
      timers.push(
        window.setTimeout(() => r.el.classList.add('sb-visible'), 420 + i * perRow),
      );
    });
    // Era heads reveal just ahead of their first row.
    groups.forEach((g, gi) => {
      const block = groupEls.get(g.era);
      if (!block) return;
      const firstRowIndex = groups
        .slice(0, gi)
        .reduce((a, x) => a + x.items.length, 0);
      const at = Math.max(300, 420 + firstRowIndex * perRow - 80);
      timers.push(
        window.setTimeout(
          () => block.querySelector('.sb-objledger-era')?.classList.add('sb-visible'),
          at,
        ),
      );
      const more = block.querySelector('.sb-objledger-more');
      if (more) {
        const moreAt = 420 + (firstRowIndex + g.items.length) * perRow;
        timers.push(
          window.setTimeout(() => more.classList.add('sb-visible'), moreAt),
        );
      }
    });
    if (footer) {
      const at = 420 + rows.length * perRow + 160;
      timers.push(window.setTimeout(() => footer!.classList.add('sb-visible'), at));
    }

    // Emphasize — a PR target lights every row from that PR, because a
    // single PR legitimately contributes several objectives and lighting
    // only the first would misrepresent the change.
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

    const light = (els: Array<Element | null | undefined>) => {
      const present = els.filter(Boolean) as Element[];
      if (!present.length) return;
      clearActive();
      for (const el of present) {
        el.classList.add('sb-visible', 'sb-emphasize');
      }
      activeEls = present;
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
          light([groupEls.get(raw.slice(4))]);
          return;
        }
        if (raw.startsWith('pr:')) {
          const key = prKey(raw.slice(3));
          light(rows.filter((r) => r.prKey === key).map((r) => r.el));
          return;
        }
        const idxRaw = raw.startsWith('item:') ? raw.slice(5) : raw;
        const idx = Number(idxRaw);
        if (Number.isInteger(idx)) {
          light([rows.find((r) => r.index === idx)?.el]);
          return;
        }
        // Bare non-numeric, non-prefixed target: try it as an era label
        // before giving up, since that is the likeliest producer slip.
        light([groupEls.get(raw)]);
      },
    };
  },
};

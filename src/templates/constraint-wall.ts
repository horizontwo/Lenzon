import type { Template, TemplateHandle } from './registry';

/**
 * constraint-wall — the "what we refused to do" beat. Renders the
 * constraint-objective thread of a series as a wall of deliberate
 * refusals.
 *
 * This is the template with no existing equivalent in the set. Nothing
 * else shows what a body of work deliberately did NOT do, and on a corpus
 * that carries constraint objectives as first-class analyst output, that
 * is the most distinctive thing the product can say about a stretch of
 * work. Every other template answers "what happened"; this one answers
 * "what was held back", which is usually the more expensive decision.
 *
 * The structural requirement that makes this its own template rather
 * than a variant of objective-ledger: **constraints legitimately carry
 * empty evidence.** They describe an absence — code that was not written,
 * a migration not run, an API not broken — so there is frequently no line
 * to cite. Every other evidence-bearing template in the set treats a
 * missing citation as a degraded state to be styled around. Here it is
 * the normal case, and the layout must look deliberate with zero
 * citations present, not like a table with a blank column.
 *
 * How that is honoured:
 *   - Evidence is rendered as an OPTIONAL trailing line inside the card,
 *     never as a column or a fixed-height slot. A card with no evidence
 *     is simply a shorter card, and a wall of them looks intentional.
 *   - No "—" / "n/a" placeholder is ever emitted. An em-dash in an
 *     evidence slot reads as missing data; absence of the line reads as
 *     "there was nothing to point at", which is the truth.
 *   - The header states how many constraints carry evidence, so a viewer
 *     is told the citation rate rather than inferring it from the cards.
 *
 * Layout:
 *   1. Header strip — eyebrow + citation-rate chip + scene tag.
 *   2. Title row    — italic display heading (default "What this work
 *                     refused to do").
 *   3. The wall     — a responsive masonry-ish column flow of cards.
 *                     Each card: a "WON'T" mark, the statement, an
 *                     optional PR ref, an optional evidence line.
 *
 * Tone slot:
 *   'stated' (default) — full-contrast cards; the refusals are a claim.
 *   'dim'              — lower-contrast cards for when the wall is a
 *                        background beat under narration rather than the
 *                        thing being read aloud.
 *
 * Fill mode: full-bleed.
 * Calm: one-shot staggered reveal, no continuous motion.
 *
 * emphasize(target):
 *   "item:<index>" → pulse one card by 0-based index
 *   "<index>"      → same, bare numeric form (§6 allows either)
 *   "pr:<number>"  → pulse every card from that PR
 */

interface ConstraintItem {
  statement: string;
  prNumber?: string | number;
  /**
   * Optional. Constraints describe absence, so this is frequently empty
   * and that is not a defect — see the header doc.
   */
  evidence?: string;
}

interface ConstraintWallContent {
  heading?: string;
  items: ConstraintItem[];
  /** 'stated' (default) | 'dim' */
  tone?: 'stated' | 'dim';
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

function normalizePr(raw: string | number | undefined): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function prKey(raw: string | number | undefined): string {
  return String(raw ?? '').trim().replace(/^#/, '');
}

export const constraintWallTemplate: Template = {
  id: 'constraint-wall',
  version: '1.0.0',
  use: 'any',
  emphasizeTargets: 'a card by 0-based index ("item:2" or "2"), or "pr:<number>" for every card from that PR',
  description:
    'The "what we refused to do" beat of a series explainer: constraint ' +
    'objectives rendered as a wall of deliberate refusals, each card ' +
    "carrying a WON'T mark, the statement, an optional PR ref, and an " +
    'optional evidence line. Built for the case where evidence is absent ' +
    'by nature — a constraint describes something that was not done — so ' +
    'cards with no citation read as intentional rather than incomplete.',
  slots: {
    heading:
      'string — optional headline (default "What this work refused to do")',
    items:
      '{ statement, prNumber?, evidence? }[] — the refusals; evidence is ' +
      'legitimately absent on most constraints and is simply omitted, ' +
      'never placeholdered',
    tone:
      "'stated' | 'dim' — full-contrast claim (default) vs a quieter " +
      'background wall under narration',
    staggerMs: 'number — total card reveal window (default 1000)',
  },
  demo: {
    label: 'Constraint Wall',
    content: {
      heading: 'What this work refused to do',
      tone: 'stated',
      items: [
        {
          statement: 'Preserve Analysis as the authoritative source; the index remains a cache',
          prNumber: 21,
          evidence: 'apps/server/lib/corpus/queries.ts',
        },
        {
          statement: 'Refuse checks with unjoinable inputs rather than reporting empty results',
          prNumber: 26,
          evidence: 'packages/sidecar/src/validate.ts',
        },
        {
          statement: 'Preserve "no snapshot" as distinct from empty or zero counts',
          prNumber: 33,
        },
        {
          statement: 'No invented numbers — every count the narration states is computed upstream',
          prNumber: 21,
        },
        {
          statement: 'Keep templates calm by default; continuous motion stays opt-in',
          prNumber: 16,
        },
        {
          statement: 'No database migrations in this stretch',
          prNumber: 17,
        },
      ],
      staggerMs: 1000,
    },
    emphasizeAfter: { target: 'item:2', delayMs: 3000 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as ConstraintWallContent;

    const heading = c.heading?.trim() || 'What this work refused to do';
    const tone = c.tone === 'dim' ? 'dim' : 'stated';
    const stagger = Math.max(200, c.staggerMs ?? 1000);
    const items = (Array.isArray(c.items) ? c.items : [])
      .filter(Boolean)
      .filter((it) => String(it.statement ?? '').trim().length > 0);

    const withEvidence = items.filter(
      (it) => String(it.evidence ?? '').trim().length > 0,
    ).length;

    const wrapper = document.createElement('div');
    wrapper.className = `sb-cwall-wrapper sb-cwall-wrapper--${tone}`;

    const stage = document.createElement('div');
    stage.className = 'sb-cwall-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-cwall-plate';

    // Header — eyebrow, citation-rate chip, scene tag. The chip states
    // the citation rate outright so a viewer is told how many refusals
    // point at a line, rather than inferring it from which cards happen
    // to have a trailing row.
    const header = document.createElement('div');
    header.className = 'sb-cwall-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-cwall-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 03 / constraint-wall';

    const headRight = document.createElement('span');
    headRight.className = 'sb-cwall-header-right';
    const rate = document.createElement('span');
    rate.className = 'cs-badge cs-badge--ink sb-cwall-rate';
    // Phrasing matters: "N cited" is a fact about the corpus. "N missing"
    // would frame the normal case as a shortfall.
    rate.textContent = items.length
      ? `${items.length} ${items.length === 1 ? 'refusal' : 'refusals'} · ${withEvidence} cited`
      : 'none recorded';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--warn sb-cwall-tag';
    sceneTag.textContent = c.sceneTag ?? "WON'T";
    headRight.append(rate, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-cwall-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-cwall-title';
    titleEl.textContent = heading;
    body.appendChild(titleEl);

    const wall = document.createElement('div');
    wall.className = 'sb-cwall-grid';
    // Column count scales with the card count so six refusals don't
    // render as one tall column and two don't stretch across three.
    wall.style.setProperty(
      '--sb-cwall-cols',
      String(items.length <= 2 ? 1 : items.length <= 6 ? 2 : 3),
    );

    type CardEntry = { el: HTMLElement; prKey: string; index: number };
    const cards: CardEntry[] = [];

    items.forEach((item, i) => {
      const card = document.createElement('article');
      card.className = 'cs-plate cs-plate--sunken sb-cwall-card';
      card.dataset.index = String(i);
      const key = prKey(item.prNumber);
      if (key) card.dataset.prKey = key;

      // Top row — the WON'T mark and, when present, the PR ref. Built
      // only when there is something to put in it, so a card with no PR
      // ref keeps the mark hard against the statement rather than
      // floating above an empty rail.
      const top = document.createElement('div');
      top.className = 'sb-cwall-card-top';
      const mark = document.createElement('span');
      mark.className = 'sb-cwall-mark';
      mark.textContent = "WON'T";
      top.appendChild(mark);

      const ref = normalizePr(item.prNumber);
      if (ref) {
        const refEl = document.createElement('span');
        refEl.className = 'sb-cwall-ref';
        refEl.textContent = ref;
        top.appendChild(refEl);
      }
      card.appendChild(top);

      const statement = document.createElement('p');
      statement.className = 'sb-cwall-statement';
      statement.textContent = item.statement;
      card.appendChild(statement);

      // Evidence — optional trailing line. Absent means absent: no
      // placeholder, no reserved height, no empty column. See header doc.
      const ev = String(item.evidence ?? '').trim();
      if (ev) {
        const evEl = document.createElement('div');
        evEl.className = 'sb-cwall-evidence';
        const evMark = document.createElement('span');
        evMark.className = 'sb-cwall-evidence-mark';
        evMark.textContent = '↳';
        const evText = document.createElement('span');
        evText.className = 'sb-cwall-evidence-text';
        evText.textContent = ev;
        evEl.append(evMark, evText);
        card.appendChild(evEl);
      }

      wall.appendChild(card);
      cards.push({ el: card, prKey: key, index: i });
    });

    body.appendChild(wall);

    const timers: number[] = [];

    // Empty state. A series with no recorded constraints is a real and
    // informative outcome — it means the analyst found no stated
    // boundaries — so it gets a sentence rather than an empty plate.
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'sb-cwall-empty';
      empty.textContent =
        'No constraint objectives were recorded across this window.';
      body.appendChild(empty);
      // Reveal alongside the title; there is no card stagger to wait on.
      timers.push(
        window.setTimeout(() => empty.classList.add('sb-visible'), 380),
      );
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal.
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 250));

    const perCard = Math.max(60, Math.floor(stagger / Math.max(1, cards.length)));
    cards.forEach((entry, i) => {
      timers.push(
        window.setTimeout(
          () => entry.el.classList.add('sb-visible'),
          430 + i * perCard,
        ),
      );
    });

    // Emphasize.
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
      for (const el of present) el.classList.add('sb-visible', 'sb-emphasize');
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

        if (raw.startsWith('pr:')) {
          const key = prKey(raw.slice(3));
          light(cards.filter((c2) => c2.prKey === key).map((c2) => c2.el));
          return;
        }
        const idxRaw = raw.startsWith('item:') ? raw.slice(5) : raw;
        const idx = Number(idxRaw);
        if (Number.isInteger(idx)) {
          light([cards.find((c2) => c2.index === idx)?.el]);
        }
      },
    };
  },
};

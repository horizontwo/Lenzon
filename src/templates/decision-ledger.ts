import type { Template, TemplateHandle } from './registry';

/**
 * decision-ledger — the decisions a plan has made and the ones it has not.
 * PLAN-EXPLAINER-LENS decision 6.
 *
 * Why not objective-ledger: PLAN-EXPLAINER-TEMPLATES Phase 4 drew the four
 * non-roadmap plan shapes, and three of them bent objective-ledger the same
 * way. Section refs came out as "#§8.1", the chip counted "objectives", and
 * there was no way to say a decision was still open. Those are not cosmetic
 * there. The `#` prefix and the objective count are objective-ledger's
 * promises about PR material, and a mode that switched them off would blur
 * what that template means. So decisions get their own small template with
 * their own promises.
 *
 * Layout:
 *   1. Header strip  — eyebrow + state counts chip + scene tag.
 *   2. Title row     — italic display headline.
 *   3. Rows          — ref (as written) + question + state mark, with a
 *                      second line for the date and the why where allowed.
 *
 * Honesty constraints built into the layout:
 *   - Every row has a state that reads at a glance: settled, chosen,
 *     rejected or open. The word and the mark carry it, not colour alone.
 *   - An open row carries nothing extra. A date or a why on an open
 *     decision would read as an answer, so the template drops both even
 *     when the payload sends them.
 *   - An unrecognised state renders as open. Open claims nothing. Any other
 *     fallback would claim a decision the source never made.
 *   - Refs render exactly as written. No `#`, because these are section
 *     refs, not PR numbers.
 *   - The chip counts states, never "objectives", and reads straight off
 *     the rows. "1 settled · 5 open" is computed here, so a producer cannot
 *     chip a count the rows do not show.
 *   - Rows keep payload order. The doc's own order is part of the argument,
 *     and re-sorting by state would put the settled ones first and make the
 *     plan look further along than it reads.
 *   - Nothing is truncated. The list scrolls rather than shrinking type.
 *
 * Fill mode: full-bleed. Width: the shared stage max, like objective-ledger.
 * Calm: one-shot staggered reveal, no continuous motion. No scene state.
 *
 * emphasize(target):
 *   "<index>"        → pulse one row by its 0-based index
 *   "item:<index>"   → same, prefixed form
 *   "state:<state>"  → pulse every row in that state, e.g. "state:open"
 * Every pulse reverts after 1.5s.
 */

type DecisionState = 'settled' | 'chosen' | 'rejected' | 'open';

/** Chip order. Answers first, then what is still open. */
const STATES: DecisionState[] = ['settled', 'chosen', 'rejected', 'open'];

const MARK: Record<DecisionState, string> = {
  settled: '✓',
  chosen: '●',
  rejected: '✕',
  open: '○',
};

interface DecisionRow {
  /** Section ref, as written, e.g. "§8.5". Optional. */
  ref?: string;
  /** The decision, phrased as the doc phrases it. */
  question: string;
  state?: string;
  /** Display string, not parsed. Dropped on open rows. */
  date?: string;
  /** One line. Dropped on open rows. */
  why?: string;
}

interface DecisionLedgerContent {
  title?: string;
  decisions: DecisionRow[];
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

function normalizeState(raw: string | undefined): DecisionState {
  const s = String(raw ?? '').trim().toLowerCase();
  return (STATES as string[]).includes(s) ? (s as DecisionState) : 'open';
}

/** "1 settled · 5 open". States with no rows are left out. */
function countsLabel(states: DecisionState[]): string {
  if (states.length === 0) return 'no decisions';
  return STATES.map((s) => ({ s, n: states.filter((x) => x === s).length }))
    .filter(({ n }) => n > 0)
    .map(({ s, n }) => `${n} ${s}`)
    .join(' · ');
}

export const decisionLedgerTemplate: Template = {
  id: 'decision-ledger',
  version: '1.0.0',
  use: 'any',
  emphasizeTargets: 'a row by 0-based index ("2" or "item:2"), or "state:<state>" for every row in that state, such as "state:open"',
  description:
    "A plan's decisions, each marked settled, chosen, rejected or open. " +
    'Settled, chosen and rejected rows may carry a date and a one-line why; ' +
    'open rows carry nothing extra. The header counts rows by state. Refs ' +
    'render as written, without "#".',
  slots: {
    title: 'string — optional headline (default "Where the decisions stand")',
    decisions:
      "{ ref?, question, state: 'settled'|'chosen'|'rejected'|'open', date?, why? }[] " +
      '— in doc order; date and why are dropped on open rows',
    staggerMs: 'number — total row reveal window (default 900)',
  },
  demo: {
    label: 'Decision Ledger',
    content: {
      // lenzon-planning-doctrine §8. Item 6 is a statement rather than a
      // question, so it is left out, which gives the plan's "1 settled · 5
      // open". The open row's date and why are sent on purpose, to show the
      // template dropping them.
      title: 'The planning doctrine: what is decided',
      decisions: [
        { ref: '§8.1', question: 'May an agent prose-edit an L3 specification?', state: 'open' },
        { ref: '§8.2', question: 'Does reference become a fourth category, or fold into L1?', state: 'open' },
        { ref: '§8.3', question: 'Where do specs live on disk?', state: 'open' },
        {
          ref: '§8.4',
          question: 'Should landed be refused on canonical docs?',
          state: 'open',
          date: '2026-08-20',
          why: 'Dropped by the template: an open row carries nothing extra.',
        },
        {
          ref: '§8.5',
          question: 'Do L1 docs opt out of implementation drift?',
          state: 'settled',
          date: '2026-08-29',
          why: 'No. Drift is still measured; acting on it is the author’s call.',
        },
        {
          ref: '§8.7',
          question: 'Do lenzon-ui-concept and sidecar-human-legibility become children of this doc?',
          state: 'open',
        },
      ],
      staggerMs: 900,
    },
    emphasizeAfter: { target: '4', delayMs: 2600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as DecisionLedgerContent;

    const title = c.title?.trim() || 'Where the decisions stand';
    const stagger = Math.max(200, c.staggerMs ?? 900);
    const decisions = (Array.isArray(c.decisions) ? c.decisions : []).filter(
      (d) => d && String(d.question ?? '').trim(),
    );
    const states = decisions.map((d) => normalizeState(d.state));

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-decledger-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-decledger-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-decledger-plate';

    const header = document.createElement('div');
    header.className = 'sb-decledger-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-decledger-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ decisions';

    const headRight = document.createElement('span');
    headRight.className = 'sb-decledger-header-right';
    const counts = document.createElement('span');
    counts.className = 'cs-badge cs-badge--ink sb-decledger-counts';
    counts.textContent = countsLabel(states);
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-decledger-tag';
    sceneTag.textContent = c.sceneTag ?? 'DECISIONS';
    headRight.append(counts, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-decledger-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-decledger-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const scroll = document.createElement('div');
    scroll.className = 'sb-decledger-scroll';
    const list = document.createElement('ol');
    list.className = 'sb-decledger-list';

    type RowEntry = { el: HTMLElement; state: DecisionState };
    const rows: RowEntry[] = [];

    decisions.forEach((d, i) => {
      const state = states[i];
      const row = document.createElement('li');
      row.className = `sb-decledger-row sb-decledger-row--${state}`;
      row.dataset.index = String(i);

      const ref = document.createElement('span');
      ref.className = 'sb-decledger-ref';
      ref.textContent = String(d.ref ?? '').trim();

      const main = document.createElement('span');
      main.className = 'sb-decledger-main';
      const question = document.createElement('span');
      question.className = 'sb-decledger-question';
      question.textContent = String(d.question).trim();
      main.appendChild(question);

      // The open-row rule lives here: nothing below the question unless the
      // decision has an answer.
      if (state !== 'open') {
        const date = String(d.date ?? '').trim();
        const why = String(d.why ?? '').trim();
        if (date || why) {
          const detail = document.createElement('span');
          detail.className = 'sb-decledger-detail';
          if (date) {
            const dateEl = document.createElement('span');
            dateEl.className = 'sb-decledger-date';
            dateEl.textContent = date;
            detail.appendChild(dateEl);
          }
          if (why) {
            const whyEl = document.createElement('span');
            whyEl.className = 'sb-decledger-why';
            whyEl.textContent = why;
            detail.appendChild(whyEl);
          }
          main.appendChild(detail);
        }
      }

      const mark = document.createElement('span');
      mark.className = `sb-decledger-state sb-decledger-state--${state}`;
      mark.textContent = `${MARK[state]} ${state.toUpperCase()}`;

      row.append(ref, main, mark);
      list.appendChild(row);
      rows.push({ el: row, state });
    });

    scroll.appendChild(list);
    body.appendChild(scroll);
    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 250));
    const perRow = Math.max(40, Math.floor(stagger / Math.max(1, rows.length)));
    rows.forEach((r, i) => {
      timers.push(window.setTimeout(() => r.el.classList.add('sb-visible'), 420 + i * perRow));
    });

    let lit: HTMLElement[] = [];
    let litTimer: number | null = null;

    const clearLit = () => {
      for (const el of lit) el.classList.remove('sb-emphasize');
      lit = [];
      if (litTimer != null) {
        window.clearTimeout(litTimer);
        litTimer = null;
      }
    };

    const light = (els: HTMLElement[]) => {
      if (!els.length) return;
      clearLit();
      // sb-visible first, so a pulse that arrives before the reveal still
      // shows the row it is pointing at.
      for (const el of els) el.classList.add('sb-visible', 'sb-emphasize');
      lit = els;
      litTimer = window.setTimeout(clearLit, 1500);
    };

    return {
      dismiss: () => {
        clearLit();
        for (const t of timers) window.clearTimeout(t);
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const raw = String(target ?? '').trim();
        if (!raw) return;
        if (raw.startsWith('state:')) {
          const want = raw.slice(6).trim().toLowerCase();
          light(rows.filter((r) => r.state === want).map((r) => r.el));
          return;
        }
        const idx = Number(raw.startsWith('item:') ? raw.slice(5) : raw);
        if (Number.isInteger(idx) && rows[idx]) light([rows[idx].el]);
      },
    };
  },
};

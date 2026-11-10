import type { Template, TemplateHandle } from './registry';

/**
 * delivery-steps — beat 3 of a spec explainer: the PRs that built a doc's
 * paths, drawn as steps on the way to a thing rather than events on a line.
 *
 * The difference from era-timeline is the question it answers. A timeline
 * says WHEN. Delivery steps say WHAT EACH ONE ADDED. So the layout is a
 * staircase that climbs left to right and ends at the doc itself, and each
 * step's card leads with what the PR added. The date is small and last.
 *
 * Layout:
 *   1. Header strip — eyebrow + PR-count chip + scene tag.
 *   2. Title row    — optional kicker and headline (the producer's line).
 *   3. Staircase    — one card per PR, each standing on a tread one riser
 *                     higher than the last, then the target block: the doc
 *                     id, its title and its level. Order is the payload's
 *                     order, which the digest sets oldest first.
 *   4. Declared strip — `delivered-by` from the frontmatter, as written.
 *
 * Honesty constraints built into the layout:
 *   - The computed steps and the declared list are two separate things and
 *     render apart. Nothing matches one against the other — no ticks, no
 *     shared highlight, no "3 of 4 declared" — because they legitimately
 *     differ. A PR can touch a spec's paths without delivering it, and a
 *     declared PR can predate the corpus. An empty `declared` says "none
 *     declared" rather than vanishing, so absence reads as a fact.
 *   - The header chip states the TRUE total. When the staircase shows fewer
 *     PRs than the digest found — because the middle collapsed, or because
 *     the payload was capped upstream (`stepsFound`) — the chip turns warn
 *     and says "N of M".
 *   - Long lists collapse from the MIDDLE, keeping the first and the most
 *     recent PR, and the collapsed count stands on the staircase as its own
 *     step. Same rule as file-trajectory: the two ends are how it started
 *     and where it stands.
 *   - Dates are labelled "analyzed", never "merged". analyzedAt is a proxy
 *     for merge time and the card says which.
 *   - A step with no analysis says "no analysis recorded" instead of
 *     inventing what it added.
 *
 * Fill mode: full-bleed.
 * Width token: max 1280px via var(--sb-stage-w-max), 16:9 plate.
 * Calm: one-shot reveal, climbing the stairs. No continuous motion.
 * Measures nothing: card text is clamped by CSS, so §9d does not apply.
 *
 * emphasize(target):
 *   "<index>"   → pulse the step at that 0-based index into `steps`
 *   "pr:<n>"    → pulse the step for PR n
 *   "target"    → pulse the doc block at the top of the stairs
 *   "declared"  → pulse the declared strip
 */

interface DeliveryStep {
  prNumber: number | string;
  /** PR title. Null when the run row has none, which is normal. */
  title?: string | null;
  /** ISO. A proxy for merge time; rendered as "analyzed". */
  analyzedAt?: string | null;
  motivation?: string | null;
  /** Objective statements, in the analyst's order. */
  objectives?: string[];
  /** The doc's paths this PR touched. Not rendered; carried for parity. */
  paths?: string[];
}

interface DeliveryStepsContent {
  /** Doc id of the thing being built, e.g. "pipeline-spec". */
  docId: string;
  /** The doc's title. */
  title?: string | null;
  /** "L1" | "L2" | "L3". */
  level?: string | null;
  steps: DeliveryStep[];
  /** PRs the digest found before any payload cap. Defaults to steps.length. */
  stepsFound?: number;
  /** `delivered-by` as written. Never matched against `steps`. */
  declared?: Array<number | string>;
  /** Cap on rendered steps; the middle collapses. Default 6, minimum 3. */
  maxSteps?: number;
  kicker?: string;
  headline?: string;
  staggerMs?: number;
  eyebrow?: string;
  sceneTag?: string;
}

function normalizePr(raw: string | number | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '#—';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function prKey(raw: string | number | undefined): string {
  return String(raw ?? '').trim().replace(/^#/, '');
}

function fmtShortDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input);
  // A bare "2026-08-21" parses as UTC midnight and renders a day early west
  // of Greenwich. Read it as a local date.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  if (isNaN(d.getTime())) return raw;
  // Month and day only, as file-trajectory does: a dense staircase has no
  // room for the year, and a delivery's PRs rarely span one.
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function normalizeLevel(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'L1' || s === 'L2' || s === 'L3' ? s : null;
}

export const deliveryStepsTemplate: Template = {
  id: 'delivery-steps',
  version: '1.0.0',
  use: 'code',
  emphasizeTargets: 'a step by 0-based index, "pr:<n>", "target" or "declared"',
  description:
    'The PRs that built a planning doc, drawn as a staircase climbing to ' +
    'the doc itself: each step a card saying what that PR added, with its ' +
    'number, title and analyzed date. The frontmatter delivered-by list ' +
    'renders apart in a strip below and is never matched to the steps. ' +
    'Long lists collapse from the middle and state how many are not shown.',
  slots: {
    docId: 'string — doc id the steps build toward (e.g. "pipeline-spec")',
    title: 'string | null — the doc title, shown in the target block',
    level: '"L1" | "L2" | "L3" — shown as a badge in the target block',
    steps:
      '{ prNumber, title, analyzedAt, motivation, objectives[] }[] — ' +
      'oldest first, copied from the digest delivery steps',
    stepsFound: 'number — PRs found before any cap; drives the "N of M" chip',
    declared:
      '(number | string)[] — delivered-by as written; rendered apart, never ' +
      'matched to steps',
    maxSteps: 'number — cap on rendered steps (default 6); the middle collapses',
    kicker: 'string — small uppercase label above the headline',
    headline: 'string — one line on what the steps add up to',
    staggerMs: 'number — total step reveal window (default 1200)',
  },
  demo: {
    label: 'Delivery Steps',
    content: {
      docId: 'pipeline-spec',
      title: 'Lenzon — The Pipeline (Current State)',
      level: 'L3',
      kicker: 'Delivery',
      headline: 'Three PRs built the pipeline this spec describes',
      steps: [
        {
          prNumber: 10,
          title: 'PR video render',
          analyzedAt: '2026-07-20T18:04:00.000Z',
          motivation: 'Turn a finished script into a video a reviewer can watch.',
          objectives: ['Add the render worker', 'Post the video link back to the PR'],
          paths: ['infra/workers/pipeline/src/stages-pr-explainer.ts'],
        },
        {
          prNumber: 39,
          title: 'Series producer lens',
          analyzedAt: '2026-08-21T16:40:00.000Z',
          motivation: 'Let the producer explain a stretch of PRs, not only one.',
          objectives: ['Add the series-explainer slug', 'Split the template enum per slug'],
          paths: [
            'apps/server/lib/agents/producer.client.ts',
            'apps/server/lib/agents/producer.tool-schema.ts',
          ],
        },
        {
          prNumber: 63,
          title: 'PR doc signal',
          analyzedAt: '2026-08-26T21:12:00.000Z',
          motivation: null,
          objectives: ['Name the docs a PR touched in its comment'],
          paths: ['infra/workers/pipeline/src/stages-pr-explainer.ts'],
        },
      ],
      stepsFound: 3,
      declared: [],
    },
    emphasizeAfter: { target: '1', delayMs: 3000 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as DeliveryStepsContent;

    const stagger = Math.max(300, c.staggerMs ?? 1200);
    const allSteps = (Array.isArray(c.steps) ? c.steps : []).filter(Boolean);
    const declared = (Array.isArray(c.declared) ? c.declared : []).filter(
      (d) => d != null && String(d).trim() !== '',
    );
    const found =
      typeof c.stepsFound === 'number' && Number.isFinite(c.stepsFound)
        ? Math.max(Math.trunc(c.stepsFound), allSteps.length)
        : allSteps.length;
    const level = normalizeLevel(c.level);

    // Collapse from the middle, keeping head and tail. The cap counts the
    // collapsed marker as a step, so the staircase never grows past it.
    const cap =
      typeof c.maxSteps === 'number' && Number.isFinite(c.maxSteps)
        ? Math.max(3, Math.trunc(c.maxSteps))
        : 6;

    type Node =
      | { kind: 'step'; step: DeliveryStep; index: number }
      | { kind: 'collapsed'; count: number };

    const nodes: Node[] = [];
    if (allSteps.length <= cap) {
      allSteps.forEach((s, i) => nodes.push({ kind: 'step', step: s, index: i }));
    } else {
      const visible = cap - 1;
      const headN = Math.ceil(visible / 2);
      const tailN = visible - headN;
      allSteps.slice(0, headN).forEach((s, i) =>
        nodes.push({ kind: 'step', step: s, index: i }),
      );
      nodes.push({ kind: 'collapsed', count: allSteps.length - headN - tailN });
      allSteps.slice(allSteps.length - tailN).forEach((s, i) =>
        nodes.push({ kind: 'step', step: s, index: allSteps.length - tailN + i }),
      );
    }
    const shownCount = nodes.filter((n) => n.kind === 'step').length;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-delsteps-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-delsteps-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-delsteps-plate';

    // 1. Header strip. The chip states the true total and turns warn when
    //    the stairs show fewer than that.
    const header = document.createElement('div');
    header.className = 'sb-delsteps-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-delsteps-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 03 / delivery-steps';
    const headRight = document.createElement('span');
    headRight.className = 'sb-delsteps-header-right';
    const countChip = document.createElement('span');
    const partial = shownCount < found;
    countChip.className = partial
      ? 'cs-badge cs-badge--warn sb-delsteps-count'
      : 'cs-badge cs-badge--ink sb-delsteps-count';
    countChip.textContent = partial
      ? `${shownCount} of ${found} PRs`
      : `${found} ${found === 1 ? 'PR' : 'PRs'}`;
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-delsteps-tag';
    sceneTag.textContent = c.sceneTag ?? 'DELIVERY';
    headRight.append(countChip, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-delsteps-body';

    // 2. Title row — optional.
    let titleRow: HTMLElement | null = null;
    if (c.kicker || c.headline) {
      titleRow = document.createElement('div');
      titleRow.className = 'sb-delsteps-titlerow';
      if (c.kicker) {
        const k = document.createElement('span');
        k.className = 'sb-delsteps-kicker';
        k.textContent = c.kicker;
        titleRow.appendChild(k);
      }
      if (c.headline) {
        const h = document.createElement('h2');
        h.className = 'sb-delsteps-headline';
        h.textContent = c.headline;
        titleRow.appendChild(h);
      }
      body.appendChild(titleRow);
    }

    // 3. Staircase. Each column is a card standing on a tread, with a riser
    //    under the tread whose height grows by one unit per column. The
    //    rise unit shrinks as the column count grows so the climb always
    //    fits the row — a custom property, not a measurement.
    const stairs = document.createElement('div');
    stairs.className = 'sb-delsteps-stairs';
    const columns = nodes.length + 1;
    stairs.style.setProperty('--sb-delsteps-cols', String(columns));

    type StepEntry = { el: HTMLElement; prKey: string; index: number };
    const stepEls: StepEntry[] = [];
    const revealables: HTMLElement[] = [];

    const mkColumn = (i: number, extraClass?: string): HTMLElement => {
      const col = document.createElement('div');
      col.className = 'sb-delsteps-col';
      if (extraClass) col.classList.add(extraClass);
      col.style.setProperty('--sb-delsteps-i', String(i));
      return col;
    };

    const mkTread = (): HTMLElement => {
      const tread = document.createElement('div');
      tread.className = 'sb-delsteps-tread';
      return tread;
    };

    nodes.forEach((node, i) => {
      if (node.kind === 'collapsed') {
        const col = mkColumn(i, 'sb-delsteps-col--collapsed');
        const card = document.createElement('div');
        card.className = 'sb-delsteps-card sb-delsteps-card--collapsed';
        const mark = document.createElement('span');
        mark.className = 'sb-delsteps-collapsed-mark';
        mark.textContent = '⋯';
        const text = document.createElement('span');
        text.className = 'sb-delsteps-collapsed-text';
        text.textContent = `${node.count} ${node.count === 1 ? 'PR' : 'PRs'} not shown`;
        card.append(mark, text);
        col.append(card, mkTread());
        stairs.appendChild(col);
        revealables.push(col);
        return;
      }

      const s = node.step;
      const col = mkColumn(i);
      const card = document.createElement('div');
      card.className = 'sb-delsteps-card';

      const ref = document.createElement('span');
      ref.className = 'sb-delsteps-ref';
      ref.textContent = normalizePr(s.prNumber);
      card.appendChild(ref);

      const title = String(s.title ?? '').trim();
      const titleEl = document.createElement('span');
      titleEl.className = title
        ? 'sb-delsteps-title'
        : 'sb-delsteps-title sb-delsteps-title--none';
      titleEl.textContent = title || 'untitled';
      card.appendChild(titleEl);

      // What it added. Objectives first, because they are the analyst's
      // list of what the PR set out to do; motivation is the fallback; and
      // no analysis is said out loud rather than filled.
      const added = document.createElement('ul');
      added.className = 'sb-delsteps-added';
      const objectives = (Array.isArray(s.objectives) ? s.objectives : [])
        .map((o) => String(o ?? '').trim())
        .filter(Boolean);
      const motivation = String(s.motivation ?? '').trim();
      if (objectives.length) {
        for (const o of objectives.slice(0, 2)) {
          const li = document.createElement('li');
          li.className = 'sb-delsteps-added-item';
          li.textContent = o;
          added.appendChild(li);
        }
        if (objectives.length > 2) {
          const more = document.createElement('li');
          more.className = 'sb-delsteps-added-more';
          more.textContent = `+${objectives.length - 2} more`;
          added.appendChild(more);
        }
      } else if (motivation) {
        const li = document.createElement('li');
        li.className = 'sb-delsteps-added-item sb-delsteps-added-item--motivation';
        li.textContent = motivation;
        added.appendChild(li);
      } else {
        const li = document.createElement('li');
        li.className = 'sb-delsteps-added-none';
        li.textContent = 'no analysis recorded';
        added.appendChild(li);
      }
      card.appendChild(added);

      // No date line for a PR with no analysis: "no analysis recorded"
      // above already says it, and a second line would say it twice.
      const at = fmtShortDate(s.analyzedAt);
      if (at) {
        const atEl = document.createElement('span');
        atEl.className = 'sb-delsteps-at';
        atEl.textContent = `analyzed ${at}`;
        card.appendChild(atEl);
      }

      col.append(card, mkTread());
      stairs.appendChild(col);
      revealables.push(col);
      stepEls.push({ el: card, prKey: prKey(s.prNumber), index: node.index });
    });

    // The target — the doc the steps build toward, on the top stair.
    const targetCol = mkColumn(nodes.length, 'sb-delsteps-col--target');
    const target = document.createElement('div');
    target.className = 'sb-delsteps-target';
    const targetHead = document.createElement('div');
    targetHead.className = 'sb-delsteps-target-head';
    const targetId = document.createElement('span');
    targetId.className = 'sb-delsteps-target-id';
    targetId.textContent = c.docId ?? '';
    targetHead.appendChild(targetId);
    if (level) {
      const badge = document.createElement('span');
      badge.className = 'sb-delsteps-target-badge';
      badge.textContent = level;
      targetHead.appendChild(badge);
    }
    target.appendChild(targetHead);
    const docTitle = String(c.title ?? '').trim();
    if (docTitle) {
      const t = document.createElement('span');
      t.className = 'sb-delsteps-target-title';
      t.textContent = docTitle;
      target.appendChild(t);
    }
    targetCol.append(target, mkTread());
    stairs.appendChild(targetCol);
    revealables.push(targetCol);

    body.appendChild(stairs);

    // 4. Declared strip — delivered-by as written, apart from the stairs.
    const declaredEl = document.createElement('div');
    declaredEl.className = 'sb-delsteps-declared';
    const declaredLabel = document.createElement('span');
    declaredLabel.className = 'sb-delsteps-declared-label';
    declaredLabel.textContent = 'Declared in delivered-by';
    declaredEl.appendChild(declaredLabel);
    const declaredList = document.createElement('span');
    declaredList.className = 'sb-delsteps-declared-list';
    if (declared.length) {
      for (const d of declared) {
        const chip = document.createElement('span');
        chip.className = 'sb-delsteps-declared-chip';
        chip.textContent = typeof d === 'number' ? normalizePr(d) : String(d);
        declaredList.appendChild(chip);
      }
    } else {
      const none = document.createElement('span');
      none.className = 'sb-delsteps-declared-none';
      none.textContent = 'none declared';
      declaredList.appendChild(none);
    }
    declaredEl.appendChild(declaredList);
    const declaredNote = document.createElement('span');
    declaredNote.className = 'sb-delsteps-declared-note';
    declaredNote.textContent = 'As the doc lists them. Not matched to the steps above.';
    declaredEl.appendChild(declaredNote);
    body.appendChild(declaredEl);

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal — header, title, then up the stairs, then the declared strip.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 150));
    if (titleRow) {
      const tr = titleRow;
      timers.push(window.setTimeout(() => tr.classList.add('sb-visible'), 280));
    }
    const perStep = Math.max(80, Math.floor(stagger / Math.max(1, revealables.length)));
    revealables.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 420 + i * perStep),
      );
    });
    timers.push(
      window.setTimeout(
        () => declaredEl.classList.add('sb-visible'),
        420 + revealables.length * perStep + 160,
      ),
    );

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
      for (const el of present) el.classList.add('sb-emphasize');
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
      emphasize: (targetName: string) => {
        const raw = String(targetName ?? '').trim();
        if (!raw) return;
        if (raw === 'target') {
          light([target]);
          return;
        }
        if (raw === 'declared') {
          light([declaredEl]);
          return;
        }
        if (raw.startsWith('pr:')) {
          const key = prKey(raw.slice(3));
          light(stepEls.filter((s) => s.prKey === key).map((s) => s.el));
          return;
        }
        // A bare number is an index into `steps`, never a PR number — a
        // step collapsed out of view has no card, and lighting nothing is
        // the honest answer.
        const idx = Number(raw);
        if (Number.isInteger(idx)) {
          light([stepEls.find((s) => s.index === idx)?.el]);
        }
      },
    };
  },
};

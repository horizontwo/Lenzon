import type { Template, TemplateHandle } from './registry';

/**
 * plan-title-card — the opening slide of a spec-explainer run: one planning
 * doc rather than one PR or a stretch of PRs. Bookends outro-card.
 *
 * Fourth member of the opener family, and visually distinct from the other
 * three so a thumbnail is instantly classifiable:
 *
 *   - title-card        anchors on an italic-serif org/repo display headline.
 *   - pr-title-card     anchors on ONE giant mono PR number.
 *   - series-title-card anchors on a mono PR RANGE ("#10 → #33").
 *   - plan-title-card   anchors on a large LEVEL BADGE ("L3") beside the
 *     doc id. The badge says which kind of document this is before the
 *     viewer reads a word of the title.
 *
 * It is general across levels on purpose. One template, three badge values.
 * The roadmap explainer gets its opener for free.
 *
 * Visual hierarchy (top to bottom):
 *   1. Header strip — eyebrow (§ 00 / plan-title-card) + scene tag.
 *   2. Org/repo breadcrumb — small, dim, sets context.
 *   3. Headline row — italic serif doc title (left) + doc id and level
 *      badge (right).
 *   4. Subtitle — one line of prose under the headline.
 *   5. Grounding rail — the grounding sha, its date, the days since, and
 *      the lane, as a pill. Twin of series-title-card's span rail.
 *   6. Stat strip — status / PRs delivered / files under impacts.
 *   7. Drift note — optional, warn-toned. Twin of the series opener's gap
 *      note.
 *   8. Footer — repo / doc path / grounded / generated, brand under that.
 *
 * Honesty constraints this template enforces structurally:
 *   - A null `groundedAt` renders as "not grounded" on the rail, and the
 *     drift note appears saying the doc is unverified even when the
 *     producer sent no `driftNote`. A spec nobody has checked against the
 *     code must not open looking like one somebody has.
 *   - A `stale` lane does the same: the warn note appears with a default
 *     line when the producer sent none. If the doc is stale, the opener
 *     says so before anything else is narrated.
 *   - The lane is rendered as given, never inferred. A doc that is not in
 *     the stale lane is not therefore fine — it may be `unevaluated` — and
 *     the rail prints which.
 *   - Days since grounding render only when supplied. The template does not
 *     derive them, because the digest computes them and a second
 *     computation here could disagree with it.
 *
 * Fill mode: full-bleed (owns the whole stage rectangle).
 * Width token: max 1280px via var(--sb-stage-w-max); 16:9 plate like the
 * other three openers, so all four render at identical aspect.
 * Calm: one-shot staggered reveal, no continuous motion.
 *
 * emphasize(target):
 *   "headline"  → pulse the doc title
 *   "badge"     → pulse the level badge and doc id
 *   "grounding" → pulse the grounding rail
 *   "stats"     → pulse the stat strip
 *   "drift"     → pulse the drift note (no-op when absent)
 */

type PlanLevel = 'L1' | 'L2' | 'L3';
type PlanLane = 'fresh' | 'stale' | 'attestationDrift' | 'unevaluated';

interface PlanTitleCardContent {
  repo: string;
  org?: string;
  /** Doc id from the frontmatter, e.g. "pipeline-spec". */
  docId: string;
  /** "L1" | "L2" | "L3". Anything else renders as "L?". */
  level: string;
  /** Repo-relative path, e.g. "docs/PIPELINE.md". Footer only. */
  docPath?: string;
  /** The doc's own title, italic display type. */
  headline: string;
  subtitle?: string;
  kicker?: string;
  /** `status` from the frontmatter, e.g. "active". */
  status?: string;
  /** Short sha the doc was last verified at. Null means never grounded. */
  groundedAt?: string | null;
  /** Date of the grounding commit, ISO or display string. */
  groundedOn?: string;
  /** Computed by the digest. Rendered only when present. */
  daysSinceGrounding?: number;
  /** The doc graph lane, as reported. */
  lane?: PlanLane;
  /** PRs that delivered this doc, as counted by the digest. */
  prsDelivered?: number;
  /** Files covered by the doc's `impacts`, as resolved. */
  impactFileCount?: number;
  /** "3 merges touched impacts since grounding" — stated, never smoothed. */
  driftNote?: string;
  brand?: string;
  generatedAt?: string;
  // Optional chrome overrides (mirror series-title-card).
  eyebrow?: string;
  sceneTag?: string;
}

const LEVEL_NAMES: Record<PlanLevel, string> = {
  L1: 'Roadmap',
  L2: 'Plan',
  L3: 'Specification',
};

const LANE_LABELS: Record<PlanLane, string> = {
  fresh: 'fresh',
  stale: 'stale',
  attestationDrift: 'attestation drift',
  unevaluated: 'unevaluated',
};

function normalizeLevel(raw: unknown): PlanLevel | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'L1' || s === 'L2' || s === 'L3' ? s : null;
}

function normalizeLane(raw: unknown): PlanLane | null {
  return typeof raw === 'string' && raw in LANE_LABELS ? (raw as PlanLane) : null;
}

function fmtDate(input?: string | number): string | null {
  if (input == null || input === '') return null;
  const raw = String(input);
  // A bare "2026-09-14" parses as UTC midnight, which renders as the day
  // before anywhere west of Greenwich. Read it as a local date instead,
  // because a grounding date one day off is a wrong fact on the opener.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function finiteInt(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
}

export const planTitleCardTemplate: Template = {
  id: 'plan-title-card',
  version: '1.0.0',
  description:
    'Opening slide of a spec-explainer run — one planning doc rather than ' +
    'a PR. Glass plate anchored by an italic doc title and a large L1/L2/L3 ' +
    'level badge beside the doc id, with org/repo breadcrumb, a grounding ' +
    'pill (sha, date, days since, lane), a status/PRs/files stat strip, a ' +
    'warn-toned drift note that appears on its own for stale or ungrounded ' +
    'docs, and a repo/path footer.',
  slots: {
    repo: 'string — repo name (e.g. "Lenzon-Platform")',
    org: 'string — owner / organization (e.g. "horizontwo")',
    docId: 'string — doc id from frontmatter (e.g. "pipeline-spec")',
    level: '"L1" | "L2" | "L3" — the planning level, rendered as the badge',
    docPath: 'string — repo-relative path (e.g. "docs/PIPELINE.md")',
    headline: 'string — the doc title, italic display type',
    subtitle: 'string — one supporting line of prose',
    kicker: 'string — small uppercase label above the headline',
    status: 'string — frontmatter status (e.g. "active")',
    groundedAt: 'string | null — short sha last verified at; null = never grounded',
    groundedOn: 'string — date of the grounding commit',
    daysSinceGrounding: 'number — from the digest; omitted means not shown',
    lane: '"fresh" | "stale" | "attestationDrift" | "unevaluated" — as reported',
    prsDelivered: 'number — PRs that delivered this doc, from the digest',
    impactFileCount: 'number — files under impacts, from the digest',
    driftNote: 'string — what moved since grounding, stated plainly',
    generatedAt: 'string — ISO date or pre-formatted display string',
    brand: 'string — bottom-centre wordmark (default "Lenzon")',
  },
  demo: {
    label: 'Plan Title Card',
    content: {
      repo: 'Lenzon-Platform',
      org: 'horizontwo',
      docId: 'pipeline-spec',
      level: 'L3',
      docPath: 'docs/PIPELINE.md',
      headline: 'The PR explainer pipeline',
      subtitle:
        'How a pull request becomes a script: clone, analyze, produce, render.',
      kicker: 'Spec explainer',
      status: 'active',
      groundedAt: '05b5f3d',
      groundedOn: '2026-09-14',
      daysSinceGrounding: 42,
      lane: 'stale',
      prsDelivered: 18,
      impactFileCount: 37,
      driftNote: '3 merges have touched this spec’s files since it was grounded.',
      generatedAt: '2026-10-26',
      brand: 'Lenzon',
    },
    emphasizeAfter: { target: 'badge', delayMs: 2600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as PlanTitleCardContent;

    const level = normalizeLevel(c.level);
    const lane = normalizeLane(c.lane);
    const grounded =
      typeof c.groundedAt === 'string' && c.groundedAt.trim() !== ''
        ? c.groundedAt.trim()
        : null;
    const days = finiteInt(c.daysSinceGrounding);
    const prsDelivered = finiteInt(c.prsDelivered);
    const fileCount = finiteInt(c.impactFileCount);

    // The note the opener must show even if the producer forgot one. An
    // ungrounded doc outranks a stale one: with no grounding there is no
    // drift to measure, only an unchecked claim.
    const driftText =
      c.driftNote ??
      (!grounded
        ? 'This doc has never been grounded against the code. Treat it as unverified.'
        : lane === 'stale'
          ? 'The code has moved since this doc was last grounded.'
          : null);
    const driftLabel = grounded ? 'Drift' : 'Unverified';

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-plantitle-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-plantitle-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-plantitle-plate';

    // 1. Header strip.
    const header = document.createElement('div');
    header.className = 'sb-plantitle-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-plantitle-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 00 / plan-title-card';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-plantitle-tag';
    sceneTag.textContent = c.sceneTag ?? `${level ?? 'PLAN'}-00`;
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-plantitle-body';

    // 2. Breadcrumb — org / repo, with an optional kicker riding alongside.
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'sb-plantitle-breadcrumb';
    if (c.org) {
      const orgEl = document.createElement('span');
      orgEl.className = 'sb-plantitle-breadcrumb-org';
      orgEl.textContent = c.org;
      const slash = document.createElement('span');
      slash.className = 'sb-plantitle-breadcrumb-slash';
      slash.textContent = '/';
      breadcrumb.append(orgEl, slash);
    }
    const repoEl = document.createElement('span');
    repoEl.className = 'sb-plantitle-breadcrumb-repo';
    repoEl.textContent = c.repo ?? '';
    breadcrumb.appendChild(repoEl);
    if (c.kicker) {
      const kickerEl = document.createElement('span');
      kickerEl.className = 'sb-plantitle-kicker';
      kickerEl.textContent = c.kicker;
      breadcrumb.appendChild(kickerEl);
    }
    body.appendChild(breadcrumb);

    // 3. Headline row — italic doc title (1fr) + id and badge (auto).
    const headline = document.createElement('div');
    headline.className = 'sb-plantitle-headline';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-plantitle-title';
    titleEl.textContent = c.headline ?? '';
    headline.appendChild(titleEl);

    // The anchor. The id stack sits left of the badge so the badge is the
    // outermost, largest thing on the row — the classifier a thumbnail
    // reads first. The level name under the id spells out what "L3" means
    // for a viewer who has never seen the doctrine.
    const anchorEl = document.createElement('div');
    anchorEl.className = 'sb-plantitle-anchor';
    const idStack = document.createElement('div');
    idStack.className = 'sb-plantitle-id';
    const idEl = document.createElement('span');
    idEl.className = 'sb-plantitle-id-value';
    idEl.textContent = c.docId ?? '';
    const levelNameEl = document.createElement('span');
    levelNameEl.className = 'sb-plantitle-id-level';
    levelNameEl.textContent = level ? LEVEL_NAMES[level] : 'Planning doc';
    idStack.append(idEl, levelNameEl);
    const badgeEl = document.createElement('span');
    badgeEl.className = 'sb-plantitle-badge';
    badgeEl.textContent = level ?? 'L?';
    anchorEl.append(idStack, badgeEl);
    headline.appendChild(anchorEl);

    body.appendChild(headline);

    // 4. Subtitle.
    let subtitleEl: HTMLElement | null = null;
    if (c.subtitle) {
      subtitleEl = document.createElement('p');
      subtitleEl.className = 'sb-plantitle-subtitle';
      subtitleEl.textContent = c.subtitle;
      body.appendChild(subtitleEl);
    }

    // 5. Grounding rail — sha, date, days since, lane. Twin of the series
    //    opener's span rail. Each part is its own span so a missing part
    //    drops out cleanly rather than leaving a dangling separator.
    const groundingRail = document.createElement('div');
    groundingRail.className = 'sb-plantitle-grounding';
    const railParts: HTMLElement[] = [];
    const railLabel = document.createElement('span');
    railLabel.className = 'sb-plantitle-grounding-label';
    railLabel.textContent = grounded ? 'grounded' : 'not grounded';
    railParts.push(railLabel);
    if (grounded) {
      const shaEl = document.createElement('span');
      shaEl.className = 'sb-plantitle-grounding-sha';
      shaEl.textContent = grounded;
      railParts.push(shaEl);
      const on = fmtDate(c.groundedOn);
      if (on) {
        const onEl = document.createElement('span');
        onEl.className = 'sb-plantitle-grounding-date';
        onEl.textContent = on;
        railParts.push(onEl);
      }
      if (days != null) {
        const daysEl = document.createElement('span');
        daysEl.className = 'sb-plantitle-grounding-days';
        daysEl.textContent = `${plural(days, 'day', 'days')} ago`;
        railParts.push(daysEl);
      }
    }
    if (lane) {
      const laneEl = document.createElement('span');
      laneEl.className = `sb-plantitle-lane sb-plantitle-lane--${lane}`;
      laneEl.textContent = LANE_LABELS[lane];
      railParts.push(laneEl);
    }
    railParts.forEach((part, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sb-plantitle-grounding-sep';
        sep.textContent = '·';
        groundingRail.appendChild(sep);
      }
      groundingRail.appendChild(part);
    });
    if (!grounded) groundingRail.classList.add('sb-plantitle-grounding--none');
    body.appendChild(groundingRail);

    // 6. Stat strip — status / PRs delivered / files. A count the digest
    //    did not supply is dropped, not shown as zero.
    const stats = document.createElement('div');
    stats.className = 'sb-plantitle-stats';
    if (c.status) {
      const statusStat = document.createElement('span');
      statusStat.className = 'sb-plantitle-stat sb-plantitle-stat--status';
      statusStat.textContent = c.status;
      stats.appendChild(statusStat);
    }
    if (prsDelivered != null) {
      const prStat = document.createElement('span');
      prStat.className = 'sb-plantitle-stat sb-plantitle-stat--prs';
      prStat.textContent = `${plural(prsDelivered, 'PR', 'PRs')} delivered`;
      stats.appendChild(prStat);
    }
    if (fileCount != null) {
      const fileStat = document.createElement('span');
      fileStat.className = 'sb-plantitle-stat sb-plantitle-stat--files';
      fileStat.textContent = `${plural(fileCount, 'file', 'files')} in scope`;
      stats.appendChild(fileStat);
    }
    body.appendChild(stats);

    // 7. Drift note — bordered and warn-toned so it cannot read as prose.
    let driftEl: HTMLElement | null = null;
    if (driftText) {
      driftEl = document.createElement('div');
      driftEl.className = 'sb-plantitle-drift';
      const driftLabelEl = document.createElement('span');
      driftLabelEl.className = 'sb-plantitle-drift-label';
      driftLabelEl.textContent = driftLabel;
      const driftTextEl = document.createElement('span');
      driftTextEl.className = 'sb-plantitle-drift-text';
      driftTextEl.textContent = driftText;
      driftEl.append(driftLabelEl, driftTextEl);
      body.appendChild(driftEl);
    }

    plate.appendChild(body);

    // 8. Footer — repo / path / grounded / generated.
    const meta = document.createElement('div');
    meta.className = 'sb-plantitle-meta';

    const mkBlock = (
      label: string,
      value: string,
      mod?: 'right',
    ): HTMLElement => {
      const block = document.createElement('div');
      block.className = 'sb-plantitle-meta-block';
      if (mod === 'right') block.classList.add('sb-plantitle-meta-block--right');
      const l = document.createElement('span');
      l.className = 'sb-plantitle-meta-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'sb-plantitle-meta-value';
      v.textContent = value;
      block.append(l, v);
      return block;
    };

    const repoLabel = c.org ? `${c.org}/${c.repo ?? ''}` : (c.repo ?? '—');
    meta.appendChild(mkBlock('Repo', repoLabel));
    meta.appendChild(mkBlock('Doc', c.docPath ?? c.docId ?? '—'));
    meta.appendChild(mkBlock('Grounded at', grounded ?? 'never'));
    meta.appendChild(
      mkBlock('Generated', fmtDate(c.generatedAt) ?? '—', 'right'),
    );

    plate.appendChild(meta);

    // Brand mark — mirrors the other openers so the bookend with outro-card
    // reads as one family.
    const brand = document.createElement('div');
    brand.className = 'sb-plantitle-brand';
    const brandDot = document.createElement('span');
    brandDot.className = 'sb-plantitle-brand-dot';
    const brandText = document.createElement('span');
    brandText.textContent = c.brand ?? 'Lenzon';
    brand.append(brandDot, brandText);
    plate.appendChild(brand);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade — one-shot, top to bottom.
    const sections: HTMLElement[] = [header, breadcrumb, headline];
    if (subtitleEl) sections.push(subtitleEl);
    sections.push(groundingRail, stats);
    if (driftEl) sections.push(driftEl);
    sections.push(meta, brand);

    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 200 + i * 150),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      headline: titleEl,
      badge: anchorEl,
      grounding: groundingRail,
      stats,
      drift: driftEl ?? undefined,
    };

    let activeEl: HTMLElement | null = null;
    let activeTimer: number | null = null;
    const clearActive = () => {
      if (!activeEl) return;
      activeEl.classList.remove('sb-emphasize');
      if (activeTimer != null) window.clearTimeout(activeTimer);
      activeEl = null;
      activeTimer = null;
    };

    return {
      dismiss: () => {
        clearActive();
        for (const t of timers) window.clearTimeout(t);
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const el = emphasizeMap[target];
        if (!el) return;
        clearActive();
        el.classList.add('sb-emphasize');
        activeEl = el;
        activeTimer = window.setTimeout(() => {
          el.classList.remove('sb-emphasize');
          activeEl = null;
          activeTimer = null;
        }, 1400);
      },
    };
  },
};

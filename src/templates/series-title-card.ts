import type { Template, TemplateHandle } from './registry';

/**
 * series-title-card — the opening slide of a series-explainer run: a
 * stretch of work rather than one PR. Bookends outro-card.
 *
 * Visually distinct from its two siblings so a thumbnail is instantly
 * classifiable:
 *
 *   - title-card       anchors on an italic-serif org/repo display headline.
 *   - pr-title-card    anchors on ONE giant mono PR number.
 *   - series-title-card anchors on a mono PR RANGE — "#10 → #33" — where
 *     the two numbers are the dominant identifier and the arrow between
 *     them carries the "span of work" idea that a single number cannot.
 *
 * Visual hierarchy (top to bottom):
 *   1. Header strip — eyebrow (§ 00 / series-title-card) + scene tag.
 *   2. Org/repo breadcrumb — small, dim, sets context.
 *   3. Headline row — italic serif headline (left) + mono PR range (right).
 *   4. Subtitle — one line of prose under the headline.
 *   5. Span rail — the date range, mono, as a pill (twin of pr-title-card's
 *      branch rail so the two openers rhyme structurally).
 *   6. Stat strip — PR count / day count / analyzed count.
 *   7. Gap note — optional, warn-toned. The corpus has holes (an errored
 *      scan leaves a PR unanalyzed) and §6.3 of the concept doc requires
 *      stating the gap out loud rather than silently skipping it. This is
 *      the only opener that carries a "what we could not see" line, and it
 *      renders as a bordered callout so it cannot be mistaken for prose.
 *   8. Footer — repo / window / analyzed / generated, brand under that.
 *
 * Honesty constraints this template enforces structurally:
 *   - `prCount` and `analyzedCount` are rendered as two SEPARATE stats,
 *     never reconciled into one number, because they legitimately differ
 *     when a scan errored. A template that showed only one would launder
 *     a gap into a claim.
 *   - The date range is labelled "analyzed" in the footer, not "merged".
 *     No merge timestamp exists in the corpus (concept doc §6.4) and
 *     `analyzedAt` is a documented proxy — so the chrome says which.
 *
 * Fill mode: full-bleed (owns the whole stage rectangle).
 * Width token: max 1280px via var(--sb-stage-w-max); plate is 16:9 like
 * title-card / pr-title-card, so all three openers render at identical
 * aspect.
 * Calm: one-shot staggered reveal, no continuous motion.
 *
 * emphasize(target):
 *   "headline" → pulse the headline
 *   "range"    → pulse the PR-range block
 *   "span"     → pulse the date-range pill
 *   "stats"    → pulse the stat strip
 *   "gap"      → pulse the gap note (no-op when absent)
 */

interface SeriesRange {
  from: string | number;
  to: string | number;
}

interface SeriesTitleCardContent {
  repo: string;
  org?: string;
  /** { from: 10, to: 33 } — rendered "#10 → #33". */
  prRange: SeriesRange;
  /** { from: "2026-07-20", to: "2026-08-14" } — ISO or display strings. */
  dateRange: SeriesRange;
  /** PRs in the window. */
  prCount: number;
  /** PRs with a usable analysis. May be < prCount — that is the point. */
  analyzedCount?: number;
  /** Days spanned. Omit to derive from dateRange. */
  dayCount?: number;
  headline: string;
  subtitle?: string;
  kicker?: string;
  /** "PR #14 not analyzed" — stated, never smoothed over. */
  gapNote?: string;
  brand?: string;
  generatedAt?: string;
  // Optional chrome overrides (mirror pr-title-card).
  eyebrow?: string;
  sceneTag?: string;
}

function fmtDate(input?: string | number): string | null {
  if (input == null || input === '') return null;
  const raw = String(input);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "#10" from 10 or "10" or "#10". Empty input reads as an em-dash. */
function normalizePr(raw: string | number | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '#—';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

/**
 * Inclusive day span between two dates. Returns null on unparseable
 * input so the caller can drop the stat rather than render a wrong one —
 * the "no invented numbers" rule applies to derived values too.
 */
function daysBetween(from?: string | number, to?: string | number): number | null {
  if (from == null || to == null) return null;
  const a = new Date(String(from));
  const b = new Date(String(to));
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.max(1, Math.round(ms / 86_400_000));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const seriesTitleCardTemplate: Template = {
  id: 'series-title-card',
  version: '1.0.0',
  description:
    'Opening slide of a series-explainer run — a stretch of work rather ' +
    'than one PR. Glass plate anchored by an italic headline and a mono ' +
    'PR range ("#10 → #33"), with org/repo breadcrumb, date-span pill, ' +
    'PR/day/analyzed stat strip, an optional warn-toned gap note for PRs ' +
    'the corpus could not see, and a repo/window footer.',
  slots: {
    repo: 'string — repo name (e.g. "Lenzon-Platform")',
    org: 'string — owner / organization (e.g. "horizontwo")',
    prRange: '{ from, to } — first and last PR in the window',
    dateRange: '{ from, to } — ISO dates or pre-formatted display strings',
    prCount: 'number — PRs in the window',
    analyzedCount: 'number — PRs with a usable analysis (may be < prCount)',
    dayCount: 'number — days spanned; derived from dateRange when omitted',
    headline: 'string — the arc in one line, italic display type',
    subtitle: 'string — one supporting line of prose',
    kicker: 'string — small uppercase label above the headline',
    gapNote: 'string — PRs in range with no analysis, stated plainly',
    generatedAt: 'string — ISO date or pre-formatted display string',
    brand: 'string — bottom-centre wordmark (default "Lenzon")',
  },
  demo: {
    label: 'Series Title Card',
    content: {
      repo: 'Lenzon-Platform',
      org: 'horizontwo',
      prRange: { from: 10, to: 33 },
      dateRange: { from: '2026-07-20', to: '2026-08-14' },
      prCount: 24,
      analyzedCount: 23,
      headline: 'Four weeks that built the Sidecar',
      subtitle:
        'Viewer polish gave way to a corpus query surface, then to the UI that surfaces it.',
      kicker: 'Series explainer',
      gapNote: 'PR #14 errored during analysis — not represented below.',
      generatedAt: '2026-08-20',
      brand: 'Lenzon',
    },
    emphasizeAfter: { target: 'range', delayMs: 2400 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as SeriesTitleCardContent;

    const prRange = c.prRange ?? ({} as SeriesRange);
    const dateRange = c.dateRange ?? ({} as SeriesRange);
    const prCount = Number.isFinite(c.prCount) ? Math.trunc(c.prCount) : 0;
    const analyzed = Number.isFinite(c.analyzedCount as number)
      ? Math.trunc(c.analyzedCount as number)
      : null;
    const days = Number.isFinite(c.dayCount as number)
      ? Math.trunc(c.dayCount as number)
      : daysBetween(dateRange.from, dateRange.to);

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-sertitle-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-sertitle-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-sertitle-plate';

    // 1. Header strip.
    const header = document.createElement('div');
    header.className = 'sb-sertitle-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-sertitle-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 00 / series-title-card';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-sertitle-tag';
    sceneTag.textContent = c.sceneTag ?? 'SERIES-00';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-sertitle-body';

    // 2. Breadcrumb — org / repo, with an optional kicker riding alongside.
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'sb-sertitle-breadcrumb';
    if (c.org) {
      const orgEl = document.createElement('span');
      orgEl.className = 'sb-sertitle-breadcrumb-org';
      orgEl.textContent = c.org;
      const slash = document.createElement('span');
      slash.className = 'sb-sertitle-breadcrumb-slash';
      slash.textContent = '/';
      breadcrumb.append(orgEl, slash);
    }
    const repoEl = document.createElement('span');
    repoEl.className = 'sb-sertitle-breadcrumb-repo';
    repoEl.textContent = c.repo ?? '';
    breadcrumb.appendChild(repoEl);
    if (c.kicker) {
      const kickerEl = document.createElement('span');
      kickerEl.className = 'sb-sertitle-kicker';
      kickerEl.textContent = c.kicker;
      breadcrumb.appendChild(kickerEl);
    }
    body.appendChild(breadcrumb);

    // 3. Headline row — italic headline (1fr) + mono PR range (auto).
    const headline = document.createElement('div');
    headline.className = 'sb-sertitle-headline';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-sertitle-title';
    titleEl.textContent = c.headline ?? '';
    headline.appendChild(titleEl);

    // The range block is the anchor. Three spans rather than one string so
    // the arrow can be typeset in the UI face (the mono arrow glyph is
    // thin and sits badly against tabular figures) and so emphasize can
    // ring the pair as a unit.
    const rangeEl = document.createElement('div');
    rangeEl.className = 'sb-sertitle-range';
    const fromEl = document.createElement('span');
    fromEl.className = 'sb-sertitle-range-n';
    fromEl.textContent = normalizePr(prRange.from);
    const arrowEl = document.createElement('span');
    arrowEl.className = 'sb-sertitle-range-arrow';
    arrowEl.textContent = '→';
    const toEl = document.createElement('span');
    toEl.className = 'sb-sertitle-range-n sb-sertitle-range-n--to';
    toEl.textContent = normalizePr(prRange.to);
    rangeEl.append(fromEl, arrowEl, toEl);
    headline.appendChild(rangeEl);

    body.appendChild(headline);

    // 4. Subtitle.
    let subtitleEl: HTMLElement | null = null;
    if (c.subtitle) {
      subtitleEl = document.createElement('p');
      subtitleEl.className = 'sb-sertitle-subtitle';
      subtitleEl.textContent = c.subtitle;
      body.appendChild(subtitleEl);
    }

    // 5. Span rail — the date window as a pill. Twin of pr-title-card's
    //    branch rail so the two openers rhyme structurally.
    const spanRail = document.createElement('div');
    spanRail.className = 'sb-sertitle-span';
    const spanFrom = document.createElement('span');
    spanFrom.className = 'sb-sertitle-span-date';
    spanFrom.textContent = fmtDate(dateRange.from) ?? '—';
    const spanArrow = document.createElement('span');
    spanArrow.className = 'sb-sertitle-span-arrow';
    spanArrow.textContent = '→';
    const spanTo = document.createElement('span');
    spanTo.className = 'sb-sertitle-span-date sb-sertitle-span-date--to';
    spanTo.textContent = fmtDate(dateRange.to) ?? '—';
    spanRail.append(spanFrom, spanArrow, spanTo);
    body.appendChild(spanRail);

    // 6. Stat strip — PRs / days / analyzed. `analyzed` stays a separate
    //    stat from `prCount`; see the header note on honesty constraints.
    const stats = document.createElement('div');
    stats.className = 'sb-sertitle-stats';
    const prStat = document.createElement('span');
    prStat.className = 'sb-sertitle-stat sb-sertitle-stat--prs';
    prStat.textContent = plural(prCount, 'PR', 'PRs');
    stats.appendChild(prStat);
    if (days != null) {
      const dayStat = document.createElement('span');
      dayStat.className = 'sb-sertitle-stat sb-sertitle-stat--days';
      dayStat.textContent = plural(days, 'day', 'days');
      stats.appendChild(dayStat);
    }
    if (analyzed != null) {
      const anStat = document.createElement('span');
      anStat.className = 'sb-sertitle-stat sb-sertitle-stat--analyzed';
      anStat.textContent = `${analyzed} analyzed`;
      stats.appendChild(anStat);
    }
    body.appendChild(stats);

    // 7. Gap note — bordered and warn-toned so it cannot read as prose.
    let gapEl: HTMLElement | null = null;
    if (c.gapNote) {
      gapEl = document.createElement('div');
      gapEl.className = 'sb-sertitle-gap';
      const gapLabel = document.createElement('span');
      gapLabel.className = 'sb-sertitle-gap-label';
      gapLabel.textContent = 'Gap';
      const gapText = document.createElement('span');
      gapText.className = 'sb-sertitle-gap-text';
      gapText.textContent = c.gapNote;
      gapEl.append(gapLabel, gapText);
      body.appendChild(gapEl);
    }

    plate.appendChild(body);

    // 8. Footer — repo / window / coverage / generated.
    const meta = document.createElement('div');
    meta.className = 'sb-sertitle-meta';

    const mkBlock = (
      label: string,
      value: string,
      mod?: 'right',
    ): HTMLElement => {
      const block = document.createElement('div');
      block.className = 'sb-sertitle-meta-block';
      if (mod === 'right') block.classList.add('sb-sertitle-meta-block--right');
      const l = document.createElement('span');
      l.className = 'sb-sertitle-meta-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'sb-sertitle-meta-value';
      v.textContent = value;
      block.append(l, v);
      return block;
    };

    const repoLabel = c.org ? `${c.org}/${c.repo ?? ''}` : (c.repo ?? '—');
    const windowLabel = `${normalizePr(prRange.from)}–${normalizePr(prRange.to)}`;
    // "Analyzed", not "merged" — analyzedAt is a proxy for merge time and
    // the chrome must not present it as one (concept doc §6.4, §7).
    const coverage =
      analyzed != null ? `${analyzed} of ${prCount}` : String(prCount);

    meta.appendChild(mkBlock('Repo', repoLabel));
    meta.appendChild(mkBlock('PR window', windowLabel));
    meta.appendChild(mkBlock('Analyzed', coverage));
    meta.appendChild(
      mkBlock('Generated', fmtDate(c.generatedAt) ?? '—', 'right'),
    );

    plate.appendChild(meta);

    // Brand mark — mirrors pr-title-card so the bookend with outro-card
    // reads as one family.
    const brand = document.createElement('div');
    brand.className = 'sb-sertitle-brand';
    const brandDot = document.createElement('span');
    brandDot.className = 'sb-sertitle-brand-dot';
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
    sections.push(spanRail, stats);
    if (gapEl) sections.push(gapEl);
    sections.push(meta, brand);

    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 200 + i * 150),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      headline: titleEl,
      range: rangeEl,
      span: spanRail,
      stats,
      gap: gapEl ?? undefined,
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

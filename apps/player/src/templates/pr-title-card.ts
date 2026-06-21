import type { Template, TemplateHandle } from './registry';

/**
 * pr-title-card — the opening slide of a PR-explainer analysis. Bookends
 * outro-card. Visually distinct from title-card so a PR thumbnail is
 * instantly recognizable as "a PR" rather than "a repo scan":
 *
 *   - title-card anchors on an italic-serif org/repo display headline.
 *   - pr-title-card anchors on a GIANT mono PR number sitting next to
 *     the italic-serif PR title. The PR# is the dominant identifier; it
 *     uses tabular-nums and the display-mono face so it reads at a glance.
 *
 * Visual hierarchy (top to bottom):
 *   1. Header strip — eyebrow (§ 00 / pr-title-card) + scene tag.
 *   2. Org/repo breadcrumb — small, dim, sets context.
 *   3. PR title + PR# row — italic serif title (left) + huge mono #N (right).
 *   4. Branch rail — `feature/x` → `main`, mono.
 *   5. Stat strip — additions / deletions / files changed, cool/warm/ink.
 *   6. Label chips — optional, max 4, cs-badge--{color}.
 *   7. Footer — author / reviewers / date / sha, brand under that.
 *
 * Fill mode: full-bleed (owns the whole stage rectangle).
 * Width token: max 1280px with stage safe-area inset; plate is 16:9 like
 * title-card, so the two render at identical aspect.
 *
 * emphasize(target):
 *   "prTitle"  → pulse the title
 *   "prNumber" → pulse the #N block
 *   "stats"    → pulse the stat strip
 *   "labels"   → pulse the chip row
 *   "author"   → pulse the author block in the footer
 */

interface PrTitleCardLabel {
  text: string;
  /** Free-form hex / oklch / css color — used for the chip outline + text. */
  color?: string;
}

interface PrTitleCardContent {
  prTitle: string;
  prNumber: string; // "#384" or "384" — we'll normalize the leading #
  repo: string;
  org?: string;
  author: string;
  reviewers?: string[];
  branchFrom: string;
  branchTo: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  labels?: PrTitleCardLabel[];
  headSha: string;
  analysisDate?: string;
  brand?: string;
  // Optional chrome overrides (mirror title-card).
  eyebrow?: string;
  sceneTag?: string;
}

function fmtDate(input?: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function normalizeNumber(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '#—';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function fmtSigned(n: number, kind: 'add' | 'del'): string {
  const safe = Number.isFinite(n) ? Math.trunc(n) : 0;
  // Unicode minus (U+2212) for deletions reads cleaner at large sizes
  // than ASCII hyphen and aligns with tabular-nums.
  return kind === 'add' ? `+${safe}` : `−${Math.abs(safe)}`;
}

export const prTitleCardTemplate: Template = {
  id: 'pr-title-card',
  version: '1.0.0',
  description:
    'Opening slide of a PR-explainer run. Glass plate anchored by an italic ' +
    'PR title and a giant mono PR number, with org/repo breadcrumb, branch ' +
    'rail, additions/deletions/files stat strip, optional label chips, and ' +
    'an author/reviewers/date/sha footer. Visually distinct from title-card.',
  slots: {
    prTitle: 'string — the PR headline, italic display type',
    prNumber: 'string — "#384" (with or without leading #), giant mono',
    repo: 'string — repo name (e.g. "next.js")',
    org: 'string — owner / organization (e.g. "vercel")',
    author: 'string — PR author handle (e.g. "@ricky")',
    reviewers: 'string[] — 0–4 reviewer handles',
    branchFrom: 'string — head branch (e.g. "feature/path-validation")',
    branchTo: 'string — base branch (e.g. "main")',
    additions: 'number — added lines (rendered "+247")',
    deletions: 'number — removed lines (rendered "−83")',
    filesChanged: 'number — files touched',
    labels: '{ text, color? }[] — 0–4 label chips',
    headSha: 'string — short head sha',
    analysisDate: 'string — ISO date or pre-formatted display string',
    brand: 'string — bottom-centre wordmark (default "Lenzon")',
  },
  demo: {
    label: 'PR Title Card',
    content: {
      prTitle: 'Tighten path validation in the upload handler',
      prNumber: '#384',
      repo: 'next.js',
      org: 'vercel',
      author: '@ricky',
      reviewers: ['@ana', '@sam'],
      branchFrom: 'feature/path-validation',
      branchTo: 'main',
      additions: 247,
      deletions: 83,
      filesChanged: 12,
      labels: [
        { text: 'security', color: '#ef4444' },
        { text: 'bug', color: '#f59e0b' },
      ],
      headSha: 'a3f29c1',
      analysisDate: '2026-05-25',
      brand: 'Lenzon',
    },
    emphasizeAfter: { target: 'prNumber', delayMs: 2200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as PrTitleCardContent;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-prtitle-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-prtitle-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-prtitle-plate';

    // Header strip.
    const header = document.createElement('div');
    header.className = 'sb-prtitle-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-prtitle-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 00 / pr-title-card';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-prtitle-tag';
    sceneTag.textContent = c.sceneTag ?? 'PR-00';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    // Body — split into context (top) and headline (centre).
    const body = document.createElement('div');
    body.className = 'sb-prtitle-body';

    // Org/repo breadcrumb.
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'sb-prtitle-breadcrumb';
    if (c.org) {
      const orgEl = document.createElement('span');
      orgEl.className = 'sb-prtitle-breadcrumb-org';
      orgEl.textContent = c.org;
      const slash = document.createElement('span');
      slash.className = 'sb-prtitle-breadcrumb-slash';
      slash.textContent = '/';
      breadcrumb.append(orgEl, slash);
    }
    const repoEl = document.createElement('span');
    repoEl.className = 'sb-prtitle-breadcrumb-repo';
    repoEl.textContent = c.repo ?? '';
    breadcrumb.appendChild(repoEl);
    body.appendChild(breadcrumb);

    // Headline row — italic title (left) + giant mono PR# (right).
    const headline = document.createElement('div');
    headline.className = 'sb-prtitle-headline';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-prtitle-title';
    titleEl.textContent = c.prTitle ?? '';
    headline.appendChild(titleEl);

    const numberEl = document.createElement('div');
    numberEl.className = 'sb-prtitle-number';
    numberEl.textContent = normalizeNumber(c.prNumber);
    headline.appendChild(numberEl);

    body.appendChild(headline);

    // Branch rail.
    const branchRail = document.createElement('div');
    branchRail.className = 'sb-prtitle-branch';
    const branchFrom = document.createElement('span');
    branchFrom.className = 'sb-prtitle-branch-ref sb-prtitle-branch-ref--from';
    branchFrom.textContent = c.branchFrom ?? '—';
    const branchArrow = document.createElement('span');
    branchArrow.className = 'sb-prtitle-branch-arrow';
    branchArrow.textContent = '→';
    const branchTo = document.createElement('span');
    branchTo.className = 'sb-prtitle-branch-ref sb-prtitle-branch-ref--to';
    branchTo.textContent = c.branchTo ?? 'main';
    branchRail.append(branchFrom, branchArrow, branchTo);
    body.appendChild(branchRail);

    // Stat strip.
    const stats = document.createElement('div');
    stats.className = 'sb-prtitle-stats';
    const addEl = document.createElement('span');
    addEl.className = 'sb-prtitle-stat sb-prtitle-stat--add';
    addEl.textContent = fmtSigned(c.additions ?? 0, 'add');
    const delEl = document.createElement('span');
    delEl.className = 'sb-prtitle-stat sb-prtitle-stat--del';
    delEl.textContent = fmtSigned(c.deletions ?? 0, 'del');
    const filesEl = document.createElement('span');
    filesEl.className = 'sb-prtitle-stat sb-prtitle-stat--files';
    const filesN = Number.isFinite(c.filesChanged) ? c.filesChanged : 0;
    filesEl.textContent = `${filesN} ${filesN === 1 ? 'file' : 'files'}`;
    stats.append(addEl, delEl, filesEl);
    body.appendChild(stats);

    // Label chips (optional).
    let chipsEl: HTMLElement | null = null;
    if (c.labels?.length) {
      chipsEl = document.createElement('div');
      chipsEl.className = 'sb-prtitle-chips';
      for (const label of c.labels.slice(0, 4)) {
        const chip = document.createElement('span');
        chip.className = 'cs-badge sb-prtitle-chip';
        if (label.color) {
          chip.style.color = label.color;
          chip.style.borderColor = label.color;
        }
        chip.textContent = label.text;
        chipsEl.appendChild(chip);
      }
      body.appendChild(chipsEl);
    }

    plate.appendChild(body);

    // Footer — author / reviewers / date / sha.
    const meta = document.createElement('div');
    meta.className = 'sb-prtitle-meta';

    const authorBlock = document.createElement('div');
    authorBlock.className = 'sb-prtitle-meta-block';
    const authorLabel = document.createElement('span');
    authorLabel.className = 'sb-prtitle-meta-label';
    authorLabel.textContent = 'Author';
    const authorValue = document.createElement('span');
    authorValue.className = 'sb-prtitle-meta-value';
    authorValue.textContent = c.author ?? '—';
    authorBlock.append(authorLabel, authorValue);
    meta.appendChild(authorBlock);

    const reviewersBlock = document.createElement('div');
    reviewersBlock.className = 'sb-prtitle-meta-block';
    const reviewersLabel = document.createElement('span');
    reviewersLabel.className = 'sb-prtitle-meta-label';
    reviewersLabel.textContent = 'Reviewers';
    const reviewersValue = document.createElement('span');
    reviewersValue.className = 'sb-prtitle-meta-value';
    const reviewers = (c.reviewers ?? []).slice(0, 4);
    reviewersValue.textContent = reviewers.length ? reviewers.join(' ') : '—';
    reviewersBlock.append(reviewersLabel, reviewersValue);
    meta.appendChild(reviewersBlock);

    const dateBlock = document.createElement('div');
    dateBlock.className = 'sb-prtitle-meta-block';
    const dateLabel = document.createElement('span');
    dateLabel.className = 'sb-prtitle-meta-label';
    dateLabel.textContent = 'Analyzed';
    const dateValue = document.createElement('span');
    dateValue.className = 'sb-prtitle-meta-value';
    dateValue.textContent = fmtDate(c.analysisDate) ?? '—';
    dateBlock.append(dateLabel, dateValue);
    meta.appendChild(dateBlock);

    const shaBlock = document.createElement('div');
    shaBlock.className = 'sb-prtitle-meta-block sb-prtitle-meta-block--right';
    const shaLabel = document.createElement('span');
    shaLabel.className = 'sb-prtitle-meta-label';
    shaLabel.textContent = 'Head sha';
    const shaValue = document.createElement('span');
    shaValue.className = 'sb-prtitle-meta-value';
    shaValue.textContent = c.headSha ?? '—';
    shaBlock.append(shaLabel, shaValue);
    meta.appendChild(shaBlock);

    plate.appendChild(meta);

    // Brand mark.
    const brand = document.createElement('div');
    brand.className = 'sb-prtitle-brand';
    const brandDot = document.createElement('span');
    brandDot.className = 'sb-prtitle-brand-dot';
    const brandText = document.createElement('span');
    brandText.textContent = c.brand ?? 'Lenzon';
    brand.append(brandDot, brandText);
    plate.appendChild(brand);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade.
    const sections: HTMLElement[] = [
      header,
      breadcrumb,
      headline,
      branchRail,
      stats,
    ];
    if (chipsEl) sections.push(chipsEl);
    sections.push(meta, brand);

    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(
          () => el.classList.add('sb-visible'),
          200 + i * 160,
        ),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      prTitle: titleEl,
      prNumber: numberEl,
      stats,
      labels: chipsEl ?? undefined,
      author: authorBlock,
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

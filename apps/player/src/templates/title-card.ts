import type { Template, TemplateHandle } from './registry';

/**
 * title-card — the opening slide of an analysis. A single full-bleed plate
 * with a kicker, an org/repo display headline, an optional blurb, and a
 * meta footer (analysis date, commit · branch). Calm by design (per
 * template-spec §4): one staggered fade-in, then hold still.
 *
 * Visual language follows lenzon/ui v0.1: plate built off `.cs-plate`
 * with a header strip carrying a mono eyebrow + scene badge, a body that
 * leads with a mono kicker and an Instrument-Serif italic display title,
 * and a footer with mono labels + display-italic primary values. The
 * accent budget stays at one — emphasize layers a warm ring on the
 * target block and clears any prior target first.
 *
 * Fill mode: full-bleed (template owns the whole stage rectangle).
 * Width token: standardised 1280px max with safe-area inset; the plate
 * uses 16:9 aspect-ratio so it scales the same way on every stage size.
 *
 * Slot schema:
 *   org:        string  — owner / organization (e.g. "vercel")
 *   repo:       string  — repository name (e.g. "next.js")
 *   blurb?:     string  — one-paragraph subtitle, ~1–3 sentences
 *   kicker?:    string  — small mono label above the title
 *                          (default "Codebase analysis")
 *   sceneTag?:  string  — top-right badge text (default "T-00")
 *   eyebrow?:   string  — top-left mono caption (default "§ 00 / title-card")
 *   analysisDate?: string  — ISO date or pre-formatted display string
 *   commit?:    string  — short commit sha
 *   branch?:    string  — branch name (e.g. "main")
 *   brand?:     string  — bottom centre wordmark (default "Lenzon")
 *
 * Producer-drift aliases (silent fallbacks, no warnings):
 *   title    → repo            (when `repo` missing)
 *   subtitle → blurb           (when `blurb` missing)
 *   accent   → kicker          (when `kicker` missing)
 *   date     → analysisDate    (when `analysisDate` missing)
 *   sha      → commit          (when `commit` missing)
 *   "owner/name" in repo       → split into org + repo
 *
 * emphasize(target):
 *   "repo"     → pulse the org/repo headline
 *   "blurb"    → pulse the subtitle
 *   "kicker"   → pulse the kicker label above the title
 *   "date"     → pulse the analysis-date meta block
 *   "commit"   → pulse the commit · branch meta block
 */

interface TitleCardContent {
  org?: string;
  repo: string;
  blurb?: string;
  kicker?: string;
  sceneTag?: string;
  eyebrow?: string;
  analysisDate?: string;
  commit?: string;
  branch?: string;
  brand?: string;
  // Producer-drift aliases — accepted silently so a script that uses the
  // "obvious" slot names still renders.
  title?: string;
  subtitle?: string;
  accent?: string;
  date?: string;
  sha?: string;
}

function fmtDate(input?: string): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Normalize Producer-supplied content into the canonical slot shape.
 * The Producer occasionally emits obvious-feeling names (title/subtitle/
 * accent) instead of the contracted slots; map them through here so a
 * minor drift doesn't render an empty card. The contracted slots always
 * win when both are present.
 */
function normalize(c: TitleCardContent): {
  org?: string;
  repo: string;
  blurb?: string;
  kicker?: string;
  sceneTag?: string;
  eyebrow?: string;
  analysisDate?: string;
  commit?: string;
  branch?: string;
  brand?: string;
} {
  let org = c.org;
  let repo = c.repo ?? c.title ?? '';

  // If the headline came in as "owner/name", split it into org + repo
  // so the styled "org /\nname" stack still works.
  if (!org && repo.includes('/')) {
    const slash = repo.indexOf('/');
    const left = repo.slice(0, slash).trim();
    const right = repo.slice(slash + 1).trim();
    if (left && right) {
      org = left;
      repo = right;
    }
  }

  return {
    org,
    repo,
    blurb: c.blurb ?? c.subtitle,
    kicker: c.kicker ?? c.accent,
    sceneTag: c.sceneTag,
    eyebrow: c.eyebrow,
    analysisDate: c.analysisDate ?? c.date,
    commit: c.commit ?? c.sha,
    branch: c.branch,
    brand: c.brand,
  };
}

export const titleCardTemplate: Template = {
  id: 'title-card',
  version: '1.0.0',
  description:
    'Opening slide of an analysis: a single full-bleed glass plate with a kicker, org/repo display headline, optional blurb, and a meta footer (analysis date, commit · branch).',
  slots: {
    org: 'string — owner / organization shown above the repo name',
    repo: 'string — repository name, the largest type on the plate',
    blurb: 'string — optional 1–3 sentence subtitle below the title',
    kicker: 'string — small mono label above the title (default "Codebase analysis")',
    sceneTag: 'string — top-right badge text (default "T-00")',
    eyebrow: 'string — top-left mono caption (default "§ 00 / title-card")',
    analysisDate: 'string — ISO date or pre-formatted display string',
    commit: 'string — short commit sha',
    branch: 'string — branch name (e.g. "main")',
    brand: 'string — bottom centre wordmark (default "Lenzon")',
  },
  demo: {
    label: 'Title Card',
    content: {
      org: 'vercel',
      repo: 'next.js',
      blurb:
        'A walkthrough of the App Router internals — how requests flow through the framework, where caching lives, and why use server changes everything downstream.',
      kicker: 'Codebase analysis',
      sceneTag: 'T-00',
      eyebrow: '§ 00 / title-card',
      analysisDate: '2026-04-28',
      commit: 'a3f29c1',
      branch: 'main',
      brand: 'Lenzon',
    },
    emphasizeAfter: { target: 'repo', delayMs: 2200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = normalize(contentIn as unknown as TitleCardContent);

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-titlecard-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-titlecard-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-titlecard-plate';

    // Header strip: eyebrow + scene tag.
    const header = document.createElement('div');
    header.className = 'sb-titlecard-header';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-titlecard-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 00 / title-card';
    header.appendChild(eyebrow);

    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--ink sb-titlecard-tag';
    sceneTag.textContent = c.sceneTag ?? 'T-00';
    header.appendChild(sceneTag);

    plate.appendChild(header);

    // Body: kicker + display title (org / repo) + optional blurb.
    const body = document.createElement('div');
    body.className = 'sb-titlecard-body';

    const kicker = document.createElement('span');
    kicker.className = 'sb-titlecard-kicker';
    kicker.textContent = c.kicker ?? 'Codebase analysis';
    body.appendChild(kicker);

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-titlecard-repo';
    if (c.org) {
      const org = document.createElement('span');
      org.className = 'sb-titlecard-repo-org';
      org.textContent = `${c.org} /`;
      titleEl.appendChild(org);
    }
    const name = document.createElement('span');
    name.className = 'sb-titlecard-repo-name';
    name.textContent = c.repo;
    titleEl.appendChild(name);
    body.appendChild(titleEl);

    let blurbEl: HTMLElement | null = null;
    if (c.blurb) {
      blurbEl = document.createElement('p');
      blurbEl.className = 'sb-titlecard-blurb';
      blurbEl.textContent = c.blurb;
      body.appendChild(blurbEl);
    }

    plate.appendChild(body);

    // Meta footer: analysis date · rule · commit/branch.
    const meta = document.createElement('div');
    meta.className = 'sb-titlecard-meta';

    const dateBlock = document.createElement('div');
    dateBlock.className = 'sb-titlecard-meta-block';
    const dateLabel = document.createElement('span');
    dateLabel.className = 'sb-titlecard-meta-label';
    dateLabel.textContent = 'Analysis date';
    const dateValue = document.createElement('span');
    dateValue.className = 'sb-titlecard-meta-value sb-titlecard-meta-value--lg';
    dateValue.textContent = fmtDate(c.analysisDate) ?? '—';
    dateBlock.append(dateLabel, dateValue);
    meta.appendChild(dateBlock);

    const rule = document.createElement('div');
    rule.className = 'sb-titlecard-meta-rule';
    meta.appendChild(rule);

    const commitBlock = document.createElement('div');
    commitBlock.className = 'sb-titlecard-meta-block sb-titlecard-meta-block--right';
    const commitLabel = document.createElement('span');
    commitLabel.className = 'sb-titlecard-meta-label';
    commitLabel.textContent = 'Commit · Branch';
    const commitValue = document.createElement('span');
    commitValue.className = 'sb-titlecard-meta-value';
    const commitText =
      c.commit && c.branch ? `${c.commit} · ${c.branch}` : c.commit ?? c.branch ?? '—';
    commitValue.textContent = commitText;
    commitBlock.append(commitLabel, commitValue);
    meta.appendChild(commitBlock);

    plate.appendChild(meta);

    // Brand mark — bottom-centre, optional.
    const brand = document.createElement('div');
    brand.className = 'sb-titlecard-brand';
    const dot = document.createElement('span');
    dot.className = 'sb-titlecard-brand-dot';
    const brandText = document.createElement('span');
    brandText.textContent = c.brand ?? 'Lenzon';
    brand.append(dot, brandText);
    plate.appendChild(brand);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Stagger the four sections in by toggling a visible class so CSS
    // owns the transitions.
    const sections: HTMLElement[] = [header, kicker, titleEl];
    if (blurbEl) sections.push(blurbEl);
    sections.push(meta, brand);

    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 200 + i * 180),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      repo: titleEl,
      blurb: blurbEl ?? undefined,
      kicker,
      date: dateBlock,
      commit: commitBlock,
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

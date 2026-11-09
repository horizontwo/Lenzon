import type { Template, TemplateHandle } from './registry';

/**
 * repo-pulse — community/liveness signal for a repo. Surfaces every field
 * from AnalysisJSON.community in one calm, scannable card. Calm by design
 * (per template-spec §4): one-shot stagger reveal, no continuous motion.
 *
 * lenzon/ui v0.1 styling: header uses .cs-title + mono eyebrow for
 * the repo label; the activity signal is a .cs-badge in the appropriate
 * semantic tone (active=ok / maintained=cool / dormant=warm / archived=
 * warn); stat tiles are .cs-plate--sunken with mono numbers; the
 * contributor card is a .cs-plate. The accent budget stays at one — the
 * signal pill carries the baseline accent; emphasize layers a warm ring
 * on the target block and clears any prior target first.
 *
 * Slot schema (matches AnalysisCommunity):
 *   activitySignal:               'active' | 'maintained' | 'dormant' | 'archived'
 *   lastCommitDate:               string (ISO)
 *   daysSinceLastCommit:          number
 *   commitsLast30Days:            number
 *   commitsLast90Days:            number
 *   commitsLast365Days:           number
 *   uniqueContributorsLast90Days: number
 *   totalContributors:            number
 *   topContributors?:             { name, commits, lastActiveDate }[]
 *   branchCount:                  number
 *   tagCount:                     number
 *   title?:                       string  (optional headline override)
 *   repoLabel?:                   string  (optional repo name shown above the title)
 *
 * emphasize(target):
 *   "signal" → pulse the activity-signal pill
 *   "stats"  → pulse the stats block
 *   "contributors" → pulse the contributor list
 *   "0", "1", ... → pulse a specific contributor row
 */

interface ContributorActivity {
  name: string;
  commits: number;
  lastActiveDate: string;
}

interface RepoPulseContent {
  activitySignal: 'active' | 'maintained' | 'dormant' | 'archived';
  lastCommitDate: string;
  daysSinceLastCommit: number;
  commitsLast30Days: number;
  commitsLast90Days: number;
  commitsLast365Days: number;
  uniqueContributorsLast90Days: number;
  totalContributors: number;
  topContributors?: ContributorActivity[];
  branchCount: number;
  tagCount: number;
  title?: string;
  repoLabel?: string;
}

const SIGNAL_TONE: Record<RepoPulseContent['activitySignal'], 'ok' | 'cool' | 'warm' | 'warn'> = {
  active: 'ok',
  maintained: 'cool',
  dormant: 'warm',
  archived: 'warn',
};

const SIGNAL_LABELS: Record<RepoPulseContent['activitySignal'], string> = {
  active: 'Active',
  maintained: 'Maintained',
  dormant: 'Dormant',
  archived: 'Archived',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDays(n: number): string {
  if (n < 1) return 'today';
  if (n === 1) return '1 day ago';
  if (n < 60) return `${n} days ago`;
  if (n < 365) return `${Math.round(n / 30)} months ago`;
  const years = (n / 365).toFixed(1);
  return `${years} years ago`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

export const repoPulseTemplate: Template = {
  id: 'repo-pulse',
  version: '1.0.0',
  description:
    'Community/liveness card: activity signal badge, commit-recency stats, contributor counts, and top contributors. Sourced from AnalysisJSON.community.',
  slots: {
    activitySignal: "'active' | 'maintained' | 'dormant' | 'archived'",
    lastCommitDate: 'string — ISO date of most recent commit',
    daysSinceLastCommit: 'number',
    commitsLast30Days: 'number',
    commitsLast90Days: 'number',
    commitsLast365Days: 'number',
    uniqueContributorsLast90Days: 'number',
    totalContributors: 'number',
    topContributors: '{ name, commits, lastActiveDate }[] (optional, up to ~5)',
    branchCount: 'number',
    tagCount: 'number',
    title: 'string — optional headline override',
    repoLabel: 'string — optional repo name shown above the title',
  },
  demo: {
    label: 'Repo Pulse',
    content: {
      activitySignal: 'maintained',
      lastCommitDate: '2026-03-22T14:18:00Z',
      daysSinceLastCommit: 28,
      commitsLast30Days: 12,
      commitsLast90Days: 47,
      commitsLast365Days: 213,
      uniqueContributorsLast90Days: 4,
      totalContributors: 18,
      topContributors: [
        { name: 'alice',  commits: 412, lastActiveDate: '2026-03-22T14:18:00Z' },
        { name: 'bob',    commits: 187, lastActiveDate: '2026-03-15T10:02:00Z' },
        { name: 'carol',  commits:  93, lastActiveDate: '2026-02-28T09:44:00Z' },
        { name: 'dan',    commits:  41, lastActiveDate: '2026-01-12T17:30:00Z' },
        { name: 'erin',   commits:  22, lastActiveDate: '2025-12-04T11:08:00Z' },
      ],
      branchCount: 7,
      tagCount: 24,
      title: 'Community pulse',
      repoLabel: 'example/repo',
    },
    emphasizeAfter: { target: 'signal', delayMs: 1800 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as RepoPulseContent;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-repopulse-wrapper';

    // Header: repo label (mono eyebrow) + title (display italic).
    const header = document.createElement('div');
    header.className = 'sb-repopulse-header';
    if (c.repoLabel) {
      const label = document.createElement('div');
      label.className = 'cs-eyebrow cs-eyebrow--dim sb-repopulse-repolabel';
      label.textContent = c.repoLabel;
      header.appendChild(label);
    }
    const title = document.createElement('div');
    title.className = 'cs-title cs-title--m sb-repopulse-title';
    title.textContent = c.title ?? 'Community pulse';
    header.appendChild(title);
    wrapper.appendChild(header);

    // Signal pill + last-commit caption.
    const signalBlock = document.createElement('div');
    signalBlock.className = 'sb-repopulse-signalblock';
    const tone = SIGNAL_TONE[c.activitySignal] ?? 'cool';
    const pill = document.createElement('div');
    pill.className = `cs-badge cs-badge--${tone} sb-repopulse-signal`;
    pill.textContent = SIGNAL_LABELS[c.activitySignal] ?? c.activitySignal;
    signalBlock.appendChild(pill);

    const caption = document.createElement('div');
    caption.className = 'sb-repopulse-caption';
    caption.textContent = `Last commit ${fmtDays(c.daysSinceLastCommit)} · ${fmtDate(c.lastCommitDate)}`;
    signalBlock.appendChild(caption);
    wrapper.appendChild(signalBlock);

    // Stat tiles — each a sunken plate with mono number + eyebrow label.
    const statsGrid = document.createElement('div');
    statsGrid.className = 'sb-repopulse-stats';
    const stats: { label: string; value: number | string }[] = [
      { label: 'Commits / 30d', value: c.commitsLast30Days },
      { label: 'Commits / 90d', value: c.commitsLast90Days },
      { label: 'Commits / 1yr', value: c.commitsLast365Days },
      { label: 'Branches', value: c.branchCount },
      { label: 'Tags', value: c.tagCount },
    ];
    for (const s of stats) {
      const tile = document.createElement('div');
      tile.className = 'cs-plate cs-plate--sunken sb-repopulse-stat';

      const v = document.createElement('div');
      v.className = 'sb-repopulse-stat-value';
      v.textContent = String(s.value);
      tile.appendChild(v);

      const l = document.createElement('div');
      l.className = 'cs-eyebrow cs-eyebrow--dim sb-repopulse-stat-label';
      l.textContent = s.label;
      tile.appendChild(l);

      statsGrid.appendChild(tile);
    }
    wrapper.appendChild(statsGrid);

    // Contributor card — plate containing a summary line + list of rows.
    const contribCard = document.createElement('div');
    contribCard.className = 'cs-plate cs-plate--default sb-repopulse-contribs';
    const summaryLine = document.createElement('div');
    summaryLine.className = 'sb-repopulse-contribs-summary';
    summaryLine.textContent =
      `${c.totalContributors} total contributor${c.totalContributors === 1 ? '' : 's'} · ` +
      `${c.uniqueContributorsLast90Days} active in last 90d`;
    contribCard.appendChild(summaryLine);

    const contribRows: HTMLElement[] = [];
    if (c.topContributors && c.topContributors.length > 0) {
      const list = document.createElement('div');
      list.className = 'sb-repopulse-contribs-list';
      c.topContributors.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'sb-repopulse-contrib-row';
        row.dataset.target = String(i);

        const name = document.createElement('span');
        name.className = 'sb-repopulse-contrib-name';
        name.textContent = p.name;

        const commits = document.createElement('span');
        commits.className = 'sb-repopulse-contrib-commits';
        commits.textContent = `${p.commits} commit${p.commits === 1 ? '' : 's'}`;

        const last = document.createElement('span');
        last.className = 'sb-repopulse-contrib-last';
        last.textContent = `last ${fmtDays(daysBetween(p.lastActiveDate, c.lastCommitDate))}`;

        row.appendChild(name);
        row.appendChild(commits);
        row.appendChild(last);
        list.appendChild(row);
        contribRows.push(row);
      });
      contribCard.appendChild(list);
    } else {
      const empty = document.createElement('div');
      empty.className = 'sb-repopulse-contribs-empty';
      empty.textContent = 'No contributor history available.';
      contribCard.appendChild(empty);
    }
    wrapper.appendChild(contribCard);

    presenter.domRoot.appendChild(wrapper);

    // Stagger the four sections in by toggling a visible class so CSS
    // owns the transitions (rather than inline style mutations).
    const sections = [header, signalBlock, statsGrid, contribCard];
    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 200 + i * 220),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      signal: pill,
      stats: statsGrid,
      contributors: contribCard,
    };

    // Track the currently-pulsed element so the accent budget stays at 1.
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
        const el =
          emphasizeMap[target] ??
          (Number.isFinite(Number(target)) ? contribRows[Number(target)] : undefined);
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

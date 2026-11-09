import type { Template, TemplateHandle } from './registry';

/**
 * drift-callout — beat 4 of a spec explainer: where the code has moved away
 * from the drawing since the spec was last verified.
 *
 * The nearest existing shape is compare-split, and the difference is the
 * reason this template exists. A compare says two things differ. A drift
 * callout says which side is the DRAWING (what the spec says, as of its
 * grounding commit) and which is the BUILDING (the files that changed since,
 * with the merges that changed them), and how long the gap has been open.
 * The two panels are not peers, so they are not styled as peers: the drawing
 * is a quiet sunken plate, the building carries the warn tone.
 *
 * Layout (top to bottom):
 *   1. Header strip — eyebrow + lane badge + scene tag.
 *   2. Title row    — italic heading.
 *   3. Gap band     — grounded (sha, date) → drift onset → days since
 *                     grounding. The open interval is drawn warn.
 *   4. The split    — drawing (left, narrower) | building (right, wider).
 *                     The building lists each moved path with the merges
 *                     that touched it, then any edited parent docs.
 *   5. Disclosure   — what the lists hold back: collapsed rows, the
 *                     worker's commit cap, a truncated or skipped sweep.
 *
 * Honesty constraints this template enforces structurally:
 *   - The onset date and the days since grounding render only from supplied
 *     fields. Nothing is derived from dates here, because the digest
 *     computes them and a second computation could disagree with it. A
 *     missing day count is left out, not shown as zero.
 *   - A null `onsetAt` renders as "undated". Null means the worker could not
 *     date the divergence, not that there was none — the finding stands.
 *   - When `mergeSweep.swept` is false the building says the sweep did not
 *     run, in place of merge chips. An empty merge list from a sweep that
 *     never ran is not evidence that nothing merged.
 *   - Every list that is shortened says by how much: collapsed file rows,
 *     per-file merge chips, a truncated sweep, a commit list at the
 *     worker's cap of 20.
 *
 * Fill mode: full-bleed (owns the whole stage rectangle).
 * Width token: max 1280px via var(--sb-stage-w-max); 16:9 plate.
 * Calm: one-shot staggered reveal, no continuous motion. No DOM
 * measurement, so §9d does not apply.
 *
 * emphasize(target):
 *   "drawing"     → pulse the drawing panel
 *   "building"    → pulse the building panel
 *   "gap"         → pulse the gap band
 *   "<path>"      → pulse that file row (full path or bare filename)
 *   "#<pr>"/"<pr>"→ pulse every merge chip from that PR
 */

interface DriftMerge {
  number: number | null;
  sha: string;
  subject: string;
  mergedAt: string;
  changedPaths: string[];
}

interface DriftCalloutContent {
  heading?: string;
  // Mirrors SpecIdentity.
  docId: string;
  title?: string | null;
  relPath?: string;
  groundedAt: string;
  groundedOn?: string | null;
  daysSinceGrounding?: number | null;
  /** A short line the spec claims, quoted on the drawing side. */
  claim?: string;
  // Mirrors SpecDrift.
  onsetAt?: string | null;
  changedFiles?: string[];
  changedParents?: Array<{ id: string; relPath: string }>;
  commits?: string[];
  merges?: DriftMerge[];
  mergeSweep?: { swept: boolean; reason: string | null; truncated: boolean };
  /** File rows shown before the rest collapse into a stated count. */
  maxFiles?: number;
  eyebrow?: string;
  sceneTag?: string;
}

/** The worker caps `stale.commits` at this many. */
const COMMIT_CAP = 20;

function fmtDate(input?: string | null): string | null {
  if (input == null || input === '') return null;
  const raw = String(input);
  // A bare "2026-10-05" parses as UTC midnight and renders a day early west
  // of Greenwich. Read it as a local date.
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

function prKey(raw: unknown): string {
  return String(raw ?? '').trim().replace(/^#/, '');
}

function strList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export const driftCalloutTemplate: Template = {
  id: 'drift-callout',
  version: '1.0.0',
  description:
    'Beat 4 of a spec explainer: where the code moved away from the spec ' +
    'since it was last grounded. A gap band (grounded sha and date → drift ' +
    'onset → days since grounding) over a split: the drawing (doc id, ' +
    'title, grounding, an optional quoted claim) and the building (each ' +
    'path changed since grounding with the merges that touched it, plus ' +
    'edited parent docs). Dates and day counts render only as supplied; a ' +
    'skipped merge sweep and any shortened list are disclosed.',
  slots: {
    heading: 'string — optional headline (default "Where the code moved")',
    docId: 'string — doc id (SpecIdentity.docId)',
    title: 'string — the doc title (SpecIdentity.title)',
    relPath: 'string — repo-relative path (SpecIdentity.relPath)',
    groundedAt: 'string — grounding sha (SpecIdentity.groundedAt)',
    groundedOn: 'string — grounding commit date (SpecIdentity.groundedOn)',
    daysSinceGrounding: 'number — from the digest; omitted means not shown',
    claim: 'string — a short line the spec claims, quoted verbatim',
    onsetAt: 'string | null — when drift began (SpecDrift.onsetAt); null = undated',
    changedFiles: 'string[] — SpecDrift.changedFiles',
    changedParents: '{ id, relPath }[] — SpecDrift.changedParents',
    commits: 'string[] — SpecDrift.commits ("sha subject")',
    merges: '{ number, sha, subject, mergedAt, changedPaths }[] — SpecDrift.merges',
    mergeSweep: '{ swept, reason, truncated } — SpecDrift.mergeSweep',
    maxFiles: 'number — file rows before the rest collapse (default 5, or 4 with parents)',
  },
  demo: {
    label: 'Drift Callout',
    content: {
      heading: 'Where the code moved',
      docId: 'pipeline-spec',
      title: 'Lenzon — The Pipeline (Current State)',
      relPath: 'docs/PIPELINE.md',
      groundedAt: 'c2c8e47',
      groundedOn: '2026-10-03',
      daysSinceGrounding: 23,
      claim:
        'A PrExplainerRun row is upserted when the webhook lands, then the worker drives the rest.',
      onsetAt: '2026-10-05',
      changedFiles: ['apps/server/prisma/schema.prisma'],
      changedParents: [],
      commits: [
        '281bd56 Let a person retire a document from its card, with a reason',
        '4320ebc Let a person accept or decline an extraction proposal from the card',
        '2defd2c Let a re-verify verdict replace its button, and colour only Current',
      ],
      merges: [
        {
          number: 163,
          sha: 'deaa0d3',
          subject: 'Let a re-verify verdict replace its button, and colour only Current',
          mergedAt: '2026-10-05',
          changedPaths: ['apps/server/prisma/schema.prisma'],
        },
        {
          number: 166,
          sha: '4588ce0',
          subject: 'Let a person accept or decline an extraction proposal from the card',
          mergedAt: '2026-10-06',
          changedPaths: ['apps/server/prisma/schema.prisma'],
        },
        {
          number: 169,
          sha: 'e9d9d8d',
          subject: 'Let a person retire a document from its card, with a reason',
          mergedAt: '2026-10-06',
          changedPaths: ['apps/server/prisma/schema.prisma'],
        },
      ],
      mergeSweep: { swept: true, reason: null, truncated: false },
    },
    emphasizeAfter: { target: 'gap', delayMs: 3000 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as DriftCalloutContent;

    const changedFiles = strList(c.changedFiles);
    const parents = (Array.isArray(c.changedParents) ? c.changedParents : []).filter(
      (p) => p && typeof p.id === 'string',
    );
    const commits = strList(c.commits);
    const merges = (Array.isArray(c.merges) ? c.merges : []).filter(Boolean);
    const sweep = c.mergeSweep ?? { swept: true, reason: null, truncated: false };
    const swept = sweep.swept !== false;
    const days =
      typeof c.daysSinceGrounding === 'number' && Number.isFinite(c.daysSinceGrounding)
        ? Math.trunc(c.daysSinceGrounding)
        : null;
    // Five rows fit the building panel with one merge chip each; four when
    // the parent-docs group takes the bottom of the panel.
    const maxFiles = Math.max(1, Math.trunc(c.maxFiles ?? (parents.length > 0 ? 4 : 5)));

    // Rows are the paths that moved: the changed files first, then any path
    // a merge touched that the stale list did not name. Each row gathers the
    // merges that touched it, oldest first.
    const rowPaths: string[] = [...changedFiles];
    for (const m of merges) {
      for (const p of strList(m.changedPaths)) if (!rowPaths.includes(p)) rowPaths.push(p);
    }
    const mergesFor = (path: string) =>
      merges
        .filter((m) => strList(m.changedPaths).includes(path))
        .sort((a, b) => String(a.mergedAt).localeCompare(String(b.mergedAt)));

    const wrapper = el('div', 'sb-drift-wrapper');
    const stage = el('div', 'sb-drift-stage');
    const plate = el('div', 'cs-plate cs-plate--default sb-drift-plate');

    // 1. Header strip.
    const header = el('div', 'sb-drift-header');
    const eyebrow = el(
      'span',
      'cs-eyebrow cs-eyebrow--dim sb-drift-eyebrow',
      c.eyebrow ?? '§ 04 / drift-callout',
    );
    const headRight = el('span', 'sb-drift-header-right');
    const lane = el('span', 'cs-badge cs-badge--warn sb-drift-lane', 'stale');
    const sceneTag = el('span', 'cs-badge cs-badge--cool sb-drift-tag', c.sceneTag ?? 'DRIFT');
    headRight.append(lane, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = el('div', 'sb-drift-body');

    // 2. Title.
    const titleEl = el('h1', 'sb-drift-title', c.heading?.trim() || 'Where the code moved');
    body.appendChild(titleEl);

    // 3. Gap band — three stops on a rail. The interval from grounding to
    //    now is drawn warn from the onset stop onward.
    const gap = el('div', 'sb-drift-gap');
    const mkStop = (label: string, value: string, sub: string | null, mod: string) => {
      const stop = el('div', `sb-drift-stop sb-drift-stop--${mod}`);
      stop.append(el('span', 'sb-drift-stop-label', label), el('span', 'sb-drift-stop-value', value));
      if (sub) stop.appendChild(el('span', 'sb-drift-stop-sub', sub));
      return stop;
    };
    const onset = fmtDate(c.onsetAt);
    gap.append(
      mkStop('Grounded', c.groundedAt || '—', fmtDate(c.groundedOn), 'grounded'),
      el('span', 'sb-drift-rail sb-drift-rail--held'),
      mkStop('Drift began', onset ?? 'undated', onset ? null : 'not dated by the worker', onset ? 'onset' : 'onset sb-drift-stop--undated'),
      el('span', 'sb-drift-rail sb-drift-rail--open'),
    );
    if (days != null) {
      const daysStop = el('div', 'sb-drift-stop sb-drift-stop--days');
      daysStop.append(
        el('span', 'sb-drift-days-n', String(days)),
        el('span', 'sb-drift-stop-label', days === 1 ? 'day since grounding' : 'days since grounding'),
      );
      gap.appendChild(daysStop);
    } else {
      gap.appendChild(mkStop('Now', 'open', null, 'now'));
    }
    body.appendChild(gap);

    // 4. The split.
    const split = el('div', 'sb-drift-split');

    // Drawing — what the spec says, as of its grounding.
    const drawing = el('section', 'cs-plate cs-plate--sunken sb-drift-panel sb-drift-drawing');
    drawing.appendChild(el('span', 'sb-drift-panel-eyebrow', 'The drawing'));
    drawing.appendChild(el('span', 'sb-drift-docid', c.docId ?? ''));
    if (c.title) drawing.appendChild(el('span', 'sb-drift-doctitle', c.title));
    if (c.relPath) drawing.appendChild(el('span', 'sb-drift-docpath', c.relPath));
    if (c.claim) {
      const q = el('blockquote', 'sb-drift-claim', c.claim);
      drawing.appendChild(q);
    }
    drawing.appendChild(
      el(
        'span',
        'sb-drift-asof',
        `as of ${c.groundedAt || '—'}${c.groundedOn ? ` · ${fmtDate(c.groundedOn)}` : ''}`,
      ),
    );

    // Building — what moved since.
    const building = el('section', 'cs-plate cs-plate--sunken sb-drift-panel sb-drift-building');
    const bHead = el('div', 'sb-drift-building-head');
    bHead.append(
      el('span', 'sb-drift-panel-eyebrow', 'The building, since'),
      el(
        'span',
        'sb-drift-count',
        `${plural(rowPaths.length, 'path', 'paths')} moved${swept ? ` · ${plural(merges.length, 'merge', 'merges')}` : ''}`,
      ),
    );
    building.appendChild(bHead);

    const list = el('ul', 'sb-drift-files');
    type Row = { el: HTMLElement; path: string };
    const rows: Row[] = [];
    const chipsByPr = new Map<string, HTMLElement[]>();

    // Merge chips per row shrink as rows grow, so a sparse building shows
    // every merge and a dense one stays inside its panel. Whatever is cut
    // is stated on the row.
    const shownRows = Math.min(rowPaths.length, maxFiles);
    const mergesPerRow = shownRows <= 2 ? 5 : shownRows <= 4 ? 2 : 1;

    rowPaths.slice(0, maxFiles).forEach((path) => {
      const li = el('li', 'sb-drift-file');
      const slash = path.lastIndexOf('/');
      const line = el('div', 'sb-drift-file-line');
      const pathEl = el('span', 'sb-drift-file-path');
      if (slash >= 0) pathEl.appendChild(el('span', 'sb-drift-file-dir', path.slice(0, slash + 1)));
      pathEl.appendChild(el('span', 'sb-drift-file-name', path.slice(slash + 1)));
      line.appendChild(pathEl);
      li.appendChild(line);

      if (swept) {
        const ms = mergesFor(path);
        const chips = el('div', 'sb-drift-merges');
        if (ms.length === 0) {
          chips.appendChild(el('span', 'sb-drift-merge-none', 'no merge found'));
        }
        ms.slice(0, mergesPerRow).forEach((m) => {
          const chip = el('span', 'sb-drift-merge');
          const num = m.number != null ? `#${m.number}` : m.sha;
          chip.append(
            el('span', 'sb-drift-merge-n', num),
            el('span', 'sb-drift-merge-subject', m.subject ?? ''),
            el('span', 'sb-drift-merge-date', fmtDate(m.mergedAt) ?? ''),
          );
          const key = m.number != null ? String(m.number) : m.sha;
          chipsByPr.set(key, [...(chipsByPr.get(key) ?? []), chip]);
          chips.appendChild(chip);
        });
        // The cut count rides the path line, so it costs no row height.
        if (ms.length > mergesPerRow) {
          line.appendChild(
            el('span', 'sb-drift-merge-more', `+${plural(ms.length - mergesPerRow, 'more merge', 'more merges')}`),
          );
        }
        li.appendChild(chips);
      }
      list.appendChild(li);
      rows.push({ el: li, path });
    });
    building.appendChild(list);
    // Outside the list, so the count stays visible even if a long row pushes
    // the list against the bottom of the panel.
    if (rowPaths.length > maxFiles) {
      building.appendChild(
        el('span', 'sb-drift-files-more', `+ ${plural(rowPaths.length - maxFiles, 'more path', 'more paths')} not shown`),
      );
    }

    if (!swept) {
      const note = el('div', 'sb-drift-nosweep');
      note.append(
        el('span', 'sb-drift-nosweep-label', 'Sweep did not run'),
        el(
          'span',
          'sb-drift-nosweep-text',
          `No merge list was built${sweep.reason ? ` (${sweep.reason})` : ''}. Its absence is not evidence that nothing merged.`,
        ),
      );
      building.appendChild(note);
    }

    if (parents.length > 0) {
      const pGroup = el('div', 'sb-drift-parents');
      pGroup.appendChild(el('span', 'sb-drift-parents-label', 'Parent docs edited'));
      for (const p of parents) {
        const row = el('span', 'sb-drift-parent');
        row.append(el('span', 'sb-drift-parent-id', p.id), el('span', 'sb-drift-parent-path', p.relPath ?? ''));
        pGroup.appendChild(row);
      }
      building.appendChild(pGroup);
    }

    split.append(drawing, building);
    body.appendChild(split);

    // 5. Disclosure — what the lists hold back, stated.
    const notes: string[] = [];
    if (commits.length > 0) {
      notes.push(
        commits.length >= COMMIT_CAP
          ? `at least ${COMMIT_CAP} commits since grounding (the worker stops counting at ${COMMIT_CAP})`
          : `${plural(commits.length, 'commit', 'commits')} since grounding`,
      );
    }
    if (swept && sweep.truncated) notes.push('merge sweep truncated — more merges exist than are listed');
    let disclosure: HTMLElement | null = null;
    if (notes.length > 0) {
      disclosure = el('div', 'sb-drift-disclosure', notes.join(' · '));
      body.appendChild(disclosure);
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade — header, title, gap, drawing, building, then rows.
    const sections: HTMLElement[] = [header, titleEl, gap, drawing, building];
    rows.forEach((r) => sections.push(r.el));
    if (disclosure) sections.push(disclosure);
    const timers: number[] = [];
    sections.forEach((s, i) => {
      const delay = i < 5 ? 200 + i * 220 : 1300 + (i - 5) * 120;
      timers.push(window.setTimeout(() => s.classList.add('sb-visible'), delay));
    });

    let active: HTMLElement[] = [];
    let activeTimer: number | null = null;
    const clearActive = () => {
      for (const a of active) a.classList.remove('sb-emphasize');
      if (activeTimer != null) window.clearTimeout(activeTimer);
      active = [];
      activeTimer = null;
    };

    const resolve = (target: string): HTMLElement[] => {
      if (target === 'drawing') return [drawing];
      if (target === 'building') return [building];
      if (target === 'gap') return [gap];
      const key = prKey(target);
      if (chipsByPr.has(key)) return chipsByPr.get(key)!;
      const exact = rows.find((r) => r.path === target);
      if (exact) return [exact.el];
      const byName = rows.find((r) => r.path.split('/').pop() === target);
      return byName ? [byName.el] : [];
    };

    return {
      dismiss: () => {
        clearActive();
        for (const t of timers) window.clearTimeout(t);
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const els = resolve(String(target));
        if (els.length === 0) return;
        clearActive();
        for (const e of els) e.classList.add('sb-emphasize');
        active = els;
        activeTimer = window.setTimeout(clearActive, 1500);
      },
    };
  },
};

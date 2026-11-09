import type { Template, TemplateHandle } from './registry';

/**
 * file-trajectory — the "where the work concentrated" beat. One file (or
 * module) and its whole life across the series: every touch, in order,
 * each carrying the analyst's own description of what that PR did to it.
 *
 * This is the information layer from 3D-VISUALIZATION-SPEC rendered flat.
 * Its data source is AnalysisFileTouch directly — no analysis blob reads
 * — which makes it the cheapest template in the series set to populate.
 *
 * Layout:
 *   1. Header strip  — eyebrow + touch-count chip + scene tag.
 *   2. Path row      — the file path in mono, with the leading directories
 *                      dimmed and the basename at full contrast, so a long
 *                      path still reads at a glance.
 *   3. The spine     — a vertical rail with one node per touch: PR ref +
 *                      date on the left of the rail, description on the
 *                      right. Order is the payload's order.
 *   4. Co-change rail — optional footer: files that moved alongside this
 *                      one, each with the count of shared PRs.
 *   5. Rename caveat — optional. Git renames are not tracked in the
 *                      corpus, so a `git mv` silently truncates a
 *                      trajectory. When the producer knows the path was
 *                      renamed (or simply cannot rule it out) it passes
 *                      `renameCaveat` and the template states it.
 *
 * Honesty constraints built into the layout:
 *   - The touch count in the header is the number of touches RENDERED,
 *     and when `maxTouches` collapses the middle of a long trajectory the
 *     collapsed count is shown as a real node on the rail ("14 touches
 *     not shown"), not dropped. A trajectory that silently skipped its
 *     middle would misrepresent the file's churn.
 *   - Collapse takes from the MIDDLE, keeping the first and last touches.
 *     For a trajectory, the beginning and the current state are the two
 *     things a viewer needs; the middle is the compressible part.
 *   - Dates are labelled "analyzed" in the rail's own header, never
 *     "merged" — analyzedAt is a proxy and the chrome says so once,
 *     rather than implying merge timing per row.
 *
 * Fill mode: full-bleed.
 * Calm: one-shot staggered reveal down the rail. No continuous motion.
 *
 * emphasize(target):
 *   "touch:<prNumber>" → pulse the node(s) for that PR
 *   "pr:<prNumber>"    → same (accepted alias; the spec allows either)
 *   "<index>"          → pulse by 0-based node index
 *   "path"             → pulse the path row
 *   "cochange"         → pulse the co-change rail
 */

interface Touch {
  prNumber: string | number;
  /** ISO date or display string. */
  at?: string;
  /** The analyst's own description of what this PR did to the file. */
  description: string;
  /** "L42-L51" — rendered as a small mono chip when present. */
  lineRange?: string;
}

interface CoChange {
  path: string;
  sharedPrs: number;
}

interface FileTrajectoryContent {
  path: string;
  touches: Touch[];
  coChange?: CoChange[];
  /** Cap on rendered nodes; the middle collapses and says how many. */
  maxTouches?: number;
  /** Stated when a rename may have truncated the history. */
  renameCaveat?: string;
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

function fmtShortDate(input: string | undefined): string | null {
  if (!input) return null;
  const d = new Date(String(input));
  if (isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Split "a/b/c.ts" into { dir: "a/b/", base: "c.ts" }. */
function splitPath(path: string): { dir: string; base: string } {
  const p = String(path ?? '');
  const i = p.lastIndexOf('/');
  if (i < 0) return { dir: '', base: p };
  return { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

export const fileTrajectoryTemplate: Template = {
  id: 'file-trajectory',
  version: '1.0.0',
  description:
    'One file and its life across a series: every touch in order, each ' +
    "with the analyst's own description, on a vertical spine with PR ref " +
    'and date. Optional co-change rail lists files that moved alongside ' +
    'it. Long trajectories collapse from the middle and state how many ' +
    'touches are not shown, keeping the first and current touch visible.',
  slots: {
    path: 'string — the file or module path',
    touches:
      '{ prNumber, at?, description, lineRange? }[] — in order; ' +
      'description is the analyst\'s own wording, not a summary',
    coChange: '{ path, sharedPrs }[] — files that moved alongside this one',
    maxTouches:
      'number — cap on rendered nodes; the middle collapses into a ' +
      'stated count, first and last always kept',
    renameCaveat:
      'string — stated when a git rename may have truncated the history ' +
      '(the corpus does not track renames)',
    staggerMs: 'number — total node reveal window (default 1100)',
  },
  demo: {
    label: 'File Trajectory',
    content: {
      path: 'packages/sidecar/src/mcp/server.ts',
      maxTouches: 9,
      renameCaveat:
        'Renames are not tracked in the corpus — touches before any git mv are not represented.',
      touches: [
        { prNumber: 17, at: '2026-08-05', description: 'Stand up the MCP server entry point', lineRange: 'L1-L84' },
        { prNumber: 18, at: '2026-08-05', description: 'Register the first three tool handlers', lineRange: 'L84-L162' },
        { prNumber: 19, at: '2026-08-06', description: 'Thread userId through every handler for tenancy' },
        { prNumber: 21, at: '2026-08-07', description: 'Wire the corpus query surface into the tool list', lineRange: 'L162-L240' },
        { prNumber: 22, at: '2026-08-08', description: 'Split transport from handler registration for hosting' },
        { prNumber: 24, at: '2026-08-09', description: 'Return typed errors instead of throwing strings' },
        { prNumber: 26, at: '2026-08-10', description: 'Refuse unjoinable check inputs at the boundary', lineRange: 'L240-L288' },
        { prNumber: 30, at: '2026-08-12', description: 'Expose the skill surface as a tool' },
        { prNumber: 31, at: '2026-08-13', description: 'Validate ledger payloads before write', lineRange: 'L288-L331' },
        { prNumber: 32, at: '2026-08-14', description: 'Fix the two defects the clean-machine gate found' },
        { prNumber: 33, at: '2026-08-14', description: 'Surface snapshot counts through the query tool' },
      ],
      coChange: [
        { path: 'packages/sidecar/src/ledger.ts', sharedPrs: 7 },
        { path: 'packages/sidecar/src/validate.ts', sharedPrs: 5 },
        { path: 'docs/active_plans/SIDECAR-SURFACE-COMPLETION.md', sharedPrs: 8 },
      ],
      staggerMs: 1100,
    },
    emphasizeAfter: { target: 'touch:26', delayMs: 3600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as FileTrajectoryContent;

    const path = String(c.path ?? '').trim();
    const stagger = Math.max(200, c.staggerMs ?? 1100);
    const allTouches = (Array.isArray(c.touches) ? c.touches : [])
      .filter(Boolean)
      .filter((t) => String(t.description ?? '').trim().length > 0);
    const coChange = (Array.isArray(c.coChange) ? c.coChange : []).filter(Boolean);

    // Collapse from the middle, keeping head and tail. A trajectory's two
    // load-bearing ends are "how it started" and "where it stands"; the
    // middle is what compresses without misleading.
    const cap =
      Number.isFinite(c.maxTouches as number) && (c.maxTouches as number) > 2
        ? Math.trunc(c.maxTouches as number)
        : allTouches.length;

    type Node =
      | { kind: 'touch'; touch: Touch; index: number }
      | { kind: 'collapsed'; count: number };

    const nodes: Node[] = [];
    if (allTouches.length <= cap) {
      allTouches.forEach((t, i) => nodes.push({ kind: 'touch', touch: t, index: i }));
    } else {
      // Reserve one slot for the collapsed marker, then split the rest
      // head/tail with the head favoured on an odd remainder.
      const visible = cap - 1;
      const headN = Math.ceil(visible / 2);
      const tailN = visible - headN;
      allTouches.slice(0, headN).forEach((t, i) =>
        nodes.push({ kind: 'touch', touch: t, index: i }),
      );
      nodes.push({ kind: 'collapsed', count: allTouches.length - headN - tailN });
      allTouches.slice(allTouches.length - tailN).forEach((t, i) =>
        nodes.push({
          kind: 'touch',
          touch: t,
          index: allTouches.length - tailN + i,
        }),
      );
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-ftraj-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-ftraj-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-ftraj-plate';

    const header = document.createElement('div');
    header.className = 'sb-ftraj-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-ftraj-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 04 / file-trajectory';

    const headRight = document.createElement('span');
    headRight.className = 'sb-ftraj-header-right';
    // The chip always states the TRUE total, and turns warn when the rail
    // is showing fewer than that, so the number can never be read as
    // "this is everything" when it isn't.
    const shownCount = nodes.filter((n) => n.kind === 'touch').length;
    const collapsedCount = allTouches.length - shownCount;
    const countChip = document.createElement('span');
    countChip.className =
      collapsedCount > 0
        ? 'cs-badge cs-badge--warn sb-ftraj-count'
        : 'cs-badge cs-badge--ink sb-ftraj-count';
    countChip.textContent =
      collapsedCount > 0
        ? `${shownCount} of ${allTouches.length} touches`
        : `${allTouches.length} ${allTouches.length === 1 ? 'touch' : 'touches'}`;
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-ftraj-tag';
    sceneTag.textContent = c.sceneTag ?? 'TRAJECTORY';
    headRight.append(countChip, sceneTag);
    header.append(eyebrow, headRight);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-ftraj-body';

    // Path row — dim the directories, full contrast on the basename, so a
    // deep path still resolves at a glance.
    const { dir, base } = splitPath(path);
    const pathRow = document.createElement('div');
    pathRow.className = 'sb-ftraj-path';
    if (dir) {
      const dirEl = document.createElement('span');
      dirEl.className = 'sb-ftraj-path-dir';
      dirEl.textContent = dir;
      pathRow.appendChild(dirEl);
    }
    const baseEl = document.createElement('span');
    baseEl.className = 'sb-ftraj-path-base';
    baseEl.textContent = base || path || '—';
    pathRow.appendChild(baseEl);
    body.appendChild(pathRow);

    // Rail header — labels the date column once, as "analyzed", so no row
    // has to carry the proxy caveat itself.
    const railHead = document.createElement('div');
    railHead.className = 'sb-ftraj-rail-head';
    const railHeadPr = document.createElement('span');
    railHeadPr.textContent = 'PR';
    const railHeadAt = document.createElement('span');
    railHeadAt.textContent = 'analyzed';
    const railHeadWhat = document.createElement('span');
    railHeadWhat.textContent = 'what changed';
    railHead.append(railHeadPr, railHeadAt, railHeadWhat);
    body.appendChild(railHead);

    const scroll = document.createElement('div');
    scroll.className = 'sb-ftraj-scroll';

    const spine = document.createElement('ol');
    spine.className = 'sb-ftraj-spine';

    type NodeEntry = { el: HTMLElement; prKey: string; index: number };
    const nodeEls: NodeEntry[] = [];
    const revealables: HTMLElement[] = [];

    for (const node of nodes) {
      if (node.kind === 'collapsed') {
        const li = document.createElement('li');
        li.className = 'sb-ftraj-node sb-ftraj-node--collapsed';
        const marker = document.createElement('span');
        marker.className = 'sb-ftraj-collapsed-mark';
        marker.textContent = '⋮';
        const text = document.createElement('span');
        text.className = 'sb-ftraj-collapsed-text';
        text.textContent = `${node.count} ${node.count === 1 ? 'touch' : 'touches'} not shown`;
        li.append(marker, text);
        spine.appendChild(li);
        revealables.push(li);
        continue;
      }

      const t = node.touch;
      const li = document.createElement('li');
      li.className = 'sb-ftraj-node';
      li.dataset.prKey = prKey(t.prNumber);
      li.dataset.index = String(node.index);

      const ref = document.createElement('span');
      ref.className = 'sb-ftraj-node-ref';
      ref.textContent = normalizePr(t.prNumber);

      const at = document.createElement('span');
      at.className = 'sb-ftraj-node-at';
      at.textContent = fmtShortDate(t.at) ?? '';

      const main = document.createElement('span');
      main.className = 'sb-ftraj-node-main';
      const desc = document.createElement('span');
      desc.className = 'sb-ftraj-node-desc';
      desc.textContent = t.description;
      main.appendChild(desc);
      const lr = String(t.lineRange ?? '').trim();
      if (lr) {
        const lrEl = document.createElement('span');
        lrEl.className = 'sb-ftraj-node-lines';
        lrEl.textContent = lr;
        main.appendChild(lrEl);
      }

      li.append(ref, at, main);
      spine.appendChild(li);
      revealables.push(li);
      nodeEls.push({ el: li, prKey: prKey(t.prNumber), index: node.index });
    }

    scroll.appendChild(spine);
    body.appendChild(scroll);

    // Co-change rail — optional.
    let coEl: HTMLElement | null = null;
    if (coChange.length) {
      coEl = document.createElement('div');
      coEl.className = 'sb-ftraj-cochange';
      const coLabel = document.createElement('span');
      coLabel.className = 'sb-ftraj-cochange-label';
      coLabel.textContent = 'Moved alongside';
      coEl.appendChild(coLabel);
      const coList = document.createElement('span');
      coList.className = 'sb-ftraj-cochange-list';
      for (const cc of coChange.slice(0, 4)) {
        const chip = document.createElement('span');
        chip.className = 'sb-ftraj-cochange-chip';
        const p = document.createElement('span');
        p.className = 'sb-ftraj-cochange-path';
        p.textContent = splitPath(cc.path).base || cc.path;
        p.title = cc.path;
        const n = document.createElement('span');
        n.className = 'sb-ftraj-cochange-n';
        n.textContent = `×${cc.sharedPrs}`;
        chip.append(p, n);
        coList.appendChild(chip);
      }
      coEl.appendChild(coList);
      body.appendChild(coEl);
    }

    // Rename caveat — the corpus does not track renames, so a trajectory
    // can be silently truncated. Stated rather than left implicit.
    let caveatEl: HTMLElement | null = null;
    const caveat = String(c.renameCaveat ?? '').trim();
    if (caveat) {
      caveatEl = document.createElement('div');
      caveatEl.className = 'sb-ftraj-caveat';
      const cl = document.createElement('span');
      cl.className = 'sb-ftraj-caveat-label';
      cl.textContent = 'Caveat';
      const ct = document.createElement('span');
      ct.className = 'sb-ftraj-caveat-text';
      ct.textContent = caveat;
      caveatEl.append(cl, ct);
      body.appendChild(caveatEl);
    }

    plate.appendChild(body);
    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal — header, path, rail head, then nodes down the spine.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => pathRow.classList.add('sb-visible'), 250));
    timers.push(window.setTimeout(() => railHead.classList.add('sb-visible'), 360));

    const perNode = Math.max(40, Math.floor(stagger / Math.max(1, revealables.length)));
    revealables.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 460 + i * perNode),
      );
    });

    const tailAt = 460 + revealables.length * perNode + 120;
    if (coEl) {
      timers.push(window.setTimeout(() => coEl!.classList.add('sb-visible'), tailAt));
    }
    if (caveatEl) {
      timers.push(
        window.setTimeout(
          () => caveatEl!.classList.add('sb-visible'),
          tailAt + (coEl ? 140 : 0),
        ),
      );
    }

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

        if (raw === 'path') {
          light([pathRow]);
          return;
        }
        if (raw === 'cochange') {
          light([coEl]);
          return;
        }
        // "touch:26" and "pr:26" are the same request; accept both rather
        // than making the producer remember which template wants which.
        const stripped = raw.startsWith('touch:')
          ? raw.slice(6)
          : raw.startsWith('pr:')
            ? raw.slice(3)
            : raw;
        const key = prKey(stripped);
        const byPr = nodeEls.filter((n) => n.prKey === key);
        if (byPr.length) {
          light(byPr.map((n) => n.el));
          return;
        }
        const idx = Number(stripped);
        if (Number.isInteger(idx)) {
          light([nodeEls.find((n) => n.index === idx)?.el]);
        }
      },
    };
  },
};

import type { Template, TemplateHandle } from './registry';

/**
 * pr-objectives — frames what a PR is trying to do, early. Three visually
 * distinct tiers (primary > secondary > constraints) so a reviewer reads
 * "what this is for" before any code shows up. Later scenes call back to
 * specific objectives and tick them off as the diff proves them.
 *
 * Layout:
 *   Header strip:  eyebrow + scene tag.
 *   Title row:     italic display headline (default "What this PR is doing").
 *   Primary tier:  1–2 rows, large italic-serif statement + warm dot.
 *   Secondary tier: 0–4 rows, medium mono statement + cool dot.
 *   Constraints:   0–3 rows, smaller dim text with leading "WON'T" badge —
 *                  framed as boundaries, not actions. Constraint rows do
 *                  not get a check state (they are never "proven"; they are
 *                  asserted up front).
 *
 * The runtime contract piggybacks on the emphasize() port using a target
 * prefix convention, since the BeatAction union does not yet carry verbs
 * for "check" or "reveal". The producer expresses intent as:
 *
 *     { type: "emphasize", target: "obj-1"        }  → pulse only
 *     { type: "emphasize", target: "reveal:obj-1" }  → make visible (idempotent)
 *     { type: "emphasize", target: "check:obj-1"  }  → mark complete (sticky)
 *     { type: "emphasize", target: "uncheck:obj-1"}  → escape hatch, rarely used
 *
 * On mount the rows auto-stagger in (staggerMs, default 400ms between
 * tiers). The reveal prefix is therefore mostly a no-op in the common
 * case — it exists so a script can hold a row dark and pop it in on a
 * beat if that ever feels right.
 *
 * Each Objective is { id: string, statement: string }. id is producer-
 * chosen and stable across scenes — that is how later scenes refer back.
 *
 * Fill mode: full-bleed. Surface chrome (background, border, radius,
 * shadow) comes from .cs-plate; this block owns layout, sizing, reveal
 * transitions, and the check-state styling.
 */

interface PrObjective {
  id: string;
  statement: string;
}

interface PrObjectivesContent {
  title?: string;
  primary: PrObjective[];
  secondary?: PrObjective[];
  constraints?: PrObjective[];
  staggerMs?: number;
  // Optional chrome overrides (mirror title-card / pr-title-card).
  eyebrow?: string;
  sceneTag?: string;
}

type RowEntry = {
  id: string;
  el: HTMLElement;
  tier: 'primary' | 'secondary' | 'constraint';
  /** The element whose ::after / leading dot turns into a checkmark. */
  dot: HTMLElement;
};

const RESERVED_PREFIXES = ['check:', 'uncheck:', 'reveal:'] as const;

function parseTarget(target: string): {
  verb: 'check' | 'uncheck' | 'reveal' | 'pulse';
  id: string;
} {
  for (const prefix of RESERVED_PREFIXES) {
    if (target.startsWith(prefix)) {
      const verb = prefix.slice(0, -1) as 'check' | 'uncheck' | 'reveal';
      return { verb, id: target.slice(prefix.length) };
    }
  }
  return { verb: 'pulse', id: target };
}

export const prObjectivesTemplate: Template = {
  id: 'pr-objectives',
  version: '1.0.0',
  description:
    'Frames what a PR is trying to do as three visually distinct tiers: ' +
    '1–2 primary (largest), 0–4 secondary (medium), 0–3 constraints ' +
    "(smaller, dim, 'WON'T' framing). Rows auto-stagger in; later scenes " +
    'tick them off via emphasize("check:<id>").',
  slots: {
    title: 'string — optional headline (default "What this PR is doing")',
    primary: '{ id, statement }[] — 1–2, rendered largest',
    secondary: '{ id, statement }[] — 0–4, rendered medium',
    constraints: '{ id, statement }[] — 0–3, smaller / muted "WON\'T" framing',
    staggerMs: 'number — between-tier reveal delay (default 400)',
  },
  demo: {
    label: 'PR Objectives',
    content: {
      title: 'What this PR is doing',
      primary: [
        { id: 'obj-1', statement: 'Close the symlink escape gap' },
      ],
      secondary: [
        { id: 'obj-2', statement: 'Make path validation testable in isolation' },
        { id: 'obj-3', statement: 'Tighten upload error messages' },
      ],
      constraints: [
        { id: 'obj-4', statement: 'Preserve the public upload API' },
        { id: 'obj-5', statement: 'No database migrations' },
      ],
      staggerMs: 400,
    },
    emphasizeAfter: { target: 'check:obj-2', delayMs: 2600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as PrObjectivesContent;

    const title = c.title?.trim() || 'What this PR is doing';
    const primary = (c.primary ?? []).slice(0, 2);
    const secondary = (c.secondary ?? []).slice(0, 4);
    const constraints = (c.constraints ?? []).slice(0, 3);
    const stagger = Math.max(120, c.staggerMs ?? 400);

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-probj-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-probj-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-probj-plate';

    // Header strip.
    const header = document.createElement('div');
    header.className = 'sb-probj-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-probj-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 01 / pr-objectives';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-probj-tag';
    sceneTag.textContent = c.sceneTag ?? 'OBJ';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    // Body.
    const body = document.createElement('div');
    body.className = 'sb-probj-body';

    const titleEl = document.createElement('h1');
    titleEl.className = 'sb-probj-title';
    titleEl.textContent = title;
    body.appendChild(titleEl);

    const rows: RowEntry[] = [];
    const rowById = new Map<string, RowEntry>();

    const tiers: Array<{
      kind: 'primary' | 'secondary' | 'constraint';
      items: PrObjective[];
      label: string;
    }> = [
      { kind: 'primary', items: primary, label: 'Primary' },
      { kind: 'secondary', items: secondary, label: 'Also doing' },
      { kind: 'constraint', items: constraints, label: "Won't" },
    ];

    for (const tier of tiers) {
      if (!tier.items.length) continue;

      const group = document.createElement('div');
      group.className = `sb-probj-tier sb-probj-tier--${tier.kind}`;

      const tierLabel = document.createElement('span');
      tierLabel.className = 'sb-probj-tier-label';
      tierLabel.textContent = tier.label;
      group.appendChild(tierLabel);

      const list = document.createElement('ol');
      list.className = 'sb-probj-list';

      for (const obj of tier.items) {
        const row = document.createElement('li');
        row.className = `sb-probj-row sb-probj-row--${tier.kind}`;
        row.dataset.objId = obj.id;

        const dot = document.createElement('span');
        dot.className = 'sb-probj-dot';
        // Constraints get a "WON'T" mini-badge in place of the dot so the
        // row reads as a boundary, not an action item.
        if (tier.kind === 'constraint') {
          dot.classList.add('sb-probj-dot--wont');
          dot.textContent = "WON'T";
        }

        const text = document.createElement('span');
        text.className = 'sb-probj-text';
        text.textContent = obj.statement;

        row.append(dot, text);
        list.appendChild(row);

        const entry: RowEntry = { id: obj.id, el: row, tier: tier.kind, dot };
        rows.push(entry);
        rowById.set(obj.id, entry);
      }

      group.appendChild(list);
      body.appendChild(group);
    }

    plate.appendChild(body);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade — header + title up front, then each row in order
    // with a delay proportional to stagger. We bucket per-row delay at
    // stagger/N so a long list still finishes before the producer is
    // likely to fire its first emphasize beat.
    const timers: number[] = [];
    timers.push(window.setTimeout(() => header.classList.add('sb-visible'), 120));
    timers.push(window.setTimeout(() => titleEl.classList.add('sb-visible'), 260));

    const perRowDelay = Math.max(80, Math.floor(stagger / Math.max(1, rows.length)));
    rows.forEach((row, i) => {
      timers.push(
        window.setTimeout(
          () => row.el.classList.add('sb-visible'),
          400 + i * perRowDelay,
        ),
      );
    });

    // Emphasize port — handles plain pulse, reveal (idempotent), and the
    // sticky check / uncheck states. Pulse honors the accent budget by
    // clearing any other pulsing row first; check state is independent
    // (multiple rows can be checked at once — that is the whole point).
    const pulseTimers = new Map<HTMLElement, number>();
    let activePulse: HTMLElement | null = null;

    const clearPulse = () => {
      if (!activePulse) return;
      activePulse.classList.remove('sb-emphasize');
      const t = pulseTimers.get(activePulse);
      if (t != null) {
        window.clearTimeout(t);
        pulseTimers.delete(activePulse);
      }
      activePulse = null;
    };

    return {
      dismiss: () => {
        clearPulse();
        for (const t of timers) window.clearTimeout(t);
        pulseTimers.forEach((t) => window.clearTimeout(t));
        pulseTimers.clear();
        wrapper.remove();
      },
      emphasize: (target: string) => {
        const { verb, id } = parseTarget(target);
        const row = rowById.get(id);
        if (!row) return;

        switch (verb) {
          case 'reveal':
            // Make sure the row is visible (idempotent — the auto-stagger
            // will usually have done this already).
            row.el.classList.add('sb-visible');
            break;
          case 'check':
            // Constraints are never checked — they are asserted, not
            // proven. Silently ignore so a misrouted beat doesn't render
            // a confusing checkmark on a "WON'T" row.
            if (row.tier === 'constraint') return;
            row.el.classList.add('sb-checked');
            break;
          case 'uncheck':
            row.el.classList.remove('sb-checked');
            break;
          case 'pulse':
            clearPulse();
            row.el.classList.add('sb-emphasize');
            activePulse = row.el;
            pulseTimers.set(
              row.el,
              window.setTimeout(() => {
                row.el.classList.remove('sb-emphasize');
                pulseTimers.delete(row.el);
                if (activePulse === row.el) activePulse = null;
              }, 1400),
            );
            break;
        }
      },
    };
  },
};

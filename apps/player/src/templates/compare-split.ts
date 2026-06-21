import type { Template, TemplateHandle } from './registry';
import { PALETTE_DEFAULTS, resolveColor } from './palette';

/**
 * compare-split — side-by-side comparison of two parallel options.
 *
 * Use for: mode/approach contrasts, analogy panels ("like X vs Y"),
 * tradeoff displays, before/after. Unlike transform-grid (which implies
 * a sequential pipeline), compare-split shows two things that exist in
 * parallel — the divider communicates relationship, not flow.
 *
 * lenzon/ui v0.1 styling: each panel is its own .cs-plate. Baseline
 * eyebrow tones are split (left = cool, right = warm) per the migration
 * doc — the warm eyebrow acts as the steady-state accent budget holder;
 * emphasis layers a transient ring on the targeted panel.
 *
 * `panel.accent` still resolves through PALETTE_DEFAULTS / resolveColor
 * so Producer-emitted `palette.primary` / `palette.secondary` slots keep
 * working — it drives the colored top-rule on each plate.
 *
 * Slot schema:
 *   title:    string — optional headline above the split
 *   left:     Panel  — left-hand option
 *   right:    Panel  — right-hand option
 *   divider:  "vs" | "or" | "→" | "none"  (default "vs")
 *   staggerMs: number — delay between left/right/divider reveals (default 400)
 *
 * Panel:
 *   heading: string
 *   icon?:   string — short label shown above heading (eyebrow-styled)
 *   bullets: string[]
 *   accent?: string — CSS color or "palette.primary|secondary|accent"
 */

interface PanelSpec {
  heading: string;
  icon?: string;
  bullets?: string[];
  accent?: string;
}

interface CompareSplitContent {
  title?: string;
  left: PanelSpec;
  right: PanelSpec;
  divider?: 'vs' | 'or' | '→' | 'none';
  staggerMs?: number;
}

export const compareSplitTemplate: Template = {
  id: 'compare-split',
  version: '1.0.0',
  description:
    'Side-by-side comparison of two parallel options inside glass plates with a divider. For mode contrasts, analogies, tradeoffs, before/after.',
  slots: {
    title: 'string — optional headline above the comparison',
    left: '{ heading, icon?, bullets?, accent? } — left panel',
    right: '{ heading, icon?, bullets?, accent? } — right panel',
    divider: '"vs" | "or" | "→" | "none" (default "vs")',
    staggerMs: 'number — delay between reveals (default 400)',
  },
  demo: {
    label: 'Compare Split',
    content: {
      title: 'Two Ways to Use It',
      left: {
        heading: 'Tag Mode',
        icon: 'Interactive',
        bullets: [
          'Invoked with @claude in comments',
          'Full PR context at its disposal',
          'Can push commits back to the branch',
        ],
        accent: 'palette.primary',
      },
      right: {
        heading: 'Agent Mode',
        icon: 'Automated',
        bullets: [
          'Driven by a custom prompt',
          'Runs on a schedule or trigger',
          'Produces structured output',
        ],
        accent: 'palette.secondary',
      },
      divider: 'vs',
      staggerMs: 400,
    },
    emphasizeAfter: { target: 'right', delayMs: 2200 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as CompareSplitContent;
    const {
      title,
      left,
      right,
      divider = 'vs',
      staggerMs = 400,
    } = content;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-compare-wrapper';

    if (title) {
      const h = document.createElement('div');
      h.className = 'cs-title cs-title--m sb-compare-title';
      h.textContent = title;
      wrapper.appendChild(h);
    }

    const row = document.createElement('div');
    row.className = 'sb-compare-row';
    if (divider === 'none') row.classList.add('sb-compare-row-nodivider');
    wrapper.appendChild(row);

    const leftEl = buildPanel(left, 'left', PALETTE_DEFAULTS['palette.primary']);
    const dividerEl =
      divider === 'none' ? null : buildDivider(divider);
    const rightEl = buildPanel(right, 'right', PALETTE_DEFAULTS['palette.secondary']);

    row.appendChild(leftEl);
    if (dividerEl) row.appendChild(dividerEl);
    row.appendChild(rightEl);

    presenter.domRoot.appendChild(wrapper);

    const timers: number[] = [];
    timers.push(window.setTimeout(() => leftEl.classList.add('sb-visible'), 200));
    timers.push(window.setTimeout(() => rightEl.classList.add('sb-visible'), 200));
    if (dividerEl) {
      timers.push(
        window.setTimeout(() => dividerEl.classList.add('sb-visible'), 200 + staggerMs),
      );
    }

    const emphTimers = new Map<HTMLElement, number>();
    const panels = [leftEl, rightEl];

    const handle: TemplateHandle = {
      dismiss: () => {
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        wrapper.remove();
      },
      emphasize: (target) => {
        const t = target?.toLowerCase();
        const match = t === 'left' ? leftEl : t === 'right' ? rightEl : null;
        if (!match) return;

        // Accent budget = 1: clear any other panel currently pulsing.
        panels.forEach((p) => {
          if (p !== match && p.classList.contains('sb-compare-active')) {
            p.classList.remove('sb-compare-active', 'sb-emphasize');
            const existing = emphTimers.get(p);
            if (existing != null) {
              window.clearTimeout(existing);
              emphTimers.delete(p);
            }
          }
        });

        match.classList.add('sb-compare-active', 'sb-emphasize');
        const prior = emphTimers.get(match);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          match,
          window.setTimeout(() => {
            match.classList.remove('sb-compare-active', 'sb-emphasize');
            emphTimers.delete(match);
          }, 1400),
        );
      },
    };
    return handle;
  },
};

function buildPanel(
  panel: PanelSpec,
  side: 'left' | 'right',
  fallbackAccent: string,
): HTMLElement {
  const card = document.createElement('div');
  card.className = `cs-plate cs-plate--default sb-compare-panel sb-compare-panel-${side}`;
  const accent = resolveColor(panel.accent, fallbackAccent);
  card.style.setProperty('--sb-compare-accent', accent);

  if (panel.icon) {
    const icon = document.createElement('div');
    icon.className = `cs-eyebrow cs-eyebrow--${side === 'left' ? 'cool' : 'warm'} sb-compare-icon`;
    icon.textContent = panel.icon;
    card.appendChild(icon);
  }

  const heading = document.createElement('div');
  heading.className = 'sb-compare-heading';
  heading.textContent = panel.heading;
  card.appendChild(heading);

  if (panel.bullets && panel.bullets.length > 0) {
    const list = document.createElement('ul');
    list.className = 'sb-compare-bullets';
    for (const b of panel.bullets) {
      const li = document.createElement('li');
      li.textContent = b;
      list.appendChild(li);
    }
    card.appendChild(list);
  }

  return card;
}

function buildDivider(kind: 'vs' | 'or' | '→'): HTMLElement {
  const el = document.createElement('div');
  el.className = `sb-compare-divider sb-compare-divider-${kind === '→' ? 'arrow' : kind}`;
  el.textContent = kind;
  return el;
}

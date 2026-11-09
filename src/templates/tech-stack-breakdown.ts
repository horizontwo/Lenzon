import type { Template, TemplateHandle } from './registry';

/**
 * tech-stack-breakdown — full-bleed DOM template that breaks down a repo's
 * tech stack across up to six standard categories. Each category section is
 * OPTIONAL — the Director omits any that are not relevant to the repo being
 * analyzed. This keeps the slide focused and avoids empty "N/A" rows.
 *
 * Categories (all optional):
 *   Network   — HTTP clients, API gateways, proxies, CDN, load balancers
 *   Data      — databases, caches, queues, storage, ORMs
 *   Application — core frameworks, runtimes, languages, server logic
 *   Services  — third-party APIs, auth providers, payment, email, monitoring
 *   UI        — frontend frameworks, component libraries, CSS tooling, bundlers
 *   DevOps    — CI/CD, containerization, IaC, deployment targets, observability
 *
 * Each category contains a list of tech items. Each item has a name and an
 * optional role string (one-line description of why it's used here).
 *
 * Fill mode: full-bleed
 * Layers:    DOM only
 * Width:     wide (900px)
 * Calm/kinetic: calm — stagger reveal, no continuous motion
 *
 * Slot schema:
 *   title?:      string                  — optional headline (defaults to "Tech Stack")
 *   sections:    TechSection[]           — ordered list of present sections (1–6)
 *
 * emphasize(target):
 *   target is either:
 *     - a category id string: "network" | "data" | "application" | "services" | "ui" | "devops"
 *       → pulses the section header
 *     - "N:M" where N is section index (0-based) and M is item index (0-based)
 *       → pulses that specific item chip
 */

export type TechCategory =
  | 'network'
  | 'data'
  | 'application'
  | 'services'
  | 'ui'
  | 'devops';

export interface TechItem {
  /** Technology name, e.g. "PostgreSQL", "React", "Nginx". */
  name: string;
  /** Optional one-line role, e.g. "primary data store", "API gateway". */
  role?: string;
}

export interface TechSection {
  /** Which standard category this is. */
  category: TechCategory;
  /** Tech items in this category. */
  items: TechItem[];
}

interface TechStackContent {
  title?: string;
  sections: TechSection[];
}

const CATEGORY_META: Record<
  TechCategory,
  { label: string; colorVar: string; iconText: string }
> = {
  network:     { label: 'Network',      colorVar: '--cs-accent-cool',  iconText: '⬡' },
  data:        { label: 'Data',         colorVar: '--cs-accent-ok',    iconText: '◈' },
  application: { label: 'Application',  colorVar: '--cs-accent-cool',  iconText: '◆' },
  services:    { label: 'Services',     colorVar: '--cs-accent-warn',  iconText: '◉' },
  ui:          { label: 'UI',           colorVar: '--cs-accent-ok',    iconText: '◇' },
  devops:      { label: 'DevOps',       colorVar: '--cs-accent-warn',  iconText: '⬡' },
};

// Category order — sections are sorted by this when rendered so the
// layout is always: Application → UI → Data → Network → Services → DevOps,
// regardless of the order the Director sends them in.
const CATEGORY_ORDER: TechCategory[] = [
  'application',
  'ui',
  'data',
  'network',
  'services',
  'devops',
];

export const techStackBreakdownTemplate: Template = {
  id: 'tech-stack-breakdown',
  version: '1.0.0',
  description:
    'Full-bleed grid breaking the repo tech stack into optional standard categories: Network, Data, Application, Services, UI, DevOps. Sections not included by the Director are omitted.',
  slots: {
    title:    'string — optional headline (defaults to "Tech Stack")',
    sections: 'TechSection[] — { category: network|data|application|services|ui|devops, items: { name, role? }[] }[]',
  },
  demo: {
    label: 'Tech Stack Breakdown',
    content: {
      title: 'Tech Stack',
      sections: [
        {
          category: 'application',
          items: [
            { name: 'Node.js', role: 'server runtime' },
            { name: 'TypeScript', role: 'primary language' },
            { name: 'Express', role: 'HTTP framework' },
          ],
        },
        {
          category: 'ui',
          items: [
            { name: 'React', role: 'component model' },
            { name: 'Vite', role: 'build tool' },
            { name: 'Tailwind CSS', role: 'utility styles' },
          ],
        },
        {
          category: 'data',
          items: [
            { name: 'PostgreSQL', role: 'primary data store' },
            { name: 'Prisma', role: 'ORM' },
            { name: 'Redis', role: 'session cache' },
          ],
        },
        {
          category: 'devops',
          items: [
            { name: 'GitHub Actions', role: 'CI/CD' },
            { name: 'Docker', role: 'containerization' },
          ],
        },
      ],
    },
    emphasizeAfter: { target: 'data', delayMs: 2800 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as TechStackContent;
    const rawSections = c.sections ?? [];
    const title = c.title ?? 'Tech Stack';

    // Sort sections into the canonical category order, filtering out any
    // unknown categories defensively.
    const sections = CATEGORY_ORDER
      .map((cat) => rawSections.find((s) => s.category === cat))
      .filter((s): s is TechSection => s != null && s.items.length > 0);

    const timers: number[] = [];
    let dismissed = false;

    // ── Wrapper ────────────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'sb-techstack-wrapper';

    // ── Title ──────────────────────────────────────────────────────────────
    const titleEl = document.createElement('h2');
    titleEl.className = 'cs-title cs-title--m sb-techstack-title';
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);

    // ── Section grid ───────────────────────────────────────────────────────
    const grid = document.createElement('div');
    // Choose column count based on how many sections are present.
    const colClass =
      sections.length <= 2 ? 'sb-techstack-grid--cols-2' :
      sections.length <= 4 ? 'sb-techstack-grid--cols-2' :
                             'sb-techstack-grid--cols-3';
    grid.className = `sb-techstack-grid ${colClass}`;

    // Track section header elements by category for emphasize().
    const sectionEls = new Map<TechCategory, HTMLElement>();
    // Track item chip elements as [sectionIdx][itemIdx].
    const itemEls: HTMLElement[][] = [];

    let globalRevealIdx = 0; // stagger index across all elements

    sections.forEach((section, si) => {
      const meta = CATEGORY_META[section.category] ?? {
        label: section.category,
        colorVar: '--cs-accent-cool',
        iconText: '◆',
      };

      const card = document.createElement('div');
      card.className = 'cs-plate cs-plate--default sb-techstack-card';

      // Section header
      const header = document.createElement('div');
      header.className = 'sb-techstack-section-header';
      header.style.setProperty('--sb-techstack-accent', `var(${meta.colorVar})`);

      const icon = document.createElement('span');
      icon.className = 'sb-techstack-section-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = meta.iconText;

      const label = document.createElement('span');
      label.className = 'sb-techstack-section-label';
      label.textContent = meta.label;

      header.appendChild(icon);
      header.appendChild(label);
      card.appendChild(header);
      sectionEls.set(section.category, header);

      // Items
      const chipList = document.createElement('div');
      chipList.className = 'sb-techstack-chips';

      const sectionItemEls: HTMLElement[] = [];

      section.items.forEach((item, ii) => {
        const chip = document.createElement('div');
        chip.className = 'sb-techstack-chip';
        chip.style.setProperty('--sb-techstack-accent', `var(${meta.colorVar})`);

        const name = document.createElement('span');
        name.className = 'sb-techstack-chip-name';
        name.textContent = item.name;
        chip.appendChild(name);

        if (item.role) {
          const role = document.createElement('span');
          role.className = 'sb-techstack-chip-role';
          role.textContent = item.role;
          chip.appendChild(role);
        }

        chipList.appendChild(chip);
        sectionItemEls.push(chip);

        // Stagger reveal — cards first, then chips within each card
        const delay = 200 + globalRevealIdx * 80;
        globalRevealIdx++;
        timers.push(
          window.setTimeout(() => {
            if (!dismissed) chip.classList.add('sb-visible');
          }, delay),
        );
        void ii; // used via closure above
      });

      itemEls.push(sectionItemEls);
      card.appendChild(chipList);

      // Reveal the card shell itself slightly before its chips
      const cardDelay = 150 + si * 60;
      timers.push(
        window.setTimeout(() => {
          if (!dismissed) card.classList.add('sb-visible');
        }, cardDelay),
      );

      grid.appendChild(card);
    });

    wrapper.appendChild(grid);
    presenter.domRoot.appendChild(wrapper);

    // ── Emphasize tracking ─────────────────────────────────────────────────
    const emphTimers = new Map<HTMLElement, number>();

    function pulseEl(el: HTMLElement) {
      // Clear any existing pulse on this element first.
      const prior = emphTimers.get(el);
      if (prior != null) window.clearTimeout(prior);

      el.classList.add('sb-emphasize');
      emphTimers.set(
        el,
        window.setTimeout(() => {
          el.classList.remove('sb-emphasize');
          emphTimers.delete(el);
        }, 1400),
      );
    }

    return {
      dismiss() {
        dismissed = true;
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        wrapper.remove();
      },

      emphasize(target: string) {
        // Format 1: category id string — pulses the section header.
        const catEl = sectionEls.get(target as TechCategory);
        if (catEl) {
          pulseEl(catEl);
          return;
        }

        // Format 2: "N:M" — pulses a specific item chip.
        const colonIdx = target.indexOf(':');
        if (colonIdx !== -1) {
          const si = parseInt(target.slice(0, colonIdx), 10);
          const ii = parseInt(target.slice(colonIdx + 1), 10);
          const chip = itemEls[si]?.[ii];
          if (chip) pulseEl(chip);
          return;
        }

        // Format 3: plain numeric string — treat as section index, pulse header.
        const si = parseInt(target, 10);
        if (!Number.isNaN(si)) {
          const cat = sections[si]?.category;
          if (cat) {
            const el = sectionEls.get(cat);
            if (el) pulseEl(el);
          }
        }
      },
    };
  },
};

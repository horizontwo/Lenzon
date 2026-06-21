import type { Template, TemplateHandle } from './registry';

/**
 * scorecard — a report-card grid of metrics with letter grades. An overall
 * grade displays large at the top; individual items show label, grade, a
 * severity bar, and a one-line note.
 *
 * lenzon/ui v0.1 styling: the overall grade is a .cs-grade primitive
 * (tier-mapped to --good / --mid / --poor, large size). Each row shows a
 * .cs-severity bar whose fill comes from --cs-severity-score (0–1),
 * tiered good / mid / poor. Cards sit inside .cs-plate glass. The
 * emphasize pulse still uses the warm accent for the focused card.
 *
 * Slot schema:
 *   title?:        string
 *   overallGrade:  string                    ("A" through "F", optionally with +/-)
 *   items:         ScoreItemSpec[]           (3–8 items)
 *
 * emphasize(target): target is the item index as a string ("0", "1", …).
 *   Pulses the card with a warm ring. Accent budget = 1 is enforced.
 */

interface ScoreItemSpec {
  /** What is being graded, e.g. "Testing", "Security". */
  label: string;
  /** Letter grade: A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F. */
  grade: string;
  /** One-line note explaining the grade. */
  note: string;
}

interface ScorecardContent {
  title?: string;
  overallGrade: string;
  items: ScoreItemSpec[];
}

/**
 * Reduce a letter grade to the three lenzon/ui severity tiers.
 * A/B → good (neutral-strong ink); C/D → mid (warm); F → poor (warn).
 * +/- modifiers don't change the tier.
 */
function gradeTier(grade: string): 'good' | 'mid' | 'poor' {
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === 'A' || letter === 'B') return 'good';
  if (letter === 'C' || letter === 'D') return 'mid';
  return 'poor';
}

/**
 * Map a letter grade (with optional +/-) to a 0–1 severity score the
 * .cs-severity bar can render. Rough but monotonic; the visual only
 * needs to distinguish tiers, not match a transcript calculator.
 */
function gradeScore(grade: string): number {
  const g = grade.trim().toUpperCase();
  const base: Record<string, number> = { A: 0.95, B: 0.80, C: 0.60, D: 0.40, F: 0.15 };
  const letter = g.charAt(0);
  let score = base[letter] ?? 0.5;
  if (g.includes('+')) score += 0.04;
  if (g.includes('-')) score -= 0.04;
  return Math.max(0, Math.min(1, score));
}

export const scorecardTemplate: Template = {
  id: 'scorecard',
  version: '1.0.0',
  description:
    'Report card grid with a large overall letter grade and per-metric severity bars inside glass plates.',
  slots: {
    title: 'string — optional headline',
    overallGrade: 'string — overall letter grade (A through F)',
    items: '{ label, grade, note }[] — individual scored metrics (3–8)',
  },
  demo: {
    label: 'Scorecard',
    content: {
      title: 'Codebase report card',
      overallGrade: 'C+',
      items: [
        { label: 'Architecture', grade: 'B+', note: 'Clean layering, clear seams.' },
        { label: 'Testing', grade: 'F', note: 'No tests at all.' },
        { label: 'Security', grade: 'C-', note: 'JWTs are not signature-verified.' },
        { label: 'Docs', grade: 'B', note: 'README + inline is solid.' },
        { label: 'Performance', grade: 'A-', note: 'Async, cached, indexed.' },
        { label: 'Dependencies', grade: 'C', note: '2 majors behind latest.' },
      ],
    },
    emphasizeAfter: { target: '1', delayMs: 2400 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as ScorecardContent;
    const items = c.items ?? [];

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-scorecard-wrapper';

    if (c.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'cs-title cs-title--m sb-scorecard-title';
      titleEl.textContent = c.title;
      wrapper.appendChild(titleEl);
    }

    // Overall grade — the big .cs-grade primitive, tier-mapped.
    const overallTier = gradeTier(c.overallGrade);
    const badge = document.createElement('div');
    badge.className = `cs-grade cs-grade--l cs-grade--${overallTier} sb-scorecard-badge`;
    badge.textContent = c.overallGrade;
    wrapper.appendChild(badge);

    requestAnimationFrame(() => badge.classList.add('sb-visible'));

    const grid = document.createElement('div');
    grid.className =
      items.length <= 4 ? 'sb-scorecard-grid sb-cols-2' : 'sb-scorecard-grid';

    const cardEls: HTMLElement[] = [];
    const timers: number[] = [];

    items.forEach((item, i) => {
      const tier = gradeTier(item.grade);
      const score = gradeScore(item.grade);

      const card = document.createElement('div');
      card.className = `cs-plate cs-plate--default sb-scorecard-card sb-scorecard-card--${tier}`;

      const headerRow = document.createElement('div');
      headerRow.className = 'sb-scorecard-header';

      const gradeEl = document.createElement('span');
      gradeEl.className = `cs-grade cs-grade--m cs-grade--${tier} sb-scorecard-grade`;
      gradeEl.textContent = item.grade;

      const labelEl = document.createElement('span');
      labelEl.className = 'sb-scorecard-label';
      labelEl.textContent = item.label;

      headerRow.appendChild(gradeEl);
      headerRow.appendChild(labelEl);
      card.appendChild(headerRow);

      const bar = document.createElement('span');
      bar.className = `cs-severity cs-severity--${tier} sb-scorecard-bar`;
      bar.style.setProperty('--cs-severity-score', String(score));
      card.appendChild(bar);

      const noteEl = document.createElement('div');
      noteEl.className = 'sb-scorecard-note';
      noteEl.textContent = item.note;
      card.appendChild(noteEl);

      cardEls.push(card);
      grid.appendChild(card);

      timers.push(
        window.setTimeout(() => card.classList.add('sb-visible'), 300 + i * 150),
      );
    });

    wrapper.appendChild(grid);
    presenter.domRoot.appendChild(wrapper);

    const emphTimers = new Map<HTMLElement, number>();

    return {
      dismiss() {
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        wrapper.remove();
      },
      emphasize(target: string) {
        const idx = parseInt(target, 10);
        if (Number.isNaN(idx) || !cardEls[idx]) return;
        const card = cardEls[idx];

        // Accent budget = 1: clear any other card currently pulsing.
        cardEls.forEach((other) => {
          if (other !== card && other.classList.contains('sb-emphasize')) {
            other.classList.remove('sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        card.classList.add('sb-emphasize');
        const prior = emphTimers.get(card);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          card,
          window.setTimeout(() => {
            card.classList.remove('sb-emphasize');
            emphTimers.delete(card);
          }, 1400),
        );
      },
    };
  },
};

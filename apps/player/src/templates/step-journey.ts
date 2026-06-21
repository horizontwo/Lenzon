import type { Template, TemplateHandle } from './registry';

/**
 * step-journey — a horizontal progress walkthrough showing a user journey
 * as numbered steps connected by a progress line. Each step lights up in
 * sequence (via stagger or beat-driven emphasize). Think subway map meets
 * wizard stepper.
 *
 * lenzon/ui v0.1 styling: the step circle carries a .cs-numlist-n
 * mono digit (01, 02, …). The connector line + active border use
 * --cs-accent-cool (the neutral "pointer" accent). The emphasize pulse
 * uses --cs-accent-warm (the one warm thing). Labels render in the UI
 * face; details in dim ink.
 *
 * Slot schema:
 *   title?:       string
 *   steps:        StepSpec[]           (recommended 3–7)
 *   activeColor?: string               (CSS color or `var(--cs-*)` — default cool accent)
 *   staggerMs?:   number               (delay between step reveals, default 1000)
 *
 * emphasize(target): target is the step index as a string ("0", "1", …).
 *   Lights up that step (and the connector leading into it).
 *   If steps were already stagger-revealed, emphasize adds a warm pulse.
 */

interface StepSpec {
  /** Short label below the step number (1–4 words). */
  label: string;
  /** Optional longer detail shown beneath the label. */
  detail?: string;
}

interface StepJourneyContent {
  title?: string;
  steps: StepSpec[];
  /** CSS color for the "active" state. Default: var(--cs-accent-cool). */
  activeColor?: string;
  /** Ms between each step lighting up. Default: 1000. */
  staggerMs?: number;
}

export const stepJourneyTemplate: Template = {
  id: 'step-journey',
  version: '1.0.0',
  description:
    'Horizontal step-by-step journey with numbered circles, labels, and a connecting progress line. Steps light up in sequence.',
  slots: {
    title: 'string — optional headline above the journey',
    steps: '{ label, detail? }[] — the journey steps (3–7 recommended)',
    activeColor: 'string — CSS color for lit-up steps (default var(--cs-accent-cool))',
    staggerMs: 'number — delay between step reveals (default 1000)',
  },
  demo: {
    label: 'Step Journey',
    content: {
      title: 'From sign-up to first value',
      steps: [
        { label: 'Land on site', detail: 'Hero + one CTA' },
        { label: 'Sign up', detail: 'Email + password' },
        { label: 'Verify email', detail: 'Click the link' },
        { label: 'Configure', detail: 'Pick a template' },
        { label: 'First win', detail: 'Presentation plays' },
      ],
      staggerMs: 900,
    },
    emphasizeAfter: { target: '4', delayMs: 5200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as StepJourneyContent;
    const steps = c.steps ?? [];
    const staggerMs = c.staggerMs ?? 1000;
    const activeColor = c.activeColor ?? 'var(--cs-accent-cool)';

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-step-journey';
    wrapper.style.setProperty('--sb-step-active', activeColor);
    wrapper.style.setProperty('--sb-step-reveal-ms', `${Math.round(staggerMs * 0.5)}ms`);

    if (c.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'cs-title cs-title--m sb-step-journey-title';
      titleEl.textContent = c.title;
      wrapper.appendChild(titleEl);
    }

    const row = document.createElement('div');
    row.className = 'sb-step-journey-row';

    const stepEls: HTMLElement[] = [];
    const circleEls: HTMLElement[] = [];
    const connectorEls: HTMLElement[] = [];

    steps.forEach((step, i) => {
      if (i > 0) {
        const connector = document.createElement('div');
        connector.className = 'sb-step-journey-connector';
        connectorEls.push(connector);
        row.appendChild(connector);
      }

      const card = document.createElement('div');
      card.className = 'sb-step-journey-card';

      const circle = document.createElement('div');
      circle.className = 'sb-step-journey-circle';
      // Mono zero-padded digit — cs-numlist-n flavor.
      circle.textContent = String(i + 1).padStart(2, '0');
      card.appendChild(circle);

      const label = document.createElement('div');
      label.className = 'sb-step-journey-label';
      label.textContent = step.label;
      card.appendChild(label);

      if (step.detail) {
        const detail = document.createElement('div');
        detail.className = 'sb-step-journey-detail';
        detail.textContent = step.detail;
        card.appendChild(detail);
      }

      stepEls.push(card);
      circleEls.push(circle);
      row.appendChild(card);
    });

    wrapper.appendChild(row);
    presenter.domRoot.appendChild(wrapper);

    const timers: number[] = [];

    const revealStep = (index: number) => {
      const card = stepEls[index];
      if (!card) return;
      card.classList.add('sb-visible');
      if (index > 0 && connectorEls[index - 1]) {
        connectorEls[index - 1].classList.add('sb-visible');
      }
    };

    steps.forEach((_, i) => {
      timers.push(window.setTimeout(() => revealStep(i), i * staggerMs));
    });

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
        if (Number.isNaN(idx) || !circleEls[idx]) return;
        revealStep(idx);
        const circle = circleEls[idx];

        // Accent budget = 1: clear any other circle currently emph'd.
        circleEls.forEach((other) => {
          if (other !== circle && other.classList.contains('sb-emphasize')) {
            other.classList.remove('sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        circle.classList.add('sb-emphasize');
        const prior = emphTimers.get(circle);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          circle,
          window.setTimeout(() => {
            circle.classList.remove('sb-emphasize');
            emphTimers.delete(circle);
          }, 1400),
        );
      },
    };
  },
};

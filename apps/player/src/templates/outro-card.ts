import type { Template, TemplateHandle } from './registry';

/**
 * outro-card — the closing slide of a PR-explainer run. Bookends
 * pr-title-card: same plate, same brand mark, same footer language,
 * but the headline inverts — where pr-title-card anchors on a giant
 * mono PR#, outro-card anchors on a takeaway sentence and a colour-
 * coded OBSERVATION chip.
 *
 * The chip is observational, not prescriptive. The agent does not vote
 * on the PR — recommending "approve" / "request changes" is the human
 * reviewer's job. The script states what it saw and stops there. Three
 * buckets, severity-ordered:
 *
 *   minor-notes        → "Minor Notes"               (cool / blue)
 *   several-notes      → "Several Notes"             (warm / amber)
 *   security-concerns  → "Potential Security Issues" (warn / red-orange)
 *
 * The producer derives the bucket from the analyst's gotchas; the
 * analyst stays purely descriptive (see PR-lens-updates.md §Step 6).
 *
 * Visual hierarchy (top to bottom):
 *   1. Header strip — eyebrow (§ 99 / outro-card) + scene tag.
 *   2. Takeaway — italic display, large, what the script saw in plain
 *      language. Observational, not prescriptive.
 *   3. Observation chip — large badge, colour by bucket.
 *   4. Next steps (optional) — up to 3 small mono bullets. Also
 *      observational ("tests added under X", "see Y file") — NOT a
 *      to-do list for the reviewer.
 *   5. Footer — PR# / head sha / analyzed date (3 cols; author/reviewers
 *      were already established on the opener).
 *   6. Brand — bottom-centre, same mark as pr-title-card.
 *
 * Fill mode: full-bleed (owns the whole stage rectangle).
 * Width token: max 1280px with stage safe-area inset; plate is 16:9 like
 * pr-title-card, so the two render at identical aspect for the bookend.
 *
 * emphasize(target):
 *   "takeaway"    → pulse the takeaway sentence
 *   "observation" → pulse the observation chip
 *   "nextSteps"   → pulse the next-steps list
 *   "brand"       → pulse the brand mark (theatrical close)
 *
 * Backwards compatibility note: the original spec carried a four-tier
 * `recommendation` enum (approve / approve-with-comments / request-
 * changes / discuss) plus a persona-shaped `recommendationText`. Both
 * were retired in favour of the observation enum above. A producer
 * still emitting the old shape is mapped onto the new buckets and
 * silently rendered — see normalizeObservation() — so a stale script
 * still plays, but the chip text comes from the enum, not the producer.
 */

type ObservationKind = 'minor-notes' | 'several-notes' | 'security-concerns';

interface OutroCardContent {
  takeaway: string;
  /** Observation bucket. The chip text comes from the enum; the producer
   *  cannot override it (that was the recommendation phrasing problem). */
  observation: ObservationKind;
  prNumber: string;
  headSha: string;
  analysisDate?: string;
  brand?: string;
  nextSteps?: string[];
  // Optional chrome overrides (mirror pr-title-card).
  eyebrow?: string;
  sceneTag?: string;
  /** @deprecated retired with the recommendation chip; mapped silently. */
  recommendation?: string;
  /** @deprecated retired with the recommendation chip; ignored. */
  recommendationText?: string;
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

// Maps an observation bucket to (badge tone, fixed chip text). The text
// is fixed — the producer cannot override it. That is the whole point of
// the bucket model: no free-text override means no editorial drift back
// into "recommend approve" framing.
function observationMeta(kind: ObservationKind): {
  tone: 'cool' | 'warm' | 'warn';
  text: string;
} {
  switch (kind) {
    case 'minor-notes':
      return { tone: 'cool', text: 'Minor Notes' };
    case 'several-notes':
      return { tone: 'warm', text: 'Several Notes' };
    case 'security-concerns':
      return { tone: 'warn', text: 'Potential Security Issues' };
  }
}

/** Back-compat: a script still emitting the retired `recommendation`
 * enum (or no observation at all) is mapped onto the closest observation
 * bucket so a stale script still renders something coherent. Returns
 * 'minor-notes' as the conservative default. */
function normalizeObservation(c: OutroCardContent): ObservationKind {
  if (
    c.observation === 'minor-notes' ||
    c.observation === 'several-notes' ||
    c.observation === 'security-concerns'
  ) {
    return c.observation;
  }
  // Map retired recommendation enum values to the closest bucket.
  switch (c.recommendation) {
    case 'approve':
      return 'minor-notes';
    case 'approve-with-comments':
    case 'discuss':
      return 'several-notes';
    case 'request-changes':
      // Conservative: a script asking for changes implied something
      // worth flagging. Without more signal we default to several-notes
      // rather than upgrading to security; the producer should re-emit
      // a real observation enum next run.
      return 'several-notes';
    default:
      return 'minor-notes';
  }
}

export const outroCardTemplate: Template = {
  id: 'outro-card',
  version: '2.0.0',
  description:
    'Closing slide of a PR-explainer run. Bookends pr-title-card with the ' +
    'same glass plate, brand mark, and footer language. Anchored by an ' +
    'italic takeaway sentence and a colour-coded OBSERVATION chip ' +
    '(Minor Notes / Several Notes / Potential Security Issues). The chip ' +
    'is observational, not a merge recommendation — the agent does not ' +
    'vote on the PR. Optional next-step bullets and a PR# / sha / date ' +
    'footer fill out the card.',
  slots: {
    takeaway:
      'string — one-line, observational, plain language. What the script ' +
      'saw. Italic display. Avoid "approve" / "request changes" framing.',
    observation:
      'enum — "minor-notes" | "several-notes" | "security-concerns". ' +
      'Drives chip text + colour. Text is fixed per enum; no override.',
    prNumber: 'string — "#384" (with or without leading #)',
    headSha: 'string — short head sha',
    analysisDate: 'string — ISO date or pre-formatted display string',
    brand: 'string — bottom-centre wordmark (default "Lenzon")',
    nextSteps:
      'string[] — 0–3 short observational bullets. NOT a reviewer to-do.',
  },
  demo: {
    label: 'Outro Card',
    content: {
      takeaway:
        'A focused security fix that tightens path validation without ' +
        'changing the public upload API.',
      observation: 'security-concerns',
      prNumber: '#384',
      headSha: 'a3f29c1',
      analysisDate: '2026-05-25',
      brand: 'Lenzon',
      nextSteps: [
        'New realpath check lives at path-validator.ts:42',
        'Regression test added under test/upload/',
      ],
    },
    emphasizeAfter: { target: 'observation', delayMs: 2400 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as OutroCardContent;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-outro-wrapper';

    const stage = document.createElement('div');
    stage.className = 'sb-outro-stage';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-outro-plate';

    // Header strip.
    const header = document.createElement('div');
    header.className = 'sb-outro-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-outro-eyebrow';
    eyebrow.textContent = c.eyebrow ?? '§ 99 / outro-card';
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-outro-tag';
    sceneTag.textContent = c.sceneTag ?? 'PR-99';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    // Body — vertically centered: takeaway, recommendation chip, optional
    // next-steps list.
    const body = document.createElement('div');
    body.className = 'sb-outro-body';

    const takeawayEl = document.createElement('h1');
    takeawayEl.className = 'sb-outro-takeaway';
    takeawayEl.textContent = c.takeaway ?? '';
    body.appendChild(takeawayEl);

    const obsMeta = observationMeta(normalizeObservation(c));
    const obsEl = document.createElement('div');
    obsEl.className = `sb-outro-rec sb-outro-rec--${obsMeta.tone}`;
    const obsDot = document.createElement('span');
    obsDot.className = 'sb-outro-rec-dot';
    const obsText = document.createElement('span');
    obsText.className = 'sb-outro-rec-text';
    // Fixed text per bucket — the producer cannot override. That is the
    // whole point of the bucket model.
    obsText.textContent = obsMeta.text;
    obsEl.append(obsDot, obsText);
    body.appendChild(obsEl);

    let nextStepsEl: HTMLElement | null = null;
    const steps = (c.nextSteps ?? []).slice(0, 3).filter(Boolean);
    if (steps.length) {
      nextStepsEl = document.createElement('ul');
      nextStepsEl.className = 'sb-outro-next';
      for (const step of steps) {
        const li = document.createElement('li');
        li.className = 'sb-outro-next-item';
        const marker = document.createElement('span');
        marker.className = 'sb-outro-next-marker';
        marker.textContent = '→';
        const text = document.createElement('span');
        text.className = 'sb-outro-next-text';
        text.textContent = step;
        li.append(marker, text);
        nextStepsEl.appendChild(li);
      }
      body.appendChild(nextStepsEl);
    }

    plate.appendChild(body);

    // Footer — PR# / sha / date. Three blocks (no author/reviewers — those
    // were established on the opener).
    const meta = document.createElement('div');
    meta.className = 'sb-outro-meta';

    const prBlock = document.createElement('div');
    prBlock.className = 'sb-outro-meta-block';
    const prLabel = document.createElement('span');
    prLabel.className = 'sb-outro-meta-label';
    prLabel.textContent = 'PR';
    const prValue = document.createElement('span');
    prValue.className = 'sb-outro-meta-value';
    prValue.textContent = normalizeNumber(c.prNumber);
    prBlock.append(prLabel, prValue);
    meta.appendChild(prBlock);

    const shaBlock = document.createElement('div');
    shaBlock.className = 'sb-outro-meta-block';
    const shaLabel = document.createElement('span');
    shaLabel.className = 'sb-outro-meta-label';
    shaLabel.textContent = 'Head sha';
    const shaValue = document.createElement('span');
    shaValue.className = 'sb-outro-meta-value';
    shaValue.textContent = c.headSha ?? '—';
    shaBlock.append(shaLabel, shaValue);
    meta.appendChild(shaBlock);

    const dateBlock = document.createElement('div');
    dateBlock.className = 'sb-outro-meta-block sb-outro-meta-block--right';
    const dateLabel = document.createElement('span');
    dateLabel.className = 'sb-outro-meta-label';
    dateLabel.textContent = 'Analyzed';
    const dateValue = document.createElement('span');
    dateValue.className = 'sb-outro-meta-value';
    dateValue.textContent = fmtDate(c.analysisDate) ?? '—';
    dateBlock.append(dateLabel, dateValue);
    meta.appendChild(dateBlock);

    plate.appendChild(meta);

    // Brand mark — matches pr-title-card exactly so the bookend reads as
    // one family.
    const brand = document.createElement('div');
    brand.className = 'sb-outro-brand';
    const brandDot = document.createElement('span');
    brandDot.className = 'sb-outro-brand-dot';
    const brandText = document.createElement('span');
    brandText.textContent = c.brand ?? 'Lenzon';
    brand.append(brandDot, brandText);
    plate.appendChild(brand);

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Reveal cascade — same cadence as pr-title-card so the close feels
    // like the open, in reverse-emphasis order (takeaway lands before
    // the observation chip "punches in").
    const sections: HTMLElement[] = [header, takeawayEl, obsEl];
    if (nextStepsEl) sections.push(nextStepsEl);
    sections.push(meta, brand);

    const timers: number[] = [];
    sections.forEach((el, i) => {
      timers.push(
        window.setTimeout(
          () => el.classList.add('sb-visible'),
          200 + i * 180,
        ),
      );
    });

    const emphasizeMap: Record<string, HTMLElement | undefined> = {
      takeaway: takeawayEl,
      observation: obsEl,
      // back-compat alias for any beat still targeting the old key
      recommendation: obsEl,
      nextSteps: nextStepsEl ?? undefined,
      brand,
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

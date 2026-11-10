import type {
  RoadmapPost,
  RoadmapPostStatus,
  RoadmapRailContent,
} from './roadmap-rail.types';
import type { Template, TemplateHandle } from './registry';
import { communitySignalRail } from './roadmap-rail.demos';

/**
 * roadmap-rail — a roadmap drawn as one road, wider than the stage, that
 * each beat pans along. PLAN-EXPLAINER-TEMPLATES Phase 3.
 *
 * step-journey is the nearest template, and it compresses its steps to fit
 * the stage. That works for three to seven steps. A real roadmap has a
 * dozen or more posts across several tiers, and compressed that far the
 * sign posts stop being readable. So this template lays the road out at
 * its natural width and shows one stretch of it at a time.
 *
 * Layout:
 *   1. Header strip — eyebrow, and a chip with the post and stretch counts.
 *   2. Title        — the roadmap's name.
 *   3. Rail         — a viewport the width of the plate. Inside it, the road
 *                     with one sign post per post: a card above the road,
 *                     a node on it, and the stretch bands beneath it.
 *   4. Overview     — present only when the road is wider than the
 *                     viewport. A miniature of the whole road, a box for
 *                     the part on screen, and "posts 1–6 of 16".
 *
 * Tiers are stretches of one road, not parallel lanes. Both were drawn
 * against the community-signal demo (plan-explainer-concept open decision
 * 3), and Rick chose stretches on 2026-10-28. Lanes did one thing better:
 * all four tiers on one screen, so each tier's pattern showed at a glance.
 * They paid for it by shrinking every card to a label and a status, and a
 * six-post tier still ran off the stage. Stretches keep the detail line
 * and the one-post-at-a-time pace the narration walks in.
 *
 * Geometry is arithmetic, not measurement. Every post's x is a function of
 * its index and the fixed constants below, in layout px. The one value read
 * from the DOM is the viewport's clientWidth, which is layout px too
 * (TEMPLATE-SPEC §9d). So a pan lands in the same place at every embed
 * scale, and no getBoundingClientRect is involved.
 *
 * Honesty constraints built into the layout:
 *   - A post's status is drawn from the payload only. Null draws as
 *     "unknown", with its own mark. There is no default status, so a
 *     missing answer can never read as "not started".
 *   - The "you are here" marker is drawn only when `currentPost` is set.
 *     The template never infers a position from the statuses.
 *   - When the road is wider than the viewport, the overview always shows,
 *     so a viewer always knows how much road is off screen.
 *   - Posts render in payload order. Nothing is sorted by status.
 *
 * Scene state (TEMPLATE-SPEC §6.1): the pan is scene state. emphasize()
 * pans the viewport to its target and the pan HOLDS until the next beat or
 * dismiss(). The pulse on the post reverts after 1.4s, like every pulse.
 * The pan's end position depends on the target alone, never on where the
 * previous beat left it. A beat arriving mid-pan retargets the one CSS
 * transition, so nothing queues.
 *
 * Fill mode: full-bleed. Width: the road is unbounded; the viewport is the
 * plate. Calm: one eased pan per beat, then still. No continuous motion.
 *
 * Slot schema: RoadmapRailContent in ./roadmap-rail.types.
 *   title?:       string
 *   stretches:    { id, label }[]                  (road order)
 *   posts:        { label, stretch, status, detail?, date? }[]  (road order)
 *   currentPost?: number                            (index into posts)
 *
 * emphasize(target):
 *   "<index>" → pan so that post is centred (clamped at both ends of the
 *               road), and pulse it. Out-of-range targets do nothing.
 */

/** Width of one sign post's card, in layout px. */
const POST_W = 264;
/** Centre-to-centre distance between posts on the same stretch. */
const PITCH = 304;
/** Extra road between two stretches, so the bands read as separate. */
const STRETCH_GAP = 88;
/** Road before the first post and after the last. */
const EDGE = 96;

/** One eased pan per beat (TEMPLATE-SPEC §4: 600–900ms). */
const PAN_MS = 800;
const PULSE_MS = 1400;

const STATUS_WORD: Record<RoadmapPostStatus | 'unknown', string> = {
  landed: 'Landed',
  active: 'Active',
  parked: 'Parked',
  'not-started': 'Not started',
  unknown: 'Unknown',
};

const STATUS_MARK: Record<RoadmapPostStatus | 'unknown', string> = {
  landed: '✓',
  active: '●',
  parked: '‖',
  'not-started': '',
  unknown: '?',
};

interface PlacedPost {
  post: RoadmapPost;
  /** Centre of the post on the road, layout px from the road's left end. */
  x: number;
  /** Index of the run of same-stretch posts this one belongs to. */
  run: number;
}

interface StretchRun {
  stretchId: string;
  label: string;
  /** Band extent, layout px. */
  from: number;
  to: number;
  /** Which of the band tints to use. Cycles by stretch, not by run. */
  tint: number;
}

/**
 * Place every post on the road. Posts are in road order, and a new run
 * starts whenever the stretch changes, so a payload that returns to an
 * earlier stretch gets a second band rather than a reordered road.
 */
function layOut(c: RoadmapRailContent): {
  placed: PlacedPost[];
  runs: StretchRun[];
  width: number;
} {
  const labelOf = new Map(c.stretches.map((s) => [s.id, s.label]));
  const tintOf = new Map(c.stretches.map((s, i) => [s.id, i % 4]));
  const placed: PlacedPost[] = [];
  const runs: StretchRun[] = [];
  let x = EDGE + POST_W / 2;
  c.posts.forEach((post, i) => {
    const prev = c.posts[i - 1];
    const newRun = !prev || prev.stretch !== post.stretch;
    if (newRun && prev) x += STRETCH_GAP;
    if (newRun) {
      runs.push({
        stretchId: post.stretch,
        // A stretch id the payload never declared still gets a band, named
        // by its id, rather than vanishing.
        label: labelOf.get(post.stretch) ?? post.stretch,
        from: x - POST_W / 2,
        to: x + POST_W / 2,
        tint: tintOf.get(post.stretch) ?? 0,
      });
    } else {
      runs[runs.length - 1].to = x + POST_W / 2;
    }
    placed.push({ post, x, run: runs.length - 1 });
    x += PITCH;
  });
  const last = placed[placed.length - 1];
  const width = last ? last.x + POST_W / 2 + EDGE : 2 * EDGE;
  return { placed, runs, width };
}

export const roadmapRailTemplate: Template = {
  id: 'roadmap-rail',
  version: '1.0.0',
  use: 'any',
  emphasizeTargets: 'a post, by 0-based index. The road pans to centre it, and it pulses',
  description:
    'A roadmap as one road wider than the stage. Sign posts carry a status; each beat pans to a post and the pan holds.',
  slots: {
    title: 'string — the roadmap’s name',
    stretches: '{ id, label }[] — tiers or phases, in road order',
    posts:
      '{ label, stretch, status: "landed"|"active"|"parked"|"not-started"|null, detail?, date? }[] — in road order. null status draws as unknown',
    currentPost: 'number — index of the "you are here" post. Omit when the source names none',
  },
  demo: {
    label: 'Roadmap Rail',
    content: communitySignalRail as unknown as Record<string, unknown>,
    emphasizeAfter: { target: String(communitySignalRail.currentPost), delayMs: 2600 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as RoadmapRailContent;
    const content: RoadmapRailContent = {
      ...c,
      stretches: c.stretches ?? [],
      posts: c.posts ?? [],
    };
    const { placed, runs, width: roadW } = layOut(content);
    const current =
      typeof content.currentPost === 'number' && placed[content.currentPost]
        ? content.currentPost
        : null;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-rr-wrapper';

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-rr-plate';
    wrapper.appendChild(plate);

    // ── header strip ──────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'sb-rr-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim';
    eyebrow.textContent = 'Roadmap';
    header.appendChild(eyebrow);
    const chip = document.createElement('span');
    chip.className = 'cs-badge cs-badge--ink sb-rr-chip';
    const n = placed.length;
    const s = content.stretches.length;
    chip.textContent = `${n} post${n === 1 ? '' : 's'} · ${s} stretch${s === 1 ? '' : 'es'}`;
    header.appendChild(chip);
    plate.appendChild(header);

    const body = document.createElement('div');
    body.className = 'sb-rr-body';
    plate.appendChild(body);

    if (content.title) {
      const h = document.createElement('h2');
      h.className = 'sb-rr-title';
      h.textContent = content.title;
      body.appendChild(h);
    }

    // ── the rail ──────────────────────────────────────────────
    const viewport = document.createElement('div');
    viewport.className = 'sb-rr-viewport';
    body.appendChild(viewport);

    const road = document.createElement('div');
    road.className = 'sb-rr-road';
    road.style.width = `${roadW}px`;
    viewport.appendChild(road);

    const line = document.createElement('div');
    line.className = 'sb-rr-line';
    road.appendChild(line);

    runs.forEach((r) => {
      const band = document.createElement('div');
      band.className = `sb-rr-band sb-rr-tint-${r.tint}`;
      band.style.left = `${r.from}px`;
      band.style.width = `${r.to - r.from}px`;
      const label = document.createElement('div');
      label.className = 'sb-rr-band-label';
      label.textContent = r.label;
      band.appendChild(label);
      road.appendChild(band);
    });

    const postEls: HTMLElement[] = [];
    placed.forEach(({ post, x }, i) => {
      const status = post.status ?? 'unknown';
      const el = document.createElement('div');
      el.className = `sb-rr-post sb-rr-post--${status}`;
      el.style.left = `${x - POST_W / 2}px`;
      el.style.width = `${POST_W}px`;

      if (i === current) {
        const pin = document.createElement('div');
        pin.className = 'sb-rr-here';
        pin.textContent = 'You are here';
        el.appendChild(pin);
        el.classList.add('sb-rr-post--current');
      }

      const card = document.createElement('div');
      card.className = 'sb-rr-card';
      const label = document.createElement('div');
      label.className = 'sb-rr-label';
      label.textContent = post.label;
      card.appendChild(label);
      if (post.detail) {
        const d = document.createElement('div');
        d.className = 'sb-rr-detail';
        d.textContent = post.detail;
        card.appendChild(d);
      }
      const word = document.createElement('div');
      word.className = 'sb-rr-status';
      word.textContent = post.date
        ? `${STATUS_WORD[status]} · ${post.date}`
        : STATUS_WORD[status];
      card.appendChild(word);
      el.appendChild(card);

      const stem = document.createElement('div');
      stem.className = 'sb-rr-stem';
      el.appendChild(stem);

      const node = document.createElement('div');
      node.className = 'sb-rr-node';
      node.textContent = STATUS_MARK[status];
      el.appendChild(node);

      road.appendChild(el);
      postEls.push(el);
    });

    // ── overview ──────────────────────────────────────────────
    // Built always, shown only when the road overflows. Whether it does is
    // only known once the viewport is attached and has a width.
    const overview = document.createElement('div');
    overview.className = 'sb-rr-overview';
    const mini = document.createElement('div');
    mini.className = 'sb-rr-mini';
    runs.forEach((r) => {
      const seg = document.createElement('div');
      seg.className = `sb-rr-mini-band sb-rr-tint-${r.tint}`;
      seg.style.left = `${(r.from / roadW) * 100}%`;
      seg.style.width = `${((r.to - r.from) / roadW) * 100}%`;
      mini.appendChild(seg);
    });
    placed.forEach(({ post, x }, i) => {
      const dot = document.createElement('div');
      dot.className = `sb-rr-mini-dot sb-rr-post--${post.status ?? 'unknown'}`;
      if (i === current) dot.classList.add('sb-rr-mini-dot--current');
      dot.style.left = `${(x / roadW) * 100}%`;
      mini.appendChild(dot);
    });
    const windowBox = document.createElement('div');
    windowBox.className = 'sb-rr-mini-window';
    mini.appendChild(windowBox);
    overview.appendChild(mini);
    const readout = document.createElement('div');
    readout.className = 'sb-rr-readout';
    overview.appendChild(readout);
    body.appendChild(overview);

    presenter.domRoot.appendChild(wrapper);

    wrapper.style.setProperty('--sb-rr-pan-ms', `${PAN_MS}ms`);

    // ── scene state: the pan ──────────────────────────────────
    // `offset` is how far the road is shifted left, in layout px. It is
    // recomputed from the target every time, never accumulated.
    const viewportW = () => viewport.clientWidth;
    const overflows = () => roadW > viewportW();

    const offsetFor = (index: number | null): number => {
      const vw = viewportW();
      // A road shorter than the viewport is centred and never pans.
      if (roadW <= vw) return -(vw - roadW) / 2;
      if (index == null) return 0;
      const centred = placed[index].x - vw / 2;
      return Math.min(Math.max(centred, 0), roadW - vw);
    };

    const applyOffset = (offset: number) => {
      road.style.transform = `translateX(${-offset}px)`;
      if (!overflows()) return;
      const vw = viewportW();
      windowBox.style.left = `${(offset / roadW) * 100}%`;
      windowBox.style.width = `${(vw / roadW) * 100}%`;
      const shown = placed
        .map((p, i) => ({ i, x: p.x }))
        .filter(({ x }) => x >= offset && x <= offset + vw);
      readout.textContent = shown.length
        ? `posts ${shown[0].i + 1}–${shown[shown.length - 1].i + 1} of ${placed.length}`
        : `${placed.length} posts`;
    };

    // The opening frame sits at the start of the road. The marker may be
    // off screen; the overview shows where it is. Moving to it is a beat,
    // not something the template does on its own.
    road.classList.add('sb-rr-road--still');
    overview.classList.toggle('sb-rr-overview--shown', overflows());
    applyOffset(offsetFor(null));
    // Force the still position to commit before transitions are enabled,
    // so the first beat eases from here rather than from translateX(0).
    void road.offsetWidth;
    road.classList.remove('sb-rr-road--still');

    // ── entrance ──────────────────────────────────────────────
    const timers: number[] = [];
    timers.push(window.setTimeout(() => wrapper.classList.add('sb-visible'), 150));
    const step = Math.min(70, 1100 / Math.max(1, postEls.length));
    postEls.forEach((el, i) => {
      timers.push(
        window.setTimeout(() => el.classList.add('sb-visible'), 450 + i * step),
      );
    });

    // ── pulse ─────────────────────────────────────────────────
    let pulsed: HTMLElement | null = null;
    let pulseTimer: number | null = null;
    const clearPulse = () => {
      if (pulseTimer != null) window.clearTimeout(pulseTimer);
      pulseTimer = null;
      pulsed?.classList.remove('sb-emphasize');
      pulsed = null;
    };

    return {
      dismiss() {
        timers.forEach((t) => window.clearTimeout(t));
        clearPulse();
        // The pan lives on `road`'s inline transform, so removing the
        // wrapper removes it. Nothing else holds scene state.
        wrapper.remove();
      },
      emphasize(target: string) {
        const idx = Number.parseInt(target, 10);
        if (Number.isNaN(idx) || !postEls[idx]) return;
        // Safe before the entrance has reached this post.
        postEls[idx].classList.add('sb-visible');
        applyOffset(offsetFor(idx));
        // Accent budget = 1: one pulsed post at a time.
        clearPulse();
        pulsed = postEls[idx];
        pulsed.classList.add('sb-emphasize');
        pulseTimer = window.setTimeout(clearPulse, PULSE_MS);
      },
    };
  },
};

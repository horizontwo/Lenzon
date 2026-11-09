/**
 * Demo payloads for `roadmap-rail`, drawn by hand from the two real roadmaps
 * in this repo's doc graph. PLAN-EXPLAINER-TEMPLATES Phase 2.
 *
 * They exist before the template so the shape could be argued over first.
 * Phase 3 builds `roadmap-rail` against them and ships one as its `demo`.
 *
 * ── Where the statuses came from ───────────────────────────────────────
 *
 * Neither doc states a status for most of its items, and neither has child
 * plans in the doc graph yet. So every status below was read off the code at
 * 3c79b97, by a person, item by item. The plan lens cannot do that reading.
 * For a body item with no child plan it will have null, and these demos are
 * not a picture of what the lens produces. They are a picture of what the
 * rail has to draw when the answers are known.
 *
 * The evidence for each status is in the post's comment, so a later reader
 * can check it rather than trust it.
 */
import type { RoadmapRailContent } from './roadmap-rail.types';

/**
 * `roadmap-community-signal`: tiered, sixteen posts, wider than any stage.
 *
 * The doc's section order is Tier 1, Tier 2, "Already a capability", Tier 3.
 * The rail puts "Already a capability" first. A road reads as sequence, and
 * those items are behind us, not after Tier 2. The doc lists them where it
 * does because they were reclassified out of Tier 3, not because they come
 * later. That reordering is a lens decision this demo makes by hand.
 *
 * The current post is 2.3, the config UI. It is the only item with work in
 * flight: `CONFIG-UI-lens-workbench.md` is an active plan, in design, and it
 * names itself roadmap item 2.3. It sits past four Tier 1 posts that are not
 * started. A roadmap is not walked in order, and the rail has to show that
 * without implying Tier 1 was finished.
 */
export const communitySignalRail: RoadmapRailContent = {
  title: 'Roadmap — Community Signal',
  stretches: [
    { id: 'built', label: 'Already a capability' },
    { id: 'tier-1', label: 'Tier 1 — Sharpens the demand test' },
    { id: 'tier-2', label: 'Tier 2 — Differentiators' },
    { id: 'tier-3', label: 'Tier 3 — Parked' },
  ],
  posts: [
    // The doc itself says these three exist today. Taken at its word; the
    // analysis prompt was not re-read for this demo.
    { label: 'Structured risk pass', stretch: 'built', status: 'landed' },
    { label: 'Examined vs found', stretch: 'built', status: 'landed' },
    { label: 'Standards lens', stretch: 'built', status: 'landed' },

    // No size gate on the analysis mode anywhere in apps/server/lib.
    { label: 'Cost gating by size', stretch: 'tier-1', status: 'not-started' },
    // No lockfile or generated-file filter on the analysis path. The only
    // lockfile handling is in the series digest's area grouping.
    { label: 'Strip noisy files', stretch: 'tier-1', status: 'not-started' },
    // The hard one. The safe* check wrappers never throw, so a failure never
    // breaks the webhook. But a failed run concludes its check as `failure`,
    // a red X on the PR (pr-explainer-result/route.ts, reap-stuck.ts). The
    // item asks for that to be a guarantee of quiet, and it is not made.
    {
      label: 'Fail silent',
      stretch: 'tier-1',
      status: 'not-started',
      detail: 'Failed runs still show a red check',
    },
    // app/pricing/page.tsx: "you never batch PRs to save money".
    { label: 'Anti-batching line', stretch: 'tier-1', status: 'landed' },

    // No producer change aimed at this found.
    { label: 'High-signal explaining', stretch: 'tier-2', status: 'not-started' },
    // No agent-vs-human author detection found.
    { label: 'Author tracking', stretch: 'tier-2', status: 'not-started' },
    // CONFIG-UI-lens-workbench.md: "ACTIVE PLAN (design, pre-build)". The
    // lens machinery under it (lens.loader.ts, lens.context.ts) has shipped.
    {
      label: 'Config UI',
      stretch: 'tier-2',
      status: 'active',
      detail: 'Lens workbench, in design',
    },

    // The doc parks all six by name.
    { label: 'Merge gating', stretch: 'tier-3', status: 'parked' },
    { label: 'Autonomous action', stretch: 'tier-3', status: 'parked' },
    { label: 'Prescriptive verdicts', stretch: 'tier-3', status: 'parked' },
    { label: 'Lint-test-AI gate', stretch: 'tier-3', status: 'parked' },
    { label: 'Correctness guarantees', stretch: 'tier-3', status: 'parked' },
    { label: 'Slack and chat', stretch: 'tier-3', status: 'parked' },
  ],
  currentPost: 9,
};

/**
 * `strategy`: sections as posts, three stretches, nine posts.
 *
 * No current post. Nothing in this doc has work in flight, and the plan's
 * Phase 2 asked for one anyway. Inventing a position would break the rule
 * the template enforces, so this demo is the one that exercises the absent
 * marker. It also carries the one null status, for the same reason.
 */
export const strategyRail: RoadmapRailContent = {
  title: 'Lenzon — Strategy, Pricing & Positioning',
  stretches: [
    { id: 'position', label: 'Positioning' },
    { id: 'pricing', label: 'Pricing shape' },
    { id: 'enterprise', label: 'The Enterprise lane' },
  ],
  posts: [
    // app/pricing/page.tsx: "Everything you need to review and explain".
    { label: 'Review and Explain', stretch: 'position', status: 'landed' },
    // Whether the product surface is open source is not something the code
    // in this repo can answer. Unknown, not not-started.
    { label: 'Managed OSS', stretch: 'position', status: null },

    // prices.ts: FREE_TIER_CREDITS = 0, so the doc's 150-credit grant is
    // gone. Free runs are BYOK on public repos ('free_beta' in the schema).
    // The public-only rule held; the mechanism changed.
    {
      label: 'Free on public repos',
      stretch: 'pricing',
      status: 'landed',
      detail: 'Bring your own key, not a credit grant',
    },
    // prices.ts has one SKU, builder_2500. The doc meant to keep two.
    {
      label: 'SKU cleanup',
      stretch: 'pricing',
      status: 'landed',
      detail: 'One pack left, not two',
    },
    // "Credits become an internal thing the user doesn't see." Credits are
    // still on the pricing page.
    { label: 'Hide credit math', stretch: 'pricing', status: 'not-started' },

    // app/pricing/page.tsx: "Team & Enterprise — Contact us".
    { label: 'Contact-sales row', stretch: 'enterprise', status: 'landed' },
    // No planTier on User in prisma/schema.prisma.
    { label: 'planTier flag', stretch: 'enterprise', status: 'not-started' },
    // Parked by the doc's own principle: built per customer, not on spec.
    { label: 'Earned features', stretch: 'enterprise', status: 'parked' },
    // TEMPLATE-SPEC §9e: Stage3D is wired but no template renders through it.
    { label: '3D architecture lens', stretch: 'enterprise', status: 'not-started' },
  ],
};

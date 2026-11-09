/**
 * The payload `roadmap-rail` renders. PLAN-EXPLAINER-TEMPLATES Phase 2.
 *
 * This is the template's slot schema, so the player owns it. It used to be
 * imported from Lenzon's internal shared-types package. The open player cannot reach Lenzon
 * internals, so it now lives here.
 *
 * The server's plan lens builds the same shape as `SpecPlan.roadmap`, and
 * keeps its own copy in shared-types/spec-digest.ts. The two copies are held
 * together by a type-level check in
 * apps/server/lib/player-template-contract.test.ts, so a change to one
 * that the other does not make fails the server's typecheck.
 *
 * Nothing here is guessed. A status the source does not give is null, and
 * the template draws null as unknown. A current post the source does not
 * give is absent, and the template draws no marker.
 */

/**
 * How a post reads at a glance. Deliberately four, not the doc graph's seven.
 * A viewer reads a sign post in half a second, and `partial` versus `blocked`
 * versus `draft` is a distinction for the Planning tab, not for a road.
 */
export type RoadmapPostStatus = 'landed' | 'active' | 'parked' | 'not-started';

/** A tier or phase: a run of road the posts sit on, in road order. */
export interface RoadmapStretch {
  /** Stable id that posts reference, e.g. "tier-1". */
  id: string;
  /** What the doc calls it, e.g. "Tier 1 — Sharpens the demand test". */
  label: string;
}

export interface RoadmapPost {
  /** 1–5 words. The sign post's face. */
  label: string;
  /** The `RoadmapStretch.id` this post sits on. */
  stretch: string;
  /**
   * Null means the source did not say. The template renders null as
   * unknown, never as not-started, because "nobody has started this" is a
   * claim and "we don't know" is not.
   */
  status: RoadmapPostStatus | null;
  /** One line beneath the label. */
  detail?: string;
  /** Display string, not parsed. A post renders fine without one. */
  date?: string;
  /** Carried so a producer can join the post back to its source; the
   * template does not render it. */
  childDocId?: string;
}

export interface RoadmapRailContent {
  /** Headline above the rail. Usually the doc's own title. */
  title?: string;
  /** In road order. Every post's `stretch` must name one of these. */
  stretches: RoadmapStretch[];
  /** In road order, which the template never re-sorts. */
  posts: RoadmapPost[];
  /**
   * Index into `posts` of the "you are here" post. Absent when the source
   * names no current position. Computed upstream, never chosen by the
   * producer.
   */
  currentPost?: number;
}

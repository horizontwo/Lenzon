/**
 * Phase 7 (§11.2 item 3, §11.5) — curated public showcase links.
 *
 * These are PUBLIC `/viewer/<id>/embed` runs: no auth, no scan, no credit cost
 * to play. They're the cheapest "show, don't tell" for a brand-new user — and
 * the answer to the cold-start empty state (zero analyzed PRs of their own, but
 * they still see Lenzon *do its thing* on one click). Shipped static in the
 * `.vsix` (§11.5: no live/paid fetch on sidebar render).
 *
 * Curation note (§11.7 Q2): a tiny static list kept here on purpose — server-
 * driving these is a future near-free `repo-runs`-style read, not v1.
 */

export interface ShowcaseExample {
  /** Short human title shown in the sidebar row. */
  title: string;
  /** A short line of context under the title. */
  blurb: string;
  /**
   * The public viewer URL to frame in the player panel. Use the chrome-off
   * `/embed` variant (the same load target the player panel uses) so it frames
   * cleanly with no Lenzon nav. A `voice=` query is fine and carried through.
   */
  url: string;
}

export const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    title: 'See a Lenzon explainer',
    blurb: 'A narrated walkthrough of a real pull request.',
    // Provided 2026-06-17. `/embed` chrome-off variant of the shared public
    // viewer link; the public Script needs no token to play.
    url: 'https://www.lenzon.ai/viewer/cmq8r13y40000g6t35q1oiuy6/embed?voice=google-chirp3',
  },
];

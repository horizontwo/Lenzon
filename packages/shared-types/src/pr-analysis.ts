/**
 * PRAnalysisJSON — the contract between the PR Code Analysis Gnome and
 * the pr-explainer Producer. Mirrors the `SUBMIT_PR_ANALYSIS_TOOL` JSON
 * Schema declared on the server side. Keep these in lockstep.
 *
 * Shape goal: tell the story of one pull request — motivation, what
 * changed, what the outcome is, and what could bite the reviewer.
 *
 * Constraint kept from the design sketch: every gotcha must cite
 * (file, lineRange). The `examined` array forces explicit "looked here
 * and found nothing" instead of silent omission, which constrains
 * hallucination on the gotcha surface.
 */

// ── meta ──────────────────────────────────────────────────────

export interface PRAnalysisMeta {
  repoUrl: string;
  prNumber: number;
  /** Base ref SHA the diff is computed against. */
  baseSha: string;
  /** Head (PR tip) SHA the diff is computed from. */
  headSha: string;
  /** Server-authoritative PR title from the GitHub API, stamped by the
   * analyze pipeline (NOT produced by the analyst agent — avoids
   * hallucination). Optional: absent on rare payloads or older rows. The
   * producer uses it verbatim for the pr-title-card title. */
  prTitle?: string;
  /** Server-authoritative PR author login (no `@` prefix). Producer prefixes
   * `@` for display. Optional. */
  prAuthor?: string;
  /** Head branch name (e.g. 'fix/symlink-escape'). Feeds the pr-title-card
   * `branchFrom` slot. Optional. */
  headRef?: string;
  /** Base branch name (e.g. 'main'). Feeds the `branchTo` slot. Optional. */
  baseRef?: string;
}

// ── changeSet ─────────────────────────────────────────────────

/** Inclusive [start, end] line range in the post-change file. */
export type PRLineRange = [number, number];

// ── objectives ────────────────────────────────────────────────

/** What the PR is trying to do, captured as headline-shaped statements
 * the producer can lay out as a checklist that later scenes tick off.
 *
 * The analyst commits to 1–2 primary, 0–4 secondary, and 0–3 constraint
 * objectives. Constraints record boundaries the PR deliberately did not
 * cross ("does not change the public API"); their evidence array may be
 * empty since they describe absence rather than a touched hunk. */
export type PRObjectiveKind = 'primary' | 'secondary' | 'constraint';

export interface PRObjectiveEvidence {
  file: string;
  /** Free-form line range string from the diff (e.g. "L42-L51"). Kept
   * loose because the analyst cites both pre- and post-change line
   * numbers depending on the hunk shape; numeric [start, end] would
   * lose that nuance. */
  lineRange?: string;
}

export interface PRObjective {
  /** 3–10 words, imperative headline. "Close the symlink escape gap" —
   * not a full sentence. */
  statement: string;
  kind: PRObjectiveKind;
  /** Diff citations that prove the objective was pursued. May be empty
   * for constraints (which describe what the PR did NOT do). */
  evidence: PRObjectiveEvidence[];
}

export interface PRChangeSetEntry {
  file: string;
  /** Optional — present when the change is narrow enough to point at. */
  lineRange?: PRLineRange;
  /** One- to three-sentence description of what changed and why. */
  description: string;
}

// ── gotchas ───────────────────────────────────────────────────

export interface PRGotcha {
  file: string;
  lineRange: PRLineRange;
  description: string;
}

export interface PRGotchas {
  /** Areas the agent looked at and found clean. Forces explicit
   * "examined, nothing here" instead of silent omission. */
  examined: string[];
  found: PRGotcha[];
}

// ── root ──────────────────────────────────────────────────────

export interface PRAnalysisJSON {
  meta: PRAnalysisMeta;
  /** One- to two-sentence headline of what the PR does. */
  summary: string;
  /** Why this PR exists — the problem, the prior state, the motivation. */
  motivation: string;
  /** Headline-shaped objectives the PR is pursuing. Required, non-empty,
   * MUST contain 1–2 primary entries; 0–4 secondary; 0–3 constraint. */
  objectives: PRObjective[];
  /** The change set, broken into reviewable units. */
  changeSet: PRChangeSetEntry[];
  /** What the codebase looks like after the PR lands. */
  outcome: string;
  gotchas: PRGotchas;
  /** Open questions the agent surfaces for the reviewer. */
  questions?: string[];
}

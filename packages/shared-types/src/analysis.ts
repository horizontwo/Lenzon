/**
 * AnalysisJSON — the contract between the Code Analysis Gnome (Agent 1)
 * and everything downstream: the Producer Gnome (Agent 2), the web UI,
 * and any future export pipelines.
 *
 * This mirrors the `CODE_ANALYSIS_SCHEMA` JSON Schema declared by the
 * `submit_code_analysis` custom tool. When the gnome calls the tool,
 * the resulting `input.data` is typed exactly like `AnalysisJSON`.
 *
 * If the schema file is updated, update these types in lockstep.
 */

// ── quickFacts ────────────────────────────────────────────────

export interface NotableDependency {
  name: string;
  /** One-sentence description of what this dep does in the project. */
  purpose: string;
}

export interface AnalysisQuickFacts {
  repoUrl: string;
  /** Primary languages, ordered by prevalence. */
  languages: string[];
  /** Primary framework or runtime (e.g. "Next.js 14"). */
  framework: string;
  /** Build tool / bundler (e.g. "Vite"). */
  buildTool?: string;
  totalFiles: number;
  totalLines: number;
  /** Up to ~10 most significant dependencies. */
  notableDependencies?: NotableDependency[];
}

// ── architecture ──────────────────────────────────────────────

export interface EntryPoint {
  file: string;
  role: string;
}

export interface Module {
  /** Human-readable name (e.g. "Authentication"). */
  name: string;
  /** Directory or file path. */
  path: string;
  responsibility: string;
  /** Names of other modules this one depends on. */
  dependsOn: string[];
}

export interface DataFlowStep {
  actor: string;
  action: string;
  file?: string;
}

export interface DataFlow {
  name: string;
  steps: DataFlowStep[];
}

export interface ExternalIntegration {
  name: string;
  purpose: string;
  credentialManagement?: string;
}

export interface AnalysisArchitecture {
  /** 2-3 sentence architectural summary. */
  summary: string;
  entryPoints: EntryPoint[];
  modules: Module[];
  /** Key data flows — 2-4 most important user journeys or data paths. */
  dataFlow: DataFlow[];
  /** Optional ASCII / Mermaid / similar diagram. */
  diagram?: string;
  externalIntegrations?: ExternalIntegration[];
}

// ── codeQuality ───────────────────────────────────────────────

export type OverallGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type PatternGrade = 'good' | 'mixed' | 'poor';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type SecuritySeverity = 'info' | 'warning' | 'critical';
export type Impact = 'low' | 'medium' | 'high';

export interface PatternAssessment {
  /** e.g. "Error handling", "Naming", "Testing". */
  name: string;
  assessment: string;
  grade?: PatternGrade;
}

export interface ComplexityHotspot {
  file: string;
  /** e.g. "45-120" */
  lineRange?: string;
  issue: string;
  severity: Severity;
  suggestion?: string;
}

export interface TechDebtItem {
  description: string;
  file?: string;
  impact: Impact;
}

export interface SecurityConcern {
  description: string;
  file?: string;
  severity: SecuritySeverity;
  remediation?: string;
}

export interface Strength {
  description: string;
  file?: string;
}

export interface AnalysisCodeQuality {
  overallGrade: OverallGrade;
  patterns: PatternAssessment[];
  complexityHotspots: ComplexityHotspot[];
  techDebt: TechDebtItem[];
  securityConcerns?: SecurityConcern[];
  /** Always include at least one — there is always something. */
  strengths: Strength[];
}

// ── plainEnglish ──────────────────────────────────────────────

export interface UserJourney {
  name: string;
  narrative: string;
}

export interface Analogy {
  concept: string;
  analogy: string;
}

export interface AnalysisPlainEnglish {
  /** One sentence a non-developer could understand. */
  oneLiner: string;
  /** 3-5 paragraph plain-English explanation. */
  fullExplanation: string;
  userJourneys: UserJourney[];
  analogies?: Analogy[];
}

// ── health ────────────────────────────────────────────────────

export interface Risk {
  risk: string;
  consequence: string;
}

export interface Win {
  improvement: string;
  impact: string;
  effort?: Impact;
}

export interface ReadingStep {
  file: string;
  why: string;
}

export interface AnalysisHealth {
  /** Honest one-paragraph verdict. */
  verdict: string;
  topRisks: Risk[];
  topWins: Win[];
  /** Ideal reading order — 5-10 files. */
  readingOrder: ReadingStep[];
}

// ── community ─────────────────────────────────────────────────

/**
 * Activity signal derived from `daysSinceLastCommit`. Computed by the
 * agent against fixed thresholds (not an LLM opinion):
 *   active     — last commit within 30 days
 *   maintained — last commit within 180 days
 *   dormant    — last commit within 365 days
 *   archived   — last commit older than 365 days, or repo metadata flags it
 */
export type ActivitySignal = 'active' | 'maintained' | 'dormant' | 'archived';

export interface ContributorActivity {
  /** Display name from `git log` (may be email-derived if no name set). */
  name: string;
  /** Number of commits authored by this contributor. */
  commits: number;
  /** ISO date of this contributor's most recent commit. */
  lastActiveDate: string;
}

/**
 * Community / liveness signal sourced from `git log` on the cloned repo.
 * Descriptive only — counts and dates, not opinions. Lets the Producer
 * dramatize per persona ("abandoned" vs "small but active") without
 * Agent 1b having to take a side.
 */
export interface AnalysisCommunity {
  /** ISO date of the most recent commit on the default branch. */
  lastCommitDate: string;
  /** Whole days between `lastCommitDate` and the analysis run. */
  daysSinceLastCommit: number;
  commitsLast30Days: number;
  commitsLast90Days: number;
  commitsLast365Days: number;
  uniqueContributorsLast90Days: number;
  totalContributors: number;
  /** Top contributors by commit count, capped at ~5. Omit if git log is empty. */
  topContributors?: ContributorActivity[];
  branchCount: number;
  tagCount: number;
  /** Derived from `daysSinceLastCommit`. See ActivitySignal docstring. */
  activitySignal: ActivitySignal;
}

// ── root ──────────────────────────────────────────────────────

export interface AnalysisJSON {
  quickFacts: AnalysisQuickFacts;
  architecture: AnalysisArchitecture;
  plainEnglish: AnalysisPlainEnglish;
  community: AnalysisCommunity;
  /**
   * Evaluation sections — only populated when the AnalysisMode asks for
   * critique (scorecard, or no-mode default). Descriptive modes (overview,
   * focused-brief, walkthrough) omit these to avoid unsolicited judgment.
   */
  codeQuality?: AnalysisCodeQuality;
  health?: AnalysisHealth;
}

/**
 * Server-side record wrapping the analysis with metadata. The player
 * receives this from /api/analyze/:id so it can show status, cache by
 * repo URL, and know when the analysis is ready.
 */
export type AnalysisStatus =
  | 'running'
  | 'ready'
  | 'error'
  | 'cancelling'
  | 'cancelled';

/**
 * Sub-state of `status='running'`. 'cloning' = waiting on the AWS clone
 * worker (Fargate cold-start + clone + upload, ~15-50s); 'running' = the
 * agent is actually working. Null on terminal rows or rows that predate
 * Step 7 of the secure-repo plan. Status remains the source of truth for
 * terminal vs in-progress; phase is purely advisory for UI copy.
 */
export type AnalysisPhase = 'cloning' | 'running';

export interface AnalysisRecord {
  id: string;
  repoUrl: string;
  commitSha: string | null;
  status: AnalysisStatus;
  phase: AnalysisPhase | null;
  agentVersion: string | null;
  data: AnalysisJSON | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight list entry for the repo-version dropdown. Omits `data`
 * and `error` to keep the list payload small; fetch the full record
 * via /api/analyze/:id when the user picks one.
 */
export interface AnalysisSummary {
  id: string;
  repoUrl: string;
  status: AnalysisStatus;
  agentVersion: string | null;
  commitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

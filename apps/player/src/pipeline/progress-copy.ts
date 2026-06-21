import type { AnalysisPhase, TriagePhase } from '@lenzon/shared-types';

export type ProgressStage = 'triage' | 'analysis' | 'pr';

export interface ProgressCopy {
  title: string;
  hint: string;
}

const SLOW_QUEUED_THRESHOLD_MS = 60_000;

/** PR-pipeline phase strings the server sets on a kind='pr' Analysis row.
 *  They live outside the AnalysisPhase union (which the customer record type
 *  declares), so we accept them as a widened input here. */
export type PrPhase = 'cloning' | 'triaging' | 'analyzing';

export function progressCopy(
  stage: ProgressStage,
  phase: AnalysisPhase | TriagePhase | PrPhase | null | undefined,
  elapsedMs: number,
): ProgressCopy {
  if (phase === 'cloning') {
    if (elapsedMs >= SLOW_QUEUED_THRESHOLD_MS) {
      return {
        title: 'Still queued — this can happen during quiet periods. Hang tight.',
        hint: '~30s typical once started',
      };
    }
    return {
      title: 'Queued — starting a worker…',
      hint: '~15–40s while a clone task spins up',
    };
  }

  if (stage === 'pr') {
    // PR rows progress cloning → triaging → analyzing. The 'cloning' case is
    // handled above; map the rest here. (The server's PR phase strings are
    // outside the AnalysisPhase union, so compare loosely.)
    if (phase === 'triaging') {
      return { title: 'Reading the diff…', hint: '~30s' };
    }
    return { title: 'Explaining the changes', hint: '~3–6 min typical' };
  }

  if (stage === 'triage') {
    return { title: 'Scoping your codebase', hint: '~30s typical' };
  }
  return { title: 'Building the analysis', hint: '~5–8 min typical' };
}

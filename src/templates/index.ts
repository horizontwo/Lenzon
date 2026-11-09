import { registerTemplate } from './registry';
import { titleBulletsTemplate } from './title-bullets';
import { codeZoomTemplate } from './code-zoom';
import { purposeBulletsTemplate } from './purpose-bullets';
import { emphasisWordTemplate } from './emphasis-word';
import { centerStageTemplate } from './center-stage';
import { codeCloudTemplate } from './code-cloud';
import { transformGridTemplate } from './transform-grid';
import { flowDiagramTemplate } from './flow-diagram';
import { sequenceDiagramTemplate } from './sequence-diagram';
import { stepJourneyTemplate } from './step-journey';
import { dataPipelineTemplate } from './data-pipeline';
import { scorecardTemplate } from './scorecard';
import { entityMapTemplate } from './entity-map';
import { compareSplitTemplate } from './compare-split';
import { driftCalloutTemplate } from './drift-callout';
import { directoryTreeTemplate } from './directory-tree';
import { repoPulseTemplate } from './repo-pulse';
import { techStackBreakdownTemplate } from './tech-stack-breakdown';
import { titleCardTemplate } from './title-card';
import { prTitleCardTemplate } from './pr-title-card';
import { prObjectivesTemplate } from './pr-objectives';
import { codeDiffTemplate } from './code-diff';
import { riskMatrixTemplate } from './risk-matrix';
import { outroCardTemplate } from './outro-card';
import { seriesTitleCardTemplate } from './series-title-card';
import { planTitleCardTemplate } from './plan-title-card';
import { eraTimelineTemplate } from './era-timeline';
import { objectiveLedgerTemplate } from './objective-ledger';
import { constraintWallTemplate } from './constraint-wall';
import { fileTrajectoryTemplate } from './file-trajectory';
import { deliveryStepsTemplate } from './delivery-steps';
import { componentImpactTemplate } from './component-impact';
import { reviewPriorityMatrixTemplate } from './review-priority-matrix';
import { roadmapRailTemplate } from './roadmap-rail';
import { decisionLedgerTemplate } from './decision-ledger';

/**
 * Register all built-in templates. Importing this file for its side
 * effect is how the Presenter ends up knowing what templates exist.
 * User/agent code can call registerTemplate() later to add more.
 */
registerTemplate(titleBulletsTemplate);
registerTemplate(codeZoomTemplate);
registerTemplate(purposeBulletsTemplate);
registerTemplate(emphasisWordTemplate);
registerTemplate(centerStageTemplate);
registerTemplate(codeCloudTemplate);
registerTemplate(transformGridTemplate);
registerTemplate(flowDiagramTemplate);
registerTemplate(sequenceDiagramTemplate);
registerTemplate(stepJourneyTemplate);
registerTemplate(dataPipelineTemplate);
registerTemplate(scorecardTemplate);
registerTemplate(entityMapTemplate);
registerTemplate(compareSplitTemplate);
registerTemplate(driftCalloutTemplate);
registerTemplate(directoryTreeTemplate);
registerTemplate(repoPulseTemplate);
registerTemplate(techStackBreakdownTemplate);
registerTemplate(titleCardTemplate);
registerTemplate(prTitleCardTemplate);
registerTemplate(prObjectivesTemplate);
registerTemplate(codeDiffTemplate);
registerTemplate(riskMatrixTemplate);
registerTemplate(outroCardTemplate);
registerTemplate(seriesTitleCardTemplate);
registerTemplate(planTitleCardTemplate);
registerTemplate(eraTimelineTemplate);
registerTemplate(objectiveLedgerTemplate);
registerTemplate(constraintWallTemplate);
registerTemplate(fileTrajectoryTemplate);
registerTemplate(deliveryStepsTemplate);
registerTemplate(componentImpactTemplate);
registerTemplate(reviewPriorityMatrixTemplate);
registerTemplate(roadmapRailTemplate);
registerTemplate(decisionLedgerTemplate);

export { registerTemplate, getTemplate, listTemplates, listTemplateVersions } from './registry';
export type { Template, TemplateContent, TemplateHandle, TemplateDemo } from './registry';
export type {
  RoadmapRailContent,
  RoadmapPost,
  RoadmapPostStatus,
  RoadmapStretch,
} from './roadmap-rail.types';
export { REVIEW_PRIORITY_ACCENT_IDS } from './review-priority-matrix';
export type { ReviewPriorityAccentId } from './review-priority-matrix';

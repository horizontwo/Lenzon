import { registerTemplate } from './registry';
import { helloTemplate } from './hello-template';
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
import { directoryTreeTemplate } from './directory-tree';
import { repoPulseTemplate } from './repo-pulse';
import { techStackBreakdownTemplate } from './tech-stack-breakdown';
import { titleCardTemplate } from './title-card';
import { prTitleCardTemplate } from './pr-title-card';
import { prObjectivesTemplate } from './pr-objectives';
import { codeDiffTemplate } from './code-diff';
import { riskMatrixTemplate } from './risk-matrix';
import { outroCardTemplate } from './outro-card';

/**
 * Register all built-in templates. Importing this file for its side
 * effect is how the Presenter ends up knowing what templates exist.
 * User/agent code can call registerTemplate() later to add more.
 */
// hello-template is the annotated tutorial reference — registered first so
// it leads the sandbox dropdown. See docs/creating-a-template.md.
registerTemplate(helloTemplate);
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
registerTemplate(directoryTreeTemplate);
registerTemplate(repoPulseTemplate);
registerTemplate(techStackBreakdownTemplate);
registerTemplate(titleCardTemplate);
registerTemplate(prTitleCardTemplate);
registerTemplate(prObjectivesTemplate);
registerTemplate(codeDiffTemplate);
registerTemplate(riskMatrixTemplate);
registerTemplate(outroCardTemplate);

export { registerTemplate, getTemplate, listTemplates, listTemplateVersions } from './registry';
export type { Template, TemplateContent, TemplateHandle, TemplateDemo } from './registry';

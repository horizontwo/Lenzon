/**
 * The script contract the player plays.
 *
 * This used to be a hand-kept copy of the format, beside a second copy in
 * Lenzon's internal shared-types package. The two had drifted only in
 * comments. The format
 * now lives in one place, @lenzon/explainer-format, and the player re-exports
 * it so `import { PresentationScript } from '@lenzon/player'` keeps working.
 */

export type * from '@lenzon/explainer-format';

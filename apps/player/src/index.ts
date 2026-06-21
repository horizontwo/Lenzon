/**
 * Public package barrel for @lenzon/player.
 *
 * Consumers (the lenzon Next.js server, future external embedders)
 * import from here. The Vite demo entry at `src/main.tsx` is unaffected —
 * it still boots the demo host for local template iteration.
 *
 * Importing this module has two side effects:
 *  - pulls in `./templates` which registers every built-in template with
 *    the Presenter's template registry
 *  - does NOT import `./index.css` — stylesheet imports are left to the
 *    consumer so they can control where styles land in their bundle
 *    (see HeroPlayer.tsx in apps/server)
 */

export { Presentation } from './react/Presentation';
export type { PresentationProps } from './react/Presentation';

// ScriptPlayer, StubVoicePlayer, WebSpeechVoicePlayer, types, sampleScripts
export * from './player';

// Template registry helpers + registration side effect
export * from './templates';

// Presenter service is re-exported for advanced consumers who want to
// drive scenes imperatively without the ScriptPlayer wrapper.
export { Presenter } from './service/presenter';
export type { TextBoxHandle } from './service/presenter';

// Design-surface size. Embedders default to DEFAULT_DESIGN_SIZE but can
// pass `designSize={{ width, height }}` to HeroPlayer / GenerateFlow to
// experiment with different ratios or trigger a different scale.
export { DEFAULT_DESIGN_SIZE } from './designSize';
export type { DesignSize } from './designSize';

// Viewer-mode fetch helper — used by embedders that want to play a
// persisted Script by id (e.g. the homepage hero loop).
export {
  fetchViewerScript,
  ViewerNotFoundError,
  ViewerAuthError,
  ViewerForbiddenError,
} from './pipeline/api';

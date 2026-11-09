/**
 * lenzon/ui — ESLint rules that enforce template hygiene.
 *
 * SHIPPED AS REFERENCE, NOT WIRED TO CI YET.
 *
 * This file documents the design team's intent for what templates
 * should *not* contain. It's not consumed by any npm script in the
 * player package today — the player has no eslint config at the
 * workspace level. To enforce:
 *
 *   1. Add `eslint` + `typescript-eslint` to apps/player/devDependencies.
 *   2. Move this file to apps/player/eslint.config.mjs and update the
 *      `files` glob to `apps/player/src/templates/**` from the player
 *      root.
 *   3. Add `"lint:templates": "eslint 'src/templates/**\/*.{ts,tsx}'"`
 *      to apps/player/package.json scripts.
 *   4. Wire it into the monorepo CI.
 *
 * Source of truth:
 *   apps/player/designsysteminput/lenzon-ui/eslint.config.mjs
 *
 * Bans, and why:
 *   - hex color literals       → use var(--cs-*) from tokens
 *   - emoji code points        → use <Badge> or an accent
 *   - banned font names        → use var(--cs-font-*)
 *   - importing from 'react-icons', '@heroicons/*' etc.
 *                              → use CSS + tokens
 *   - > 1 <Mark> in a template → accent budget rule
 */

import tseslint from 'typescript-eslint';

const BANNED_FONTS = [
  'system-ui',
  'Inter',
  'Roboto',
  'Arial',
  'Helvetica',
  'sans-serif"',
  'Fraunces',
];

const BANNED_IMPORTS = [
  'react-icons',
  '@heroicons/react',
  '@heroicons/react/24/solid',
  '@heroicons/react/24/outline',
  'lucide-react',
];

export default tseslint.config({
  files: ['apps/player/src/templates/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Literal[value=/^#[0-9a-fA-F]{3,8}$/], TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
        message:
          '[lenzon] No hex literals in template files. Use var(--cs-*) from apps/player/src/index.css.',
      },
      {
        selector:
          "Literal[value=/[\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{27BF}]/u]",
        message:
          '[lenzon] No emoji in templates. Use a Badge-style CSS class or an accent.',
      },
      ...BANNED_FONTS.map((name) => ({
        selector: `Literal[value=/${name}/]`,
        message: `[lenzon] Banned font "${name}". Use var(--cs-font-ui|display|mono).`,
      })),
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: BANNED_IMPORTS.map((name) => ({
          name,
          message:
            '[lenzon] Icon libraries are not allowed in templates.',
        })),
      },
    ],
  },
});

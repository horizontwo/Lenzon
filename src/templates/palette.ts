/**
 * Shared palette for templates. Single source of truth for `palette.*`
 * aliases used in template content (e.g. `categoryColors`, `groups[].color`,
 * `accent`). Keep this file the *only* declaration of `PALETTE_DEFAULTS`.
 *
 * The aliases match what the Producer (Agent 2) is told it can emit — see
 * the visual primitives catalog in apps/server/lib/agents/producer.system-prompt.
 *
 * Why the aliases point at CSS vars (not hexes):
 *   `--cs-accent-cool`, `--cs-accent-ok`, `--cs-accent-warn` are the live
 *   design-system tokens. Returning `var(--cs-accent-*)` means the
 *   Producer-driven `palette.*` values stay in sync with whatever the
 *   design system evolves to — flip a token in index.css and every
 *   `palette.primary` stripe on flow-diagram, entity-map, compare-split,
 *   etc. follows. Hex literals would have frozen the blue from v0.1.
 *
 *   `--cs-accent-warm` is intentionally NOT mapped: it is reserved for
 *   the one-emphasis-at-a-time pulse budget (spec §6). Using it as a
 *   group color would fight the emphasis system.
 *
 * Consumer layers: every caller of resolveColor today uses the result in
 * DOM inline styles, CSS custom properties, or SVG fill/stroke attributes.
 * All three resolve `var(...)` at paint time. Canvas 2D would not — if a
 * new canvas consumer needs a palette color, read it via cssVar() below
 * after calling resolveColor, or pull the --cs-* token directly.
 */

export const PALETTE_DEFAULTS: Record<string, string> = {
  'palette.primary': 'var(--cs-accent-cool)',
  'palette.secondary': 'var(--cs-accent-ok)',
  'palette.accent': 'var(--cs-accent-warn)',
};

/**
 * Resolve a color input — either a `palette.*` alias or a CSS color string —
 * to a concrete CSS color expression. Unknown aliases fall back to `fallback`;
 * any non-alias string is returned as-is so callers can pass `#ff6b6b`,
 * `rgb(...)`, or `var(--cs-*)` directly.
 *
 * `fallback` defaults to `var(--cs-ink-4)` so that missing/garbage input
 * still renders something visible and in-system rather than `undefined`.
 */
export function resolveColor(input?: string, fallback = 'var(--cs-ink-4)'): string {
  if (!input) return fallback;
  if (input.startsWith('palette.')) return PALETTE_DEFAULTS[input] ?? fallback;
  return input;
}

/**
 * Read a CSS custom property off `:root` and return its computed string.
 * For use from canvas 2D contexts (which cannot parse `var(...)`) and
 * anywhere else that needs a resolved color at paint time.
 *
 * Templates that opt into the lenzon/ui design-system accents call
 * this for `--cs-accent-warm` / `--cs-accent-cool` etc. at render time.
 * Returns `fallback` in non-browser contexts (SSR / tests).
 */
export function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

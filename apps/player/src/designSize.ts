/**
 * Canonical design-surface size that the player's visual templates are
 * authored against. Templates use absolute-pixel positioning (e.g.
 * `top: 260px`), so embedders must wrap `<Presentation>` in a fixed-size
 * box at these dimensions and scale it with a CSS transform to fit the
 * host container without overflow.
 *
 * Consumers that want to experiment pass a `designSize={{ width, height }}`
 * prop to HeroPlayer / GenerateFlow instead of editing this default.
 *
 * 1920×1080 is the single design surface used by both the hero embed and
 * the video-capture render path. Matching the recorder viewport
 * (1920×1080 in infra/workers/render/src/cli.ts) means templates author
 * 1:1 with captured pixels — no scale transform between author and
 * output. The scale math
 *   scale = min(box.width / design.width, box.height / design.height)
 * still applies for in-page hosts whose box is smaller than the design
 * surface (e.g. the landing-page hero card).
 */
export interface DesignSize {
  width: number;
  height: number;
}

export const DEFAULT_DESIGN_SIZE: DesignSize = {
  width: 1920,
  height: 1080,
};
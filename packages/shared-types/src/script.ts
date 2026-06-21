export type Persona = 'corporate' | 'character' | 'friendly' | 'stern';

export type AnalysisSection =
  | 'quickFacts'
  | 'architecture'
  | 'codeQuality'
  | 'plainEnglish'
  | 'health'
  | 'community';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  code: string;
}

export interface TransitionSpec {
  type: 'cut' | 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'dissolve';
  durationMs: number;
}

export interface VoiceConfig {
  provider: 'elevenlabs' | 'kokoro' | 'google-neural2' | 'google-chirp3' | 'stub';
  voiceId: string;
  /** 0.5 slow, 1.0 normal, 1.5 fast */
  speed: number;
}

export type BeatAction =
  | { type: 'emphasize'; target: string }
  | { type: 'highlight-line'; line: number }
  | { type: 'reveal'; index: number }
  | { type: 'annotate'; text: string; position: 'top' | 'bottom' | 'left' | 'right' }
  | { type: 'fx'; name: string; params?: Record<string, unknown> };

export interface Beat {
  /** Seconds after scene start */
  at: number;
  action: BeatAction;
}

/**
 * Primitive content is intentionally untyped in the shared contract.
 * The player narrows it against its template registry at runtime; the
 * server produces JSON that passes through. If you want strict typing
 * on the player side, import the player's TemplateContent and cast.
 */
export interface PrimitiveSpec {
  template: string;
  content: Record<string, unknown>;
}

export interface Scene {
  id: string;
  section: AnalysisSection;
  primitive: PrimitiveSpec;
  narration: string;
  /** Minimum seconds to hold the scene */
  holdSeconds: number;
  transition?: TransitionSpec;
  beats?: Beat[];
  /**
   * Absolute CDN URL to the pre-rendered narration MP3. Populated by the
   * audio render worker, never by Agent 2 — so it's absent while the
   * render is in flight, on legacy rows, and on rows whose render failed.
   * Consumers treat undefined as "fall back to live TTS."
   */
  narrationAudioUrl?: string;
  /**
   * Measured duration of narrationAudioUrl in ms. Only meaningful when
   * narrationAudioUrl is set; lets the voice player report
   * hasAccurateDuration synchronously.
   */
  narrationDurationMs?: number;
}

export type ScriptStatus = 'pending' | 'ready' | 'error';

/**
 * Pre-render lifecycle for a Script's narration MP3s. The pre-render
 * worker (apps/server/lib/audio/render-script-audio.ts) flips this
 * through pending → rendering → ready/failed. The player still plays
 * either way (it falls back to live TTS when narrationAudioUrl is
 * missing), but UI can use this to surface a banner when audio failed.
 */
export type AudioStatus = 'pending' | 'rendering' | 'ready' | 'failed';

/**
 * Persisted wrapper around a generated script. Scripts are stored
 * independently of their source analysis so a user can re-run ones
 * that work. `analysisId` is advisory — it records which analysis
 * produced this script, but the script remains loadable even if that
 * analysis row is later deleted.
 */
export interface ScriptRecord {
  id: string;
  analysisId: string | null;
  repoUrl: string;
  commitSha: string | null;
  label: string;
  persona: string;
  status: ScriptStatus;
  data: PresentationScript | null;
  focusInstructions: string | null;
  producerModel: string | null;
  /**
   * Cost info written at script-create time. New shape is the full
   * CostRollup (see apps/server/lib/costs/rollup.ts) — a discriminated
   * blob with `version: 1`, per-stage breakdown, and rolled-up totals
   * in tokens + USD. Older rows may still hold the legacy
   * `{ inputTokens, outputTokens }` shape, which callers should treat
   * as a producer-only snapshot. Clients can discriminate on the
   * presence of the `version` field. Kept loosely typed here so this
   * package doesn't depend on the server's cost module.
   */
  usage: Record<string, unknown> | null;
  /**
   * Producer fingerprint captured at script-create time. Combined with
   * `playerTemplateVersions` this is the "stack stamp" — what the
   * script was actually produced against. Studio compares this to the
   * currently deployed stamp (/api/stack-stamp) to surface drift. Null
   * on rows written before CS-versioning landed.
   */
  producerVersion: string | null;
  /**
   * Full template-id → version map as of script-create time. Stored as
   * the whole registry snapshot (not just the scenes' templates) so the
   * compare view can reason about templates the script didn't pick
   * but could have. Null on historical rows.
   */
  playerTemplateVersions: Record<string, string> | null;
  /**
   * State of the per-scene MP3 pre-render worker. Null on rows written
   * before audio persistence shipped. When 'failed', `audioError` carries
   * a short diagnostic message; on 'ready', `data.scenes[i].narrationAudioUrl`
   * is populated for each scene that had narration text.
   */
  audioStatus: AudioStatus | null;
  audioError: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight list entry for the scripts dropdown. Omits `data`. */
export interface ScriptSummary {
  id: string;
  analysisId: string | null;
  repoUrl: string;
  label: string;
  persona: string;
  status: ScriptStatus;
  /** Pulled from `data.meta.title` server-side; null on legacy/empty rows. */
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationScript {
  meta: {
    title: string;
    repoUrl: string;
    generatedAt: string;
    persona: Persona;
    estimatedDuration: number;
  };
  defaults: {
    palette: Palette;
    transition: TransitionSpec;
    voice: VoiceConfig;
  };
  scenes: Scene[];
}

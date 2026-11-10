/**
 * The PresentationScript format: what a producer emits and a player plays.
 *
 * This is the public contract. Lenzon's producer is one source of scripts,
 * and @lenzon/player is one player of them. Anything here is a public API,
 * so persistence and listing shapes live in @lenzon/shared-types instead.
 */

export type Persona = 'corporate' | 'character' | 'friendly' | 'stern';

/**
 * The sections of a code analysis, which Lenzon's pipeline uses to label
 * scenes. Listed for autocomplete only. The player never reads a section.
 */
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

/**
 * Voice providers Lenzon's own pipeline knows how to render. They are listed
 * for autocomplete only. A producer may name any other provider, because
 * voice is made by whoever renders the audio, not by the format.
 */
export type KnownVoiceProvider =
  | 'elevenlabs'
  | 'kokoro'
  | 'google-neural2'
  | 'google-chirp3'
  | 'stub';

export interface VoiceConfig {
  /**
   * Which service the narration is meant for. A free string, so a new
   * provider needs no format release. The `string & {}` keeps editors
   * suggesting the known names.
   */
  provider: KnownVoiceProvider | (string & {});
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
 * Primitive content is intentionally untyped in the format.
 * The player narrows it against its template registry at runtime; a
 * producer emits JSON that passes through. Each template documents its
 * own content slots.
 */
export interface PrimitiveSpec {
  template: string;
  content: Record<string, unknown>;
}

export interface Scene {
  id: string;
  /**
   * A label for which part of the story this scene tells. Optional, and a
   * free string, because a script need not be about code. The player
   * ignores it.
   */
  section?: AnalysisSection | (string & {});
  primitive: PrimitiveSpec;
  narration: string;
  /** Minimum seconds to hold the scene (actual = max(narrationDuration, holdSeconds)) */
  holdSeconds: number;
  transition?: TransitionSpec;
  beats?: Beat[];
  /**
   * Absolute CDN URL to the pre-rendered narration MP3. Set by whatever
   * renders audio, never by the producer — so it's absent while the
   * render is in flight, on legacy scripts, and when the render failed.
   * Players treat undefined as "fall back to live TTS."
   */
  narrationAudioUrl?: string;
  /**
   * Measured duration of narrationAudioUrl in ms. Only meaningful when
   * narrationAudioUrl is set; lets the voice player report
   * hasAccurateDuration synchronously.
   */
  narrationDurationMs?: number;
}

export interface PresentationScript {
  meta: {
    title: string;
    /** The repository a code explainer is about. Absent for any other subject. */
    repoUrl?: string;
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

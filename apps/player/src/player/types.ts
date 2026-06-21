/**
 * Contract between Agent 2 (Producer) and the Script Player.
 * Mirrors the schema in docs/ARCHITECTURE.md — kept loose on purpose
 * while we iterate on what actually feels right during playback.
 */

import type { TemplateContent } from '../templates/registry';

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

export interface PrimitiveSpec {
  template: string;
  content: TemplateContent;
}

export interface Scene {
  id: string;
  section: AnalysisSection;
  primitive: PrimitiveSpec;
  narration: string;
  /** Minimum seconds to hold the scene (actual = max(narrationDuration, holdSeconds)) */
  holdSeconds: number;
  transition?: TransitionSpec;
  beats?: Beat[];
  /**
   * Absolute CDN URL to the pre-rendered narration MP3. Populated by the
   * server's audio render worker, not by Agent 2 — absent while the render
   * is in flight, on legacy rows, and on rows whose render failed.
   * Consumers treat undefined as "fall back to live TTS."
   */
  narrationAudioUrl?: string;
  /**
   * Measured MP3 duration in ms. Only meaningful when narrationAudioUrl is
   * set; lets PrerenderedAudioVoicePlayer report hasAccurateDuration
   * synchronously before the element has loaded metadata.
   */
  narrationDurationMs?: number;
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

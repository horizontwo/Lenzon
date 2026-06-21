import type { Persona } from './script';

export interface UserSettings {
  /** 0.0 = non-technical, 1.0 = senior architect */
  audienceLevel: number;
  /** 0.0 = executive summary, 1.0 = deep dive */
  detailLevel: number;
  /** 0.0 = slow/deliberate, 1.0 = fast/dense */
  pace: number;
  persona: Persona;
  voice: {
    provider: 'stub' | 'elevenlabs' | 'kokoro' | 'google-neural2' | 'google-chirp3';
    voiceId: string;
    speed: number;
  };
  focusAreas?: string[];
}

export const defaultSettings: UserSettings = {
  audienceLevel: 0.5,
  detailLevel: 0.5,
  pace: 0.4,
  persona: 'friendly',
  voice: { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Erinome', speed: 1.0 },
};

/**
 * Curated voice catalog surfaced in the account settings UI (Chirp 3 HD plan,
 * Phase B.3). One source of truth for "which voices a user may pick" — the
 * synthesis core accepts any valid Google voice name, but the UI only offers
 * these. `provider` pairs with `voiceId` so a selection writes a complete
 * `voice` config. Chirp 3 HD is the generative tier (default); Neural-2 is the
 * "standard" tier kept so already-rendered Neural-2 audio stays addressable.
 */
export interface VoiceOption {
  provider: UserSettings['voice']['provider'];
  voiceId: string;
  /** Human label for the dropdown. */
  label: string;
  /** Tier grouping for the UI. */
  tier: 'hd' | 'standard';
}

export const VOICE_CATALOG: VoiceOption[] = [
  // Chirp 3: HD — Google's generative tier.
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Erinome', label: 'Erinome (HD)', tier: 'hd' },
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Achernar', label: 'Achernar (HD)', tier: 'hd' },
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Achird', label: 'Achird (HD)', tier: 'hd' },
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Algenib', label: 'Algenib (HD)', tier: 'hd' },
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Charon', label: 'Charon (HD)', tier: 'hd' },
  { provider: 'google-chirp3', voiceId: 'en-US-Chirp3-HD-Kore', label: 'Kore (HD)', tier: 'hd' },
  // Neural-2 — the standard tier.
  { provider: 'google-neural2', voiceId: 'en-US-Neural2-F', label: 'Neural2 F (standard)', tier: 'standard' },
  { provider: 'google-neural2', voiceId: 'en-US-Neural2-D', label: 'Neural2 D (standard)', tier: 'standard' },
];

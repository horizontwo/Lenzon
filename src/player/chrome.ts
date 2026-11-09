import introData from '../assets/lenzon_logo_intro.json';

export interface ChromeConfig {
  intro?: string | false;
  outro?: string | false;
}

let cachedIntroUrl: string | null = null;

/**
 * The intro Lottie ships bundled inside the player package as a JSON
 * module — works under both Vite (player standalone) and Webpack/Next
 * (server-embedded). At first use we materialize it as a Blob URL so
 * `dotlottie-web` can load it via its `src: URL` config. The Blob URL
 * lives for the lifetime of the page; one allocation per session.
 */
export function getDefaultIntroSrc(): string {
  if (cachedIntroUrl) return cachedIntroUrl;
  const blob = new Blob([JSON.stringify(introData)], { type: 'application/json' });
  cachedIntroUrl = URL.createObjectURL(blob);
  return cachedIntroUrl;
}

export function getDefaultOutroSrc(): string | null {
  // Asset doesn't exist yet — when it lands, mirror getDefaultIntroSrc.
  return null;
}

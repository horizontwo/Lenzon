type DotLottieCtor = typeof import('@lottiefiles/dotlottie-web').DotLottie;

let modulePromise: Promise<{ DotLottie: DotLottieCtor } | null> | null = null;

function loadModule(): Promise<{ DotLottie: DotLottieCtor } | null> {
  if (!modulePromise) {
    modulePromise = import('@lottiefiles/dotlottie-web')
      .then((m) => ({ DotLottie: m.DotLottie }))
      .catch((err) => {
        console.warn('[showboxes] @lottiefiles/dotlottie-web missing — chrome layer disabled', err);
        return null;
      });
  }
  return modulePromise;
}

export interface LottieOverlayOptions {
  /**
   * Composite the overlay over the live scene beneath it (intro): the host
   * chrome layer is made transparent via the `is-intro` class so the
   * already-rendered title card shows through. Defaults to false, which
   * keeps the opaque chrome background used by the outro.
   */
  transparent?: boolean;
}

export class LottieOverlay {
  private readonly host: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private instance: { play: () => void; pause: () => void; destroy: () => void } | null = null;
  private destroyed = false;
  private readonly onComplete: () => void;
  private readonly transparent: boolean;

  constructor(
    host: HTMLElement,
    src: string,
    onComplete: () => void,
    options: LottieOverlayOptions = {}
  ) {
    this.host = host;
    this.onComplete = onComplete;
    this.transparent = options.transparent ?? false;

    void loadModule().then((mod) => {
      if (this.destroyed) return;
      if (!mod) {
        // Package or asset unavailable — advance immediately so playback continues.
        this.onComplete();
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      this.host.appendChild(canvas);
      this.canvas = canvas;
      this.host.classList.add('is-active');
      if (this.transparent) this.host.classList.add('is-intro');

      try {
        const dot = new mod.DotLottie({
          canvas,
          src,
          autoplay: true,
          loop: false,
        });
        dot.addEventListener('complete', () => {
          if (this.destroyed) return;
          this.onComplete();
        });
        dot.addEventListener('loadError', () => {
          if (this.destroyed) return;
          this.onComplete();
        });
        this.instance = dot;
      } catch (err) {
        console.warn('[showboxes] LottieOverlay init failed', err);
        this.onComplete();
      }
    });
  }

  pause(): void {
    this.instance?.pause();
  }

  resume(): void {
    this.instance?.play();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.instance?.destroy();
    } catch {
      // ignore
    }
    this.instance = null;
    if (this.canvas && this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
    this.canvas = null;
    this.host.classList.remove('is-active');
    this.host.classList.remove('is-intro');
  }
}

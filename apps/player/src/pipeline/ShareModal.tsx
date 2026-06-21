import { useEffect, useState } from 'react';
import { shareScript, type ShareVisibility } from './api';

interface ShareModalProps {
  scriptId: string;
  onClose: () => void;
  /**
   * Voice provider to encode in the share URL's `?voice=` param so shared
   * playback uses the script's actual voice. Defaults to the system default
   * (Chirp 3 HD) when the caller doesn't know the script's voice (e.g. the
   * runs-list share button, which only has a script id).
   */
  voiceProvider?: 'google-neural2' | 'google-chirp3';
}

type Choice = 'unlisted' | 'public';

interface ShareLink {
  url: string;
  visibility: ShareVisibility;
}

/**
 * Share modal for the generate-flow player. Two choices:
 *   - "Create share link" → flips visibility to 'unlisted', mints/reuses
 *     a shareToken, returns a /viewer/:id?token=... link.
 *   - "Make public"        → flips visibility to 'public', returns a
 *     plain /viewer/:id link (no token, anyone on the internet can watch).
 *
 * The link renders inline, click-to-copy. We don't auto-flip on mount —
 * the user picks a choice first so we don't change DB state silently.
 */
export function ShareModal({
  scriptId,
  onClose,
  voiceProvider = 'google-chirp3',
}: ShareModalProps) {
  const [choice, setChoice] = useState<Choice>('unlisted');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const h = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(h);
  }, [copied]);

  // Resetting the link when the user toggles between choices avoids
  // showing a stale unlisted URL after they've picked Public (or vice
  // versa). They have to re-confirm with the button.
  useEffect(() => {
    setLink(null);
    setError(null);
  }, [choice]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await shareScript(scriptId, choice);
      const origin = window.location.origin;
      const url =
        res.visibility === 'unlisted' && res.shareToken
          ? `${origin}/viewer/${res.id}?token=${encodeURIComponent(res.shareToken)}&voice=${voiceProvider}`
          : `${origin}/viewer/${res.id}?voice=${voiceProvider}`;
      setLink({ url, visibility: res.visibility });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!link) return;
    navigator.clipboard
      ?.writeText(link.url)
      .then(() => setCopied(true))
      .catch(() => setError('Copy failed — select and copy manually.'));
  };

  return (
    <div className="sb-modal-backdrop" onClick={onClose}>
      <div className="sb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sb-modal-header">
          <h2>Share this run</h2>
          <button className="sb-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="sb-modal-section">
          <div className="sb-modal-section-label">Visibility</div>
          <div className="sb-modal-modes">
            <ChoiceCard
              selected={choice === 'unlisted'}
              title="Create share link"
              hint="Anyone with the link can watch. Not listed publicly."
              onClick={() => setChoice('unlisted')}
            />
            <ChoiceCard
              selected={choice === 'public'}
              title="Make public"
              hint="Anyone on the internet can watch. No token required."
              onClick={() => setChoice('public')}
            />
          </div>
        </div>

        <div className="sb-modal-section">
          <button
            className="sb-modal-primary"
            onClick={generate}
            disabled={busy}
          >
            {busy
              ? 'Working\u2026'
              : link
                ? 'Regenerate link'
                : choice === 'public'
                  ? 'Make public & get link'
                  : 'Create link'}
          </button>
        </div>

        {link && (
          <div className="sb-modal-section">
            <div className="sb-modal-section-label">
              {link.visibility === 'public' ? 'Public link' : 'Share link'}
            </div>
            <button
              type="button"
              className="sb-share-link"
              onClick={copy}
              title="Click to copy"
            >
              {link.url}
            </button>
            <div className="sb-share-hint">
              {copied ? 'Copied to clipboard' : 'Click to copy'}
            </div>
          </div>
        )}

        {error && (
          <div className="sb-modal-section">
            <div className="sb-modal-error">{error}</div>
          </div>
        )}

        <div className="sb-modal-footer">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

interface ChoiceCardProps {
  selected: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}

function ChoiceCard({ selected, title, hint, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      className={`sb-modal-mode ${selected ? 'sb-modal-mode-selected' : ''}`}
      onClick={onClick}
    >
      <div className="sb-modal-mode-title">{title}</div>
      <div className="sb-modal-mode-hint">{hint}</div>
    </button>
  );
}

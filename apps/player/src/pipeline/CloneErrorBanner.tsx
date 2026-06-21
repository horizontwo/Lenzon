import type { CloneError } from './api';
import { viewForCloneError, type CloneErrorAction } from './clone-errors';

interface Props {
  error: CloneError;
  /** The repo URL the user submitted, used to prefill the analyze page on reconnect. */
  repoUrl: string | null | undefined;
  /** "Try again" handler — when provided, an inline ghost button is rendered. */
  onRetry?: () => void;
  /** "Dismiss"/back-to-input handler — when provided, an inline ghost button is rendered. */
  onDismiss?: () => void;
}

function ActionLink({
  action,
  variant,
}: {
  action: CloneErrorAction;
  variant: 'primary' | 'ghost';
}) {
  const cls =
    variant === 'primary' ? 'sb-generate-primary' : 'sb-generate-ghost';
  if (action.external) {
    return (
      <a
        className={cls}
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {action.label}
      </a>
    );
  }
  return (
    <a className={cls} href={action.href}>
      {action.label}
    </a>
  );
}

export function CloneErrorBanner({ error, repoUrl, onRetry, onDismiss }: Props) {
  const view = viewForCloneError(error, repoUrl);
  const runId = view.showRunId ? error.detail.runId : undefined;

  return (
    <section
      className="sb-generate-card sb-generate-clone-error"
      role="alert"
      aria-live="polite"
    >
      <h2 className="sb-generate-card-title">{view.title}</h2>
      <p className="sb-generate-card-hint">{view.body}</p>
      {runId && (
        <p className="sb-generate-card-hint">
          Run id: <code>{runId}</code>
        </p>
      )}
      <div className="sb-generate-clone-error-actions">
        {view.primary && <ActionLink action={view.primary} variant="primary" />}
        {view.secondary && (
          <ActionLink action={view.secondary} variant="ghost" />
        )}
        {onRetry && (
          <button className="sb-generate-ghost" onClick={onRetry}>
            Try again
          </button>
        )}
        {onDismiss && (
          <button className="sb-generate-ghost" onClick={onDismiss}>
            Back
          </button>
        )}
      </div>
    </section>
  );
}

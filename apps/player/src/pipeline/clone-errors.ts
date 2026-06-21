import type { CloneError } from './api';

export interface CloneErrorAction {
  label: string;
  href: string;
  /** When true, opens in a new tab (target="_blank" with rel=noopener). */
  external?: boolean;
}

export interface CloneErrorView {
  title: string;
  body: string;
  /** Primary action (e.g. "Connect GitHub"). Null when there's no recovery action. */
  primary: CloneErrorAction | null;
  /** Secondary action — only used by the org-access flow today. */
  secondary?: CloneErrorAction;
  /** When true, also render the runId for support requests. */
  showRunId?: boolean;
}

/**
 * Build the OAuth-start URL with returnTo set to the analyze page (with
 * the repo URL prefilled). The server's `/oauth/github/start` already
 * validates returnTo via safeReturnTo; the callback redirects there.
 */
function reconnectUrl(repoUrl: string | null | undefined): string {
  const returnTo = repoUrl
    ? `/generate?repoUrl=${encodeURIComponent(repoUrl)}`
    : '/generate';
  return `/oauth/github/start?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Map a CloneError to the copy + action(s) the banner renders. Falls back
 * to a generic "something went wrong" panel when the code isn't in the
 * recognized set, so the banner is the single user-facing surface for
 * every clone failure (no codes leak through as raw strings).
 */
export function viewForCloneError(
  err: CloneError,
  repoUrl: string | null | undefined,
): CloneErrorView {
  const { code } = err.detail;

  switch (code) {
    case 'connection_required':
      return {
        title: 'Connect GitHub to continue',
        body: 'This is a private repo. Connect your GitHub account so Lenzon can clone it.',
        primary: { label: 'Connect GitHub', href: reconnectUrl(repoUrl) },
      };

    case 'connection-expired':
      return {
        title: 'Your GitHub connection expired',
        body: 'Reconnect GitHub to continue. We never write to your repos — Lenzon only reads source for analysis.',
        primary: { label: 'Reconnect GitHub', href: reconnectUrl(repoUrl) },
      };

    case 'org_access_required': {
      const owner = err.detail.owner ? `the ${err.detail.owner} organization` : 'this organization';
      const approveUrl = err.detail.approveUrl;
      return {
        title: 'GitHub OAuth app needs org access',
        body: `Your GitHub OAuth app doesn't have access to ${owner}. Approve it (or SSO-authorize the token) on GitHub, then try again.`,
        primary: approveUrl
          ? { label: 'Approve access on GitHub', href: approveUrl, external: true }
          : null,
      };
    }

    case 'repo_not_found':
    case 'repo-not-found':
      return {
        title: "We couldn't access that repo",
        body: 'Check the URL, or check that your GitHub connection has permission to read it.',
        primary: null,
      };

    case 'repo-too-large':
      return {
        title: 'That repo is too large',
        body: "It's over 2 GB after a shallow clone. Lenzon doesn't support repos that large yet.",
        primary: null,
      };

    case 'unsupported-host':
      return {
        title: 'Host not supported yet',
        body: "Lenzon only supports github.com for now. GitLab, Bitbucket, and Azure DevOps are on the roadmap.",
        primary: null,
      };

    case 'malformed-url':
      return {
        title: "That doesn't look like a GitHub URL",
        body: 'Paste the URL exactly as it appears in your browser, e.g. https://github.com/owner/repo.',
        primary: null,
      };

    case 'too_many_active_runs': {
      const cap = err.detail.cap ?? 2;
      return {
        title: 'Too many clones in flight',
        body: `You already have ${cap} clones running. Wait for one to finish and try again.`,
        primary: null,
      };
    }

    case 'too_many_cluster_runs':
      return {
        title: 'Lenzon is busy right now',
        body: 'A lot of repos are being cloned at once. Give it a minute and try again.',
        primary: null,
      };

    case 'enqueue_failed':
    case 'clone-timeout':
    case 'clone-failed':
    case 'upload-failed':
    case 'clone-wait-timeout':
    default:
      return {
        title: 'Something went wrong cloning that repo',
        body: 'Try again — if it keeps happening, share the run id with support.',
        primary: null,
        showRunId: true,
      };
  }
}

// Shared formatting helpers for run rows. Used by both the in-page
// "Your recent runs" card on /generate and the full /runs page.

export function parseRepoName(url: string): string {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
  if (!m) return url;
  return `${m[1]}/${m[2].replace(/\.git$/, '')}`;
}

export function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)}w ago`;
  if (diffDay < 365) return `${Math.round(diffDay / 30)}mo ago`;
  return `${Math.round(diffDay / 365)}y ago`;
}

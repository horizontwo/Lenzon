/**
 * Parse a PR reference the user pastes into the test harness. Accepts the two
 * shapes a developer naturally has on the clipboard:
 *
 *   https://github.com/owner/repo/pull/123   (full PR URL, query/hash tolerated)
 *   owner/repo#123                            (shorthand)
 *
 * Returns { repoFullName, prNumber } or null. GitHub-only (v1).
 */
export interface ParsedPrRef {
  repoFullName: string;
  prNumber: number;
}

export function parsePrRef(input: string): ParsedPrRef | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();

  // Shorthand: owner/repo#123
  const shorthand = raw.match(/^([^/\s]+)\/([^/\s#]+)#(\d+)$/);
  if (shorthand) {
    const [, owner, repo, num] = shorthand;
    return finish(owner, repo, num);
  }

  // Full URL: https://github.com/owner/repo/pull/123
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const segs = url.pathname.split('/').filter(Boolean);
  // [owner, repo, "pull", number]
  const pullIdx = segs.indexOf('pull');
  if (pullIdx !== 2 || pullIdx + 1 >= segs.length) return null;
  return finish(segs[0], segs[1], segs[pullIdx + 1]);
}

function finish(owner: string, repo: string, num: string): ParsedPrRef | null {
  const stripGit = repo.endsWith('.git') ? repo.slice(0, -4) : repo;
  const prNumber = Number(num);
  if (!owner || !stripGit || !Number.isInteger(prNumber) || prNumber <= 0) {
    return null;
  }
  return { repoFullName: `${owner}/${stripGit}`, prNumber };
}

/**
 * Phase 7 (§11.3) — the sidebar's single input box, auto-detecting PR vs. repo
 * exactly as lenzon.ai's `/generate` does. A PR ref → an in-panel scan; a repo
 * URL → a deep-link out to `/generate` (full-repo scans stay out of the
 * extension — §0.1, OQ#2). GitHub-only (v1).
 *
 *   PR:   github.com/owner/repo/pull/123  |  owner/repo#123
 *   repo: github.com/owner/repo           |  owner/repo  |  the *.git clone URL
 */
export type PrOrRepoInput =
  | { kind: 'pr'; owner: string; repo: string; prNumber: number }
  | { kind: 'repo'; owner: string; repo: string; repoUrl: string }
  | { kind: 'invalid' };

export function parsePrOrRepoInput(input: string): PrOrRepoInput {
  if (!input || typeof input !== 'string') return { kind: 'invalid' };
  const raw = input.trim();

  // A PR ref wins if it parses as one (it's the more specific shape).
  const pr = parsePrRef(raw);
  if (pr) {
    const [owner, repo] = pr.repoFullName.split('/');
    return { kind: 'pr', owner, repo, prNumber: pr.prNumber };
  }

  const repo = parseRepoOnly(raw);
  if (repo) {
    return {
      kind: 'repo',
      owner: repo.owner,
      repo: repo.repo,
      repoUrl: `https://github.com/${repo.owner}/${repo.repo}`,
    };
  }

  return { kind: 'invalid' };
}

/** Parse `owner/repo`, a GitHub repo URL, or an https clone URL → {owner, repo}. */
function parseRepoOnly(raw: string): { owner: string; repo: string } | null {
  const strip = (s: string) => (s.endsWith('.git') ? s.slice(0, -4) : s);

  // Bare shorthand: owner/repo (no scheme, no #, no extra path). Restrict to
  // GitHub's allowed owner/repo character set so SCP-style SSH strings
  // (git@github.com:owner/repo) and other junk don't masquerade as a repo.
  const bare = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (bare) {
    const owner = bare[1];
    const repo = strip(bare[2]);
    return owner && repo ? { owner, repo } : null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const segs = url.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  // Reject if it's really a PR/issue/tree path masquerading as a repo.
  const repo = strip(segs[1]);
  if (!segs[0] || !repo) return null;
  return { owner: segs[0], repo };
}

/**
 * Parse a full GitHub PR URL into its repoUrl + prNumber parts, e.g.
 *   https://github.com/microsoft/vscode/pull/320782
 *     → { repoUrl: 'https://github.com/microsoft/vscode', prNumber: 320782 }
 *
 * Tolerates trailing path/query/hash (e.g. `…/pull/123/files`, `…/pull/123?diff=split`).
 * Returns null for anything that isn't a recognizable github.com PR URL —
 * callers distinguish "this is a PR" from "this is a repo / not a URL".
 *
 * Shared by the customer /generate flow (GenerateFlow) and the internal
 * studio2 PR tab (ToolbarPr) so the detection logic stays in one place.
 */
export function parsePrUrl(
  input: string,
): { repoUrl: string; prNumber: number } | null {
  const match = input
    .trim()
    .match(
      /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
    );
  if (!match) return null;
  const [, owner, repo, num] = match;
  const prNumber = Number(num);
  if (!Number.isInteger(prNumber) || prNumber <= 0) return null;
  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    prNumber,
  };
}

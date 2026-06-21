import * as vscode from 'vscode';

/**
 * Phase 1 — git + repo detection.
 *
 * Read the workspace's git remote and parse it into { owner, repo }. We use
 * VS Code's built-in git extension API (the `vscode.git` extension's exported
 * API) as the source of truth rather than shelling out to `git`: it's the
 * native, already-running source for the workspace's repositories and remotes,
 * needs no `git` on PATH, and tracks repo open/close for free.
 *
 * v1 is GitHub-only by design (see the plan §0.1). A non-GitHub remote is a
 * recognised, clearly-messaged dead end — not a crash.
 */

export interface GitHubRepo {
  owner: string;
  repo: string;
  /** "owner/repo" — the shape the player-link contract wants (plan §3a). */
  fullName: string;
}

export interface WorkspaceGitContext {
  repo: GitHubRepo;
  remoteUrl: string;
  /** Current branch name, or undefined on a detached HEAD (Risk 2). */
  branch?: string;
  /** Current HEAD commit sha, if known. Lets the service fall back to a
   * SHA-based run lookup when there's no open PR for the branch. */
  headSha?: string;
}

export type RepoDetection =
  | ({ kind: 'ok' } & WorkspaceGitContext)
  | { kind: 'no-git-extension' }
  | { kind: 'no-repo' }
  | { kind: 'no-remote' }
  | { kind: 'not-github'; remoteUrl: string };

// --- VS Code git extension API (minimal typings) -------------------------
// We type only the slice we use. The full API lives in the vscode.git
// extension; importing its .d.ts would couple us to its build, so we declare
// the surface we touch.
interface GitRemote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}
interface GitBranchState {
  /** Branch name; undefined on a detached HEAD. */
  readonly name?: string;
  /** Current commit sha. */
  readonly commit?: string;
}
interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly remotes: GitRemote[];
    readonly HEAD?: GitBranchState;
  };
}
interface GitAPI {
  readonly repositories: GitRepository[];
  getRepository(uri: vscode.Uri): GitRepository | null;
  /** Fires as the Git extension discovers repositories in the workspace. */
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
}
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

async function getGitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : await ext.activate();
  return exports.getAPI(1);
}

/**
 * Subscribe to "the workspace's git context might have changed" — chiefly the
 * Git extension finishing repo discovery *after* our extension activated. At
 * startup `vscode.git` often hasn't found the workspace repos yet, so an early
 * `detectRepoFromWorkspace()` reports "no repo" until something else nudges the
 * Git extension (the symptom: the sidebar looks repo-less until you click the
 * Explorer). Listening for `onDidOpenRepository` lets a surface re-render the
 * moment a repo actually appears.
 *
 * `listener` may fire 0+ times. The returned Disposable detaches it. Safe to
 * call when the Git extension is absent — it just never fires.
 */
export async function onGitContextChanged(
  listener: () => void,
): Promise<vscode.Disposable> {
  const api = await getGitApi();
  if (!api) return { dispose() {} };
  return api.onDidOpenRepository(() => listener());
}

/**
 * Pick the most relevant repository: the one containing the active editor's
 * file if any, else the first repository the git extension knows about.
 */
function pickRepository(api: GitAPI): GitRepository | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const repo = api.getRepository(activeUri);
    if (repo) return repo;
  }
  return api.repositories[0];
}

/**
 * Choose which remote to resolve from. Prefer `origin` (the overwhelming
 * convention); fall back to the first remote that has a URL at all.
 */
function pickRemoteUrl(repo: GitRepository): string | undefined {
  const remotes = repo.state.remotes;
  const origin = remotes.find((r) => r.name === 'origin');
  const chosen = origin ?? remotes.find((r) => r.fetchUrl ?? r.pushUrl);
  return chosen?.fetchUrl ?? chosen?.pushUrl ?? undefined;
}

export async function detectRepoFromWorkspace(): Promise<RepoDetection> {
  const api = await getGitApi();
  if (!api) return { kind: 'no-git-extension' };

  const repo = pickRepository(api);
  if (!repo) return { kind: 'no-repo' };

  const remoteUrl = pickRemoteUrl(repo);
  if (!remoteUrl) return { kind: 'no-remote' };

  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) return { kind: 'not-github', remoteUrl };

  const head = repo.state.HEAD;
  return {
    kind: 'ok',
    repo: parsed,
    remoteUrl,
    branch: head?.name, // undefined on detached HEAD (Risk 2)
    headSha: head?.commit,
  };
}

/**
 * Parse a GitHub remote URL into { owner, repo, fullName }, or null if it
 * isn't a GitHub remote. Handles the three forms a real `git remote` produces:
 *
 *   https://github.com/owner/repo(.git)
 *   git@github.com:owner/repo(.git)              (SSH — the common local case)
 *   ssh://git@github.com/owner/repo(.git)
 *
 * Mirrors the server's parseRepoUrl shape (apps/server/lib/provider/url-parser.ts)
 * but ADDS the SSH forms, which that parser deliberately rejects — a webview
 * extension reads whatever `origin` actually is, and locally that's usually SSH.
 */
export function parseGitHubRemote(input: string): GitHubRepo | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();

  const stripGit = (s: string) => (s.endsWith('.git') ? s.slice(0, -4) : s);
  const finish = (owner: string, repo: string): GitHubRepo | null => {
    owner = owner.replace(/^\/+|\/+$/g, '');
    repo = stripGit(repo).replace(/^\/+|\/+$/g, '');
    if (!owner || !repo) return null;
    return { owner, repo, fullName: `${owner}/${repo}` };
  };

  // SCP-like SSH form: git@github.com:owner/repo.git
  const scp = raw.match(/^[^@]+@([^:]+):(.+)$/);
  if (scp) {
    const [, host, path] = scp;
    if (host.toLowerCase() !== 'github.com') return null;
    const segs = path.split('/').filter(Boolean);
    if (segs.length < 2) return null;
    return finish(segs[0], segs[1]);
  }

  // URL forms: https://, http://, ssh://
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const segs = url.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  return finish(segs[0], segs[1]);
}

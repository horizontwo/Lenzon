# Change Log

## 0.0.1

Initial release.

- **Explain this PR in the editor.** `Lenzon: Explain this PR` detects the
  workspace's GitHub repo and current branch, resolves the matching pull-request
  explainer, and plays the narrated walkthrough in a panel beside your code.
- **Sign in once.** `Lenzon: Sign in` uses a device-code flow against your
  Lenzon account; the token is stored securely in VS Code SecretStorage.
- **Graceful fallbacks.** Multiple open PRs for a branch → a picker; no open PR
  or detached HEAD → a list of PRs Lenzon has already analyzed for the repo.
- **Themed states.** Loading, "still analyzing," error, and a first-run empty
  state that links out to a full-repo scan on lenzon.ai — all rendered to match
  your VS Code light/dark theme.

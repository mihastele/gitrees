# Gitrees

A local, read-only Git history explorer for a repository and its initialized submodules.

## Run

Requires Node.js 18+ and Git on your PATH.

```sh
npm start
```

Open http://127.0.0.1:4173 and enter a local repository path. Select repositories in the sidebar, search commits, and click a commit to inspect its patch. History refreshes every 15 seconds while the tab is visible. Up to 200 commits per selected repository are loaded. Submodules must be initialized to appear in history; uninitialized submodules are shown disabled.

The server listens only on localhost. It reads repository data with Git and does not modify repositories.

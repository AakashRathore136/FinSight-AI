# Release Process

Releases are fully automated via the `.github/workflows/release.yml` GitHub
Actions workflow. There are no manual tagging or changelog steps.

## How to cut a release

1. Go to **Actions → Release** in the GitHub UI.
2. Click **Run workflow**.
3. Choose the bump type:
   - `patch` — bug fixes, no breaking/behavior changes
   - `minor` — new backwards-compatible features
   - `major` — breaking changes
4. Click **Run workflow** to start.

## What happens automatically

1. **Version determination** — the workflow reads the latest `vX.Y.Z` tag
   and computes the next version based on the bump type you chose.
2. **Duplicate guard** — if the computed tag already exists, the workflow
   fails immediately instead of creating a conflicting release.
3. **Build** — a Docker image is built from the repo's `Dockerfile` and
   pushed to GHCR as `ghcr.io/<owner>/finsight-ai:vX.Y.Z` (and `:latest`).
   If the build fails, the workflow stops here and **no tag or release is
   created**.
4. **Tag + Release** — only after a successful image build/push:
   - a new Git tag (`vX.Y.Z`) is created and pushed
   - release notes are auto-generated from merged PRs since the last tag
   - a GitHub Release is published with those notes, plus the image tag
     and a ready-to-run `docker pull` / `docker run` command in the body

## Notes

- This workflow only runs on manual `workflow_dispatch` — it never runs on
  pull requests or normal pushes, so it has no effect on existing CI.
- Auto-generated release notes are based on PR titles/labels merged since
  the previous tag. For best results, keep PR titles descriptive and use
  labels (e.g. `bug`, `enhancement`) — GitHub groups notes by label.
- Pulling a released image:
  ```bash
  docker pull ghcr.io/<owner>/finsight-ai:vX.Y.Z
  ```
- The workflow authenticates to GHCR with the built-in `GITHUB_TOKEN`, so
  no extra secrets are needed. Make sure the repo's package visibility
  (Settings → Packages) is set the way you want (public/private) after
  the first image is published — new packages default to private.
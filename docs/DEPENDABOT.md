# Dependabot Configuration

This project uses [GitHub Dependabot](https://docs.github.com/en/code-security/dependabot)
to automatically monitor and update project dependencies and GitHub Actions workflows.

Configuration lives at `.github/dependabot.yml`.

## What It Monitors

| Ecosystem       | Directory | Schedule        | PR Limit |
|-----------------|-----------|------------------|----------|
| npm             | `/`       | Weekly (Monday)  | 5        |
| GitHub Actions  | `/`       | Weekly (Monday)  | 3        |

## npm Dependencies

- Tracks `package.json` / `package-lock.json` for outdated or vulnerable packages.
- Updates are grouped into two batches to reduce PR noise:
  - **production-dependencies** — minor and patch updates to runtime dependencies
  - **development-dependencies** — minor and patch updates to dev-only dependencies
- Major version bumps are **not** grouped, so they open as individual PRs for manual review.
- Security advisories are surfaced as PRs immediately, independent of the weekly schedule.

### Ignored Updates

Some packages are pinned against automatic major-version bumps because they require
coordinated migration work:

- `react` (major versions)
- `react-dom` (major versions)

To adjust this list, edit the `ignore` block in `.github/dependabot.yml`.

## GitHub Actions

- Tracks action versions referenced in `.github/workflows/*.yml`.
- All Actions updates are grouped into a single weekly PR (`github-actions` group) to keep
  CI change history clean.

## Adjusting the Configuration

Common changes:

- **Change PR volume**: edit `open-pull-requests-limit` per ecosystem.
- **Add/remove ignored packages**: edit the `ignore` list under the `npm` block.
- **Change grouping**: edit or remove entries under `groups`.
- **Change schedule**: edit `schedule.interval` (`daily`, `weekly`, `monthly`) or `schedule.day`.

See the [Dependabot configuration reference](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
for the full set of options.

## Related Workflows

Dependabot is independent of, and does not affect, the existing:

- `ci.yml` — build/test pipeline
- `codeql.yml` — static security analysis (see `docs/CODEQL.md`)
- `pr-title-check.yml` — PR title linting

Dependabot PRs are subject to the same CI checks as any other pull request before merge.
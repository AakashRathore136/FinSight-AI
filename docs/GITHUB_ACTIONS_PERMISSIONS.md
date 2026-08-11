# GitHub Actions Permissions Policy

This repository follows least-privilege permissions for all workflows.

## Policy
- Every workflow defines explicit top-level `permissions`.
- Default is `contents: read`.
- Write scopes are granted only at the job level, only to jobs that need them.
- `permissions: write-all` is never used.

## Permission reference

| Workflow | Job | Permissions | Reason |
|---|---|---|---|
| ci.yml | quality | contents: read | checkout, lint, build only |
| codeql.yml | analyze | contents: read, actions: read, security-events: write | uploads CodeQL results |
| deploy.yml | ci | contents: read | checkout, test |
| deploy.yml | deploy | contents: read | checkout, deploy via env secrets |
| pr-title-check.yml | check-title | contents: read, pull-requests: read | reads PR title only |
| sbom.yml | sbom | contents: read, actions: read, id-token: write, attestations: write | signs build provenance |
| stale.yml | stale | issues: write, pull-requests: write | labels/closes stale issues+PRs |
| validate-workflows.yml | validate | contents: read | lints workflow YAML |
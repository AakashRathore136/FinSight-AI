# Container Security Scanning

## Overview

This repository uses a dedicated GitHub Actions workflow, [`container-security.yml`](../.github/workflows/container-security.yml), to automatically build the project's container image and scan it for known vulnerabilities before it can be used or published.

The workflow uses [Trivy](https://github.com/aquasecurity/trivy), a maintained open-source container vulnerability scanner, to detect known CVEs in OS packages and application dependencies baked into the image.

## Why

Containerized applications inherit vulnerabilities from their base image and installed packages. Without automated scanning, these vulnerabilities can go unnoticed until they're exploited in production. This workflow catches them early, in CI, before an image is ever pushed anywhere.

## What it does

1. **Builds** the application's Docker image locally using the repository's `Dockerfile`. The image is built with `load: true` and is never pushed to any container registry.
2. **Scans** the built image with Trivy across all severities (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) for visibility.
3. **Reports**:
   - A human-readable summary table is written to the GitHub Actions job summary for every run.
   - A SARIF report is uploaded to the repository's **Security → Code scanning alerts** tab, so vulnerabilities are tracked over time alongside other security tooling (e.g. CodeQL).
   - Full scan output (SARIF + table) is attached as a downloadable workflow artifact, retained for 30 days.
4. **Enforces a severity gate**: the workflow fails if any vulnerability at or above `CRITICAL` severity is found, blocking the PR/pipeline from proceeding.

## Triggers

The workflow runs on:

| Event | Scope |
|---|---|
| `pull_request` | Targeting `main`, only when relevant paths change |
| `push` | To `main`, only when relevant paths change |
| `workflow_dispatch` | Manual run, any time, from the Actions tab |

### Path filters

The workflow only runs when one of the following changes:

```
Dockerfile
docker-compose.yml
.dockerignore
package.json
package-lock.json
src/**
api/**
.github/workflows/container-security.yml
```

This avoids running an image build + scan on unrelated changes (e.g. docs-only PRs).

## Severity threshold

The failure threshold is controlled by the `SEVERITY_THRESHOLD` environment variable at the top of the workflow file:

```yaml
env:
  SEVERITY_THRESHOLD: CRITICAL
```

Currently set to `CRITICAL` only. To be stricter (e.g. also fail on `HIGH`), update this to:

```yaml
SEVERITY_THRESHOLD: HIGH,CRITICAL
```

## Viewing results

- **Per-run summary**: Open the workflow run under the **Actions** tab → the Trivy table appears directly in the run summary.
- **Historical tracking**: Go to the repo's **Security** tab → **Code scanning alerts** to see vulnerabilities tracked across runs, deduplicated and with status (open/fixed).
- **Raw output**: Download the `trivy-scan-results` artifact from any workflow run for the full SARIF and table output.

## Local reproduction

To reproduce a scan locally before pushing:

```bash
docker build -t finsight-ai:local .
trivy image finsight-ai:local
```

Install Trivy locally via the [official installation guide](https://aquasecurity.github.io/trivy/latest/getting-started/installation/).

## Related workflows

- [`CODEQL.md`](./CODEQL.md) — static code analysis
- [`DEPENDABOT.md`](./DEPENDABOT.md) — dependency update automation
- [`SBOM.md`](./SBOM.md) — software bill of materials generation
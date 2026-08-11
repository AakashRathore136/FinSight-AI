# CI Diagnostics

The FinSight-AI CI workflow provides structured job summaries and failure diagnostics to make GitHub Actions failures easier to understand and troubleshoot.

## CI Job Summary

Each CI run generates a summary in the GitHub Actions job summary.

The summary includes:

* Workflow name and run number
* Node.js version
* npm version
* Overall CI job result
* The major CI stages:

  * TypeScript type checking
  * Linting
  * Production build

The summary is generated even when a CI stage fails.

## Failure Diagnostics

When a CI stage fails, a dedicated failure-diagnostics step runs automatically using `if: failure()`.

The diagnostics provide:

* Node.js and npm versions
* Runner operating system
* Guidance for troubleshooting dependency, TypeScript, lint, and build failures
* A reminder to inspect the failed workflow step for the original error

Diagnostics do not replace or modify the original failure.

## Security

The diagnostics are designed to avoid exposing secrets or sensitive environment variables.

Only non-sensitive environment information required for troubleshooting is included in the job summary.

## Workflow Behavior

The existing CI stages and their execution order are preserved:

1. Install dependencies
2. TypeScript type check
3. Lint
4. Build
5. Generate CI summary
6. Generate failure diagnostics when a previous stage fails

The diagnostics steps are informational and do not mask the original CI failure.

# CodeQL Security Analysis

This repository uses [GitHub CodeQL](https://codeql.github.com/) to automatically scan the JavaScript/TypeScript codebase for security vulnerabilities and code quality issues.

## Purpose

CodeQL performs static analysis to catch issues such as:

- SQL Injection
- Cross-Site Scripting (XSS)
- Prototype Pollution
- Path Traversal
- Command Injection
- Unsafe Deserialization
- Insecure dependency usage
- Authentication/authorization flaws
- Hardcoded secrets (where detectable)

It runs the `security-and-quality` query pack, which covers both security vulnerabilities and general code quality problems.

## When it runs

The `codeql.yml` workflow triggers on:

- Every `push` to `main`
- Every `pull_request` targeting `main`
- A weekly scheduled scan (Mondays at 03:00 UTC)
- Manual runs via `workflow_dispatch`

## Where to find results

- Findings are uploaded as SARIF reports to the repository's **Security → Code scanning alerts** tab.
- On pull requests, CodeQL annotates the diff directly where it detects a new or existing issue in changed lines.

## How to interpret findings

Each alert includes:
- **Severity** (Error / Warning / Note / Recommendation)
- **Rule description** explaining the vulnerability class
- **Data flow trace** showing how untrusted input reaches a risky sink (for taint-tracking queries)

Not every alert is automatically a true positive — review the flagged code path before dismissing or fixing.

## Resolving reported issues

1. Open the alert in the Security tab and review the flagged lines and data flow.
2. If it's a genuine issue, fix the underlying code (e.g., sanitize input, use parameterized queries, avoid `eval`/dynamic `require`).
3. If it's a false positive, you can dismiss it from the Security tab with a reason (e.g., "used in tests", "false positive"), which won't fail the check but keeps a record.
4. Re-run the workflow (push a fix or use **Re-run jobs**) to confirm the alert clears.

## Relationship to existing CI

This workflow is independent of `ci.yml` (type-check/lint/build) and `pr-title-check.yml`. It does not replace or block them — it adds a separate security-focused check.

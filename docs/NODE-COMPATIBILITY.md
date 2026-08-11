# Node.js Compatibility

FinSight-AI validates its CI pipeline against the following supported Node.js versions:

- Node.js 18
- Node.js 20
- Node.js 22

## Compatibility Checks

Each supported Node.js version independently runs:

1. Dependency installation
2. TypeScript type checking
3. Linting
4. Production build

The GitHub Actions compatibility matrix uses `fail-fast: false`, so a failure on one Node.js version does not cancel validation for the remaining versions.

## Compatibility Policy

The Node.js compatibility matrix is an additional validation layer and does not replace the primary CI workflow.

Whenever a supported Node.js version is added or removed, both the CI matrix and this documentation should be updated together.
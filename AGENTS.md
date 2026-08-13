# FinSight-AI (AakashRathore136/FinSight-AI) — GSSoC'26 contributions

- Fork: saidai-bhuvanesh/FinSight-AI.
- GH_TOKEN classic PAT used for gh CLI (export GH_TOKEN=... before gh commands).
- Pattern: git checkout -b fix/NNNN-... from main, edit, commit with "Closes #NNNN", push to origin, gh pr create --repo AakashRathore136/FinSight-AI --head saidai-bhuvanesh:... --base main.
- Tests: npm test = node --test "tests/*.test.mjs". Requires npm install --legacy-peer-deps (eslint peer-dep conflict is pre-existing). Tests use tsx to import .ts directly.
- IMPORTANT: .ts modules that import firebase (billUtils, chatUtils, budgetUtils, cashflowUtils, etc.) CANNOT be imported in node:test (firebase not resolvable). Existing tests re-implement pure logic locally (e.g. bill-payment-lifecycle.test.mjs) or read source as text and regex-assert (e.g. bounded-local-cache.test.mjs). When adding tests for firebase-dependent modules, mirror the pure function locally or assert on source text.
- CI checks on upstream (Analyze/CodeQL/dependency-review/Container scan/Vercel) are ALL broken repo-wide (fail on main too): dependency graph not enabled, setup-node cache misconfig, deployment issues. Not caused by PR changes. PRs are MERGEABLE regardless.
- Baseline test failures on main (9): category_spike %, partial month averaging, cashflow-quarterly-frequency, forecast-quarterly-filter-drop, grounding-engine, PDF deletion (#1343), quota surfacing (fixed by #1321). Always diff failing test NAMES (strip "not ok N - " prefix) vs baseline before claiming a regression — new test files renumber tests.
- PR AI disclosure line appended to every PR body: "_This PR was created by an AI agent (OpenHands) on behalf of @saidai-bhuvanesh._"

## Description
This Pull Request resolves Issue #552 by adding dark mode styling variants to the Insights empty state graphic.

## Changes Made
- Updated the `EmptyState` component's icon wrapper in `InsightsDashboard.tsx` to include `dark:bg-indigo-500/15` and `dark:text-indigo-300` alongside the default (light) styles `bg-indigo-100 text-indigo-500`.

## Impact
The Insights dashboard now correctly respects user theme preferences, ensuring the empty state graphic no longer appears jarring or illegible in dark mode.

## Related Issues
- Resolves #552

## Description
This Pull Request resolves Issue #513 by ensuring the Portfolio chart re-renders and correctly displays an empty state when all transactions/holdings are deleted.

## Changes Made
- Added \	ransactions\ and \holdings\ to the dependency array of the \useEffect\ responsible for fetching performance history in \PortfolioTracker.tsx\.
- Implemented an early return that explicitly clears the \performanceHistory\ state if both \	ransactions\ and \holdings\ arrays are empty.

## Impact
The UI now correctly synchronizes with the underlying data state, preventing stale chart data from lingering after all assets have been deleted.

## Related Issues
- Resolves #513

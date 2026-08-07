## Description
This Pull Request resolves Issue #551 by ensuring the export function gracefully recovers its state during network or generation failures.

## Changes Made
- Added a `toast.error` notification to alert the user.
- Verified that the `finally` block successfully triggers `setExporting(false)` so the UI doesn't remain stuck in a loading state.

## Impact
Users are no longer soft-locked out of exporting reports again if a temporary network blip or generation error occurs.

## Related Issues
- Resolves #551

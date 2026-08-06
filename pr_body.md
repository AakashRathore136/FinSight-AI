## Description
This Pull Request resolves Issue #510 by handling offline gracefully during currency exchange rate fetching.

## Changes Made
- Added a \
avigator.onLine\ check to the \loadRates\ function in \CurrencyManager.tsx\.
- If offline, it aborts the fetch attempt and displays a \	oast.error\ message instead of attempting a failed network request.

## Impact
The UI no longer crashes with an uncaught promise rejection and infinite loading spinner when offline, providing a much smoother user experience.

## Related Issues
- Resolves #510

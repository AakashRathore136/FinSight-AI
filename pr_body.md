## Description
This Pull Request resolves Issue #547 by ensuring privacy preferences persist across page reloads using localStorage.

## Changes Made
- Added a \useEffect\ hook in \PrivacyDashboard.tsx\ to sync \privacySettings\ to \localStorage\.
- Updated the \loadPrivacyData\ initialization sequence to hydrate preferences from \localStorage\ before falling back to default values.

## Impact
Users no longer lose their privacy preference configurations when refreshing the page or navigating away.

## Related Issues
- Resolves #547

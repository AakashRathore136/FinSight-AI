## Description
This Pull Request resolves Issue #511 by eliminating the Flash of Unstyled Content (FOUC) during initial page load.

## Changes Made
- Added a blocking inline script to the \<head>\ of \index.html\.
- The script synchronously parses the saved theme preference from \localStorage\ or the user's OS preference and immediately attaches the \dark\ class to the HTML root before the React application hydrates.

## Impact
Users on Dark Mode will no longer experience a brief, harsh white screen flash when refreshing or loading the application, creating a smoother and more premium feel.

## Related Issues
- Resolves #511

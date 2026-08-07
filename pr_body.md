## Description
This Pull Request resolves Issue #548 by ensuring the progress bar width styling never exceeds 100%, even if a user's current savings exceed the target amount.

## Changes Made
- Wrapped the inline width styling computation inside \GoalCard.tsx\ and \GoalPlanner.tsx\ with \Math.min(100, progress)\.

## Impact
The UI layout is preserved and no longer breaks or horizontally overflows its container when users surpass their financial goals.

## Related Issues
- Resolves #548

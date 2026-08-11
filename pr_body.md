## Description
This Pull Request resolves Issue #549 by clamping the input value for the Tax Estimator to prevent negative income calculations.

## Changes Made
- Added a validation guard directly within the \onChange\ handler in \TaxEstimation.tsx\ that resets the input to \'0'\ if the user enters a negative number.

## Impact
Prevents edge-case bugs and ensures tax brackets aren't unexpectedly extrapolated into negative numbers when interacting with the estimator form.

## Related Issues
- Resolves #549

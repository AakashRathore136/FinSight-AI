## Is your feature request related to a problem? Please describe.
Manually categorizing every single transaction is tedious. Users often have recurring purchases at the same merchants (e.g., "Uber", "Starbucks", "Netflix") that always fall into the same categories, but they have to categorize them manually each time.

## Describe the solution you'd like
Introduce a Custom Rules Engine where users can define rules like: "If transaction description contains 'Netflix', automatically assign category 'Subscriptions'". These rules should run automatically when new transactions are imported or added.

## Describe alternatives you've considered
Using AI to auto-categorize is another option, but a deterministic rules engine gives users explicit control and predictability over their budget.

## Additional context
This would likely require a new Firestore collection categorization_rules and a background function or client-side hook during transaction insertion.

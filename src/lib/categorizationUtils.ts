/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TransactionRule {
  id: string;
  userId: string;
  keyword: string;
  assignedCategory: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Applies categorization rules to a transaction description.
 * It checks each active rule to see if the transaction description
 * contains the rule's keyword (case-insensitive).
 *
 * Empty or whitespace-only keywords are ignored and never match.
 *
 * @param description The transaction description text
 * @param rules Array of categorization rules configured by the user
 * @returns The assigned category if a rule matches, or null if no match is found
 */
export function applyCategorizationRules(
  description: string,
  rules: TransactionRule[]
): string | null {
  if (!description || !rules || rules.length === 0) {
    return null;
  }

  const normalizedDesc = description.toLowerCase();

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const normalizedKeyword = rule.keyword.trim().toLowerCase();
    if (normalizedKeyword.length > 0 && normalizedDesc.includes(normalizedKeyword)) {
      return rule.assignedCategory;
    }
  }

  return null;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCategorizationRules } from "../src/lib/categorizationUtils.ts";

function rule(keyword, assignedCategory, isActive = true) {
  return {
    id: "rule-1",
    userId: "user-1",
    keyword,
    assignedCategory,
    isActive,
    createdAt: new Date().toISOString(),
  };
}

// 1. Empty keyword: rule does not match
test("empty keyword does not match any description", () => {
  const rules = [rule("", "Software")];
  assert.equal(applyCategorizationRules("STARBUCKS COFFEE", rules), null);
  assert.equal(applyCategorizationRules("ANY TRANSACTION", rules), null);
  assert.equal(applyCategorizationRules("GAS STATION", rules), null);
});

// 2. Whitespace-only keyword: rule does not match
test("whitespace-only keyword does not match any description", () => {
  const rules = [rule("   ", "Software")];
  assert.equal(applyCategorizationRules("STARBUCKS COFFEE", rules), null);
  assert.equal(applyCategorizationRules("GAS STATION", rules), null);
});

// 3. Whitespace around a valid keyword: trimmed keyword matches
test("keyword with surrounding whitespace is trimmed and matches", () => {
  const rules = [rule("  coffee  ", "Coffee & Dining")];
  assert.equal(
    applyCategorizationRules("STARBUCKS COFFEE", rules),
    "Coffee & Dining",
  );
});

// 4. Valid keyword continues to match (case-insensitive)
test("valid keyword matches case-insensitively", () => {
  const rules = [rule("Coffee", "Coffee & Dining")];
  assert.equal(
    applyCategorizationRules("STARBUCKS COFFEE", rules),
    "Coffee & Dining",
  );
  assert.equal(
    applyCategorizationRules("starbucks coffee", rules),
    "Coffee & Dining",
  );
});

// 5. Rule priority/order is preserved (first matching rule wins)
test("rule priority: first matching active rule wins", () => {
  const rules = [
    rule("starbucks", "Coffee"),
    rule("coffee", "General Dining"),
  ];
  assert.equal(applyCategorizationRules("STARBUCKS COFFEE", rules), "Coffee");
});

// 6. Inactive rules are skipped
test("inactive rules do not match", () => {
  const rules = [rule("starbucks", "Coffee", false)];
  assert.equal(applyCategorizationRules("STARBUCKS COFFEE", rules), null);
});

// 7. No rules: returns null
test("empty rules array returns null", () => {
  assert.equal(applyCategorizationRules("STARBUCKS COFFEE", []), null);
});

// 8. Valid keyword does not match unrelated descriptions
test("valid keyword does not match unrelated descriptions", () => {
  const rules = [rule("coffee", "Coffee & Dining")];
  assert.equal(applyCategorizationRules("GAS STATION", rules), null);
  assert.equal(applyCategorizationRules("SUPERMARKET", rules), null);
  assert.equal(applyCategorizationRules("SALARY DEPOSIT", rules), null);
});

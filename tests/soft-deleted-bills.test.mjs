import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const billUtils = readFileSync(path.join(repoRoot, "src/lib/billUtils.ts"), "utf8");
const billReminders = readFileSync(
  path.join(repoRoot, "src/components/bills/BillReminders.tsx"),
  "utf8",
);

test("fetchUserBills skips and maps the deleted flag", () => {
  assert.ok(
    billUtils.includes("if (data.deleted === true) return;"),
    "fetchUserBills must skip bills soft-deleted via softDeleteBill",
  );
  assert.ok(
    billUtils.includes("deleted: data.deleted === true,"),
    "fetchUserBills must carry the deleted flag onto the Bill object",
  );
});

test("deleted bills never drive reminders or obligations", () => {
  assert.ok(
    /bill\.deleted \|\| bill\.isPaid/.test(billUtils),
    "isOverdue must ignore deleted bills",
  );
  assert.ok(
    /bill\.deleted \|\| bill\.isPaid \|\| isOverdue/.test(billUtils),
    "isUpcoming must ignore deleted bills",
  );
  assert.ok(
    /bill\.deleted \|\| bill\.isPaid\) return total/.test(billUtils),
    "calculateMonthlyObligations must exclude deleted bills",
  );
  assert.ok(
    billUtils.includes("if (bill.deleted) return null;"),
    "markBillAsPaid must refuse to process deleted bills",
  );
});

test("BillReminders excludes deleted bills from the active list", () => {
  assert.ok(
    /bills\.filter\(\(b\) => !b\.isPaid && !b\.deleted\)/.test(billReminders),
    "activeBills must not include deleted bills",
  );
});

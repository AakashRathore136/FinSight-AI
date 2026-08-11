import { test } from "node:test";
import assert from "node:assert/strict";

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  const needsQuote = /[",\n\r]/.test(str);
  let escaped = str.replace(/"/g, '""');
  const isNumeric = str.trim() !== "" && Number.isFinite(Number(str));
  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    escaped = "'" + escaped;
  }
  return needsQuote ? `"${escaped}"` : escaped;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

test("simple values are not quoted", () => {
  assert.equal(csvEscape("Groceries"), "Groceries");
});

test("comma values are quoted", () => {
  assert.equal(csvEscape("Food, Dining"), '"Food, Dining"');
});

test("double quotes are doubled and wrapped", () => {
  assert.equal(csvEscape('Say "hi"'), '"Say ""hi"""');
});

test("newline values are quoted", () => {
  assert.equal(csvEscape("a\nb"), '"a\nb"');
});

test("formula injection with = is neutralised", () => {
  const out = csvEscape("=HYPERLINK(http://evil)");
  assert.equal(out, "'=HYPERLINK(http://evil)");
  // a formula containing a comma is both quoted and neutralised
  const out2 = csvEscape("=HYPERLINK(\"http://evil\", \"x\")");
  assert.equal(out2, '"\'=HYPERLINK(""http://evil"", ""x"")"');
  const parsed = parseCsvLine(out2)[0];
  assert.equal(parsed, "'=HYPERLINK(\"http://evil\", \"x\")");
});

test("@-prefixed formula is neutralised", () => {
  assert.equal(csvEscape("@SUM(A1)"), "'@SUM(A1)");
});

test("text-prefixed + is neutralised", () => {
  assert.equal(csvEscape("+abc"), "'+abc");
});

test("negative numbers are NOT treated as formulas", () => {
  assert.equal(csvEscape("-50.00"), "-50.00");
});

test("positive numbers untouched", () => {
  assert.equal(csvEscape("42"), "42");
});

test("numeric input untouched", () => {
  assert.equal(csvEscape(42), "42");
});

test("null and undefined become empty", () => {
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
});

test("comma-containing row round-trips through a CSV parse", () => {
  const row = [
    csvEscape("Food, Dining"),
    csvEscape("Expense"),
    csvEscape("100.00"),
    csvEscape(3),
  ].join(",");
  const parsed = parseCsvLine(row);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0], "Food, Dining");
  assert.equal(parsed[1], "Expense");
});

test("a full generateCSV-style row with injection round-trips safely", () => {
  const row = [
    csvEscape("=cmd|/c calc"),
    csvEscape("Expense"),
    csvEscape("100.00"),
  ].join(",");
  const parsed = parseCsvLine(row);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0], "'=cmd|/c calc");
});

test("generateCSV uses csvEscape on every field (source wiring)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const src = readFileSync(
    path.join(repoRoot, "src", "lib", "reportUtils.ts"),
    "utf8",
  );
  assert.match(src, /export function csvEscape/);
  const genStart = src.indexOf("export function generateCSV");
  const genBody = src.slice(genStart, src.indexOf("return lines.join", genStart));
  // generateCSV must reference csvEscape, not raw interpolation.
  assert.match(genBody, /csvEscape/);
  assert.doesNotMatch(genBody, /\$\{item\.category\},/);
  assert.doesNotMatch(genBody, /\$\{t\.description\|\|/);
});

test("exportForecastChart uses csvEscape (source wiring)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const src = readFileSync(
    path.join(repoRoot, "src", "lib", "forecastUtils.ts"),
    "utf8",
  );
  assert.match(src, /import \{ csvEscape \} from ['"]\.\/reportUtils['"]/);
  const fnStart = src.indexOf("export function exportForecastChart");
  const fnBody = src.slice(fnStart, src.indexOf("return lines.join", fnStart));
  assert.match(fnBody, /csvEscape/);
  assert.doesNotMatch(fnBody, /\$\{d\.month\},/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(path.join(repoRoot, "server.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

// /api/analyze middleware must reject at the concurrency gate before the
// daily-quota counter is ever touched. express-rate-limit counts every request
// that reaches it, so a 429 CONCURRENT_LIMIT must not burn one of the 5/day.
const routeStart = server.indexOf('app.post(\n    "/api/analyze",');
assert.ok(routeStart !== -1, 'app.post("/api/analyze", not found in server.ts');

const bodyStart = server.indexOf("{", routeStart);
const routeEnd = server.indexOf("\n  );", bodyStart);
const route = server.slice(routeStart, routeEnd + 1);

function position(name) {
  const idx = route.indexOf(name);
  return idx === -1 ? null : idx;
}

test("concurrency limiter runs before the daily quota limiter on /api/analyze", () => {
  const concurrency = position("concurrentAnalyzeLimiter");
  const quota = position("analyzeRateLimiter");
  assert.ok(
    concurrency !== null,
    "concurrentAnalyzeLimiter must be registered on /api/analyze",
  );
  assert.ok(
    quota !== null,
    "analyzeRateLimiter must be registered on /api/analyze",
  );
  assert.ok(
    concurrency < quota,
    "concurrentAnalyzeLimiter must run before analyzeRateLimiter so a " +
      "429 CONCURRENT_LIMIT rejection does not consume daily quota",
  );
});

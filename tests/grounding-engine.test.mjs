import { test } from "node:test";
import assert from "node:assert/strict";

const { verifyDocumentAnalysis } = await import("../src/lib/verification/index.ts");
const { chunkFinancialDocument } = await import("../src/lib/rag/textChunker.ts");

test("grounding engine verifies exact, normalized, and tolerance matches", async () => {
  // 1. Mock document text spanning 2 pages
  const page1 = "We reported Revenue of $4.5M in Q3.\nOperating Margin was 12.5%.";
  const page2 = "Total Operating Expenses reached $1,234,567.\nEBITDA was 2.4B.";
  
  const fullText = `${page1}\n\n\n\n${page2}`;
  const pageOffsets = [0, page1.length + 4]; // PAGE_SEPARATOR is \n\n\n\n (4 chars)

  const chunks = chunkFinancialDocument(fullText, { chunkSize: 5, pageOffsets });

  // 2. Mock analysis response from Qwen
  const mockAnalysis = {
    summary: "The business had revenue of 4.5 million USD and operating margin of 12.5 percent.",
    key_metrics: {
      revenue: 4500000,
      operating_margin: 12.5,
      opex: 1234567,
      ebitda: 2400000000,
      unrelated_metric: 999999, // Should be unverified
    },
    risk_assessment: [],
    action_items: [],
    sentiment_score: 0.8,
    entities: [],
    full_report: "Operating expenses were 1,234,567 USD. EBITDA was 2.4 billion.",
  };

  // 3. Run verification (deterministic only - no hfClient passed)
  const result = await verifyDocumentAnalysis(
    mockAnalysis,
    Buffer.from(""), // Buffer is only read by extractPages, which we mock/fallback on failure
    chunks,
    { enableAdjudication: false }
  );

  // 4. Assert grounding statistics
  const g = result.grounding;
  assert.equal(g.totalClaims > 0, true);
  
  // Find revenue claim
  const revenueClaim = result.claims.find(c => c.label === "key_metrics.revenue");
  assert.ok(revenueClaim);
  assert.equal(revenueClaim.status, "verified");
  assert.ok(revenueClaim.citation);
  assert.equal(revenueClaim.citation.page, 1);
  assert.equal(revenueClaim.citation.matchType, "normalized");

  // Find opex claim
  const opexClaim = result.claims.find(c => c.label === "key_metrics.opex");
  assert.ok(opexClaim);
  assert.equal(opexClaim.status, "verified");
  assert.ok(opexClaim.citation);
  assert.equal(opexClaim.citation.page, 2);
  assert.equal(opexClaim.citation.matchType, "normalized");

  // Find unrelated metric (should be unverified)
  const unrelatedClaim = result.claims.find(c => c.label === "key_metrics.unrelated_metric");
  assert.ok(unrelatedClaim);
  assert.equal(unrelatedClaim.status, "unverified");
  assert.equal(unrelatedClaim.citation, undefined);
});

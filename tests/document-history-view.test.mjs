import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const analysisListSource = readFileSync(
  path.join(repoRoot, "src", "components", "AnalysisList.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const comparisonModalSource = readFileSync(
  path.join(repoRoot, "src", "components", "DocumentComparisonModal.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const quickPreviewModalSource = readFileSync(
  path.join(repoRoot, "src", "components", "DocumentQuickPreviewModal.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

// ---------------------------------------------------------------------------
// Pure logic test implementations mirroring component filtering & sorting
// ---------------------------------------------------------------------------
function getDocTimestamp(d) {
  if (!d?.createdAt) return 0;
  if (typeof d.createdAt === "number") return d.createdAt;
  if (typeof d.createdAt.toDate === "function") return d.createdAt.toDate().getTime();
  if (d.createdAt.seconds) return d.createdAt.seconds * 1000;
  const parsed = new Date(d.createdAt).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function filterAndSortDocs(documents, { searchTerm = "", riskFilter = "all", statusFilter = "all", dateFilter = "all", sortBy = "newest", now = Date.now() } = {}) {
  return documents
    .filter((doc) => {
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const matchName = String(doc.fileName || "").toLowerCase().includes(term);
        const matchSummary = String(doc.latestAnalysis?.summary || "").toLowerCase().includes(term);
        if (!matchName && !matchSummary) return false;
      }

      if (riskFilter !== "all") {
        const r = String(doc.riskLevel || "").toLowerCase();
        if (r !== riskFilter) return false;
      }

      if (statusFilter !== "all") {
        const s = String(doc.status || "pending").toLowerCase();
        if (s !== statusFilter) return false;
      }

      if (dateFilter !== "all") {
        const docTs = getDocTimestamp(doc);
        if (!docTs) return false;
        const diffMs = now - docTs;
        if (dateFilter === "24h" && diffMs > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "7d" && diffMs > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "30d" && diffMs > 30 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "90d" && diffMs > 90 * 24 * 60 * 60 * 1000) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return getDocTimestamp(b) - getDocTimestamp(a);
      if (sortBy === "oldest") return getDocTimestamp(a) - getDocTimestamp(b);
      if (sortBy === "name_asc") return String(a.fileName || "").localeCompare(String(b.fileName || ""));
      if (sortBy === "risk_desc") {
        const riskWeight = { high: 3, medium: 2, low: 1 };
        const rA = riskWeight[String(a.riskLevel || "").toLowerCase()] || 0;
        const rB = riskWeight[String(b.riskLevel || "").toLowerCase()] || 0;
        return rB - rA;
      }
      return 0;
    });
}

function formatCSVExport(documents) {
  const headers = ["Document ID", "File Name", "Risk Level", "Status", "File Size (Bytes)", "Created Date", "Summary"];
  const rows = documents.map((doc) => [
    `"${doc.id}"`,
    `"${String(doc.fileName || "").replace(/"/g, '""')}"`,
    `"${doc.riskLevel || "unassessed"}"`,
    `"${doc.status || "pending"}"`,
    doc.fileSize || 0,
    `"${doc.createdAt ? new Date(doc.createdAt).toISOString() : ""}"`,
    `"${String(doc.latestAnalysis?.summary || "").replace(/"/g, '""')}"`,
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

const now = 1750000000000;
const sampleDocs = [
  {
    id: "doc-1",
    fileName: "Q1_Financial_Report.pdf",
    fileSize: 2048576,
    riskLevel: "high",
    status: "completed",
    createdAt: now - 2 * 3600 * 1000, // 2 hours ago
    latestAnalysis: { summary: "Significant liquidity risks identified in quarterly operations." },
  },
  {
    id: "doc-2",
    fileName: "Annual_Audit_2025.pdf",
    fileSize: 5242880,
    riskLevel: "low",
    status: "completed",
    createdAt: now - 3 * 24 * 3600 * 1000, // 3 days ago
    latestAnalysis: { summary: "Healthy balance sheet and balanced operational cashflows." },
  },
  {
    id: "doc-3",
    fileName: "Tax_Filing_Draft.pdf",
    fileSize: 1048576,
    riskLevel: "medium",
    status: "processing",
    createdAt: now - 15 * 24 * 3600 * 1000, // 15 days ago
    latestAnalysis: null,
  },
  {
    id: "doc-4",
    fileName: "Investment_Portfolio_Q4.pdf",
    fileSize: 3145728,
    riskLevel: "high",
    status: "completed",
    createdAt: now - 60 * 24 * 3600 * 1000, // 60 days ago
    latestAnalysis: { summary: "Exposure to high-volatility instruments flagged." },
  },
];

test("filterAndSortDocs correctly filters by risk level", () => {
  const highRisk = filterAndSortDocs(sampleDocs, { riskFilter: "high", now });
  assert.equal(highRisk.length, 2);
  assert.ok(highRisk.every((d) => d.riskLevel === "high"));

  const lowRisk = filterAndSortDocs(sampleDocs, { riskFilter: "low", now });
  assert.equal(lowRisk.length, 1);
  assert.equal(lowRisk[0].id, "doc-2");
});

test("filterAndSortDocs correctly filters by date range", () => {
  const past24h = filterAndSortDocs(sampleDocs, { dateFilter: "24h", now });
  assert.equal(past24h.length, 1);
  assert.equal(past24h[0].id, "doc-1");

  const past7d = filterAndSortDocs(sampleDocs, { dateFilter: "7d", now });
  assert.equal(past7d.length, 2);

  const past30d = filterAndSortDocs(sampleDocs, { dateFilter: "30d", now });
  assert.equal(past30d.length, 3);
});

test("filterAndSortDocs correctly searches across filename and stored AI summaries", () => {
  const byName = filterAndSortDocs(sampleDocs, { searchTerm: "Audit", now });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, "doc-2");

  const bySummary = filterAndSortDocs(sampleDocs, { searchTerm: "liquidity risks", now });
  assert.equal(bySummary.length, 1);
  assert.equal(bySummary[0].id, "doc-1");
});

test("filterAndSortDocs sorts by risk level and alphabetical name", () => {
  const byRisk = filterAndSortDocs(sampleDocs, { sortBy: "risk_desc", now });
  assert.equal(byRisk[0].riskLevel, "high");
  assert.equal(byRisk[1].riskLevel, "high");
  assert.equal(byRisk[2].riskLevel, "medium");
  assert.equal(byRisk[3].riskLevel, "low");

  const byName = filterAndSortDocs(sampleDocs, { sortBy: "name_asc", now });
  assert.equal(byName[0].fileName, "Annual_Audit_2025.pdf");
  assert.equal(byName[1].fileName, "Investment_Portfolio_Q4.pdf");
});

test("formatCSVExport produces valid CSV rows and escapes quotes", () => {
  const csv = formatCSVExport(sampleDocs);
  assert.ok(csv.startsWith("Document ID,File Name,Risk Level,Status"));
  assert.ok(csv.includes('"Q1_Financial_Report.pdf"'));
  assert.ok(csv.includes('"Significant liquidity risks identified in quarterly operations."'));
});

test("AnalysisList retains required handleDelete and deleteLocalDocument contracts", () => {
  assert.ok(
    analysisListSource.includes("const handleDelete = async (id: string, fileName: string) => {"),
    "handleDelete must exist with expected signature",
  );
  assert.ok(
    analysisListSource.includes("deleteLocalDocument(id);"),
    "deleteLocalDocument must be called for localStorage mirror consistency",
  );
  assert.ok(
    analysisListSource.includes("setDocuments((prev) => prev.filter((doc) => doc.id !== id));"),
    "local documents state must be optimistically filtered on deletion",
  );
});

test("AnalysisList imports and mounts DocumentComparisonModal and DocumentQuickPreviewModal", () => {
  assert.ok(
    analysisListSource.includes("DocumentComparisonModal"),
    "AnalysisList must integrate DocumentComparisonModal",
  );
  assert.ok(
    analysisListSource.includes("DocumentQuickPreviewModal"),
    "AnalysisList must integrate DocumentQuickPreviewModal",
  );
  assert.ok(
    analysisListSource.includes("selectedForCompare"),
    "AnalysisList must manage selection state for comparison",
  );
});

test("DocumentComparisonModal renders side-by-side comparison structure", () => {
  assert.ok(
    comparisonModalSource.includes("Side-by-Side Analysis Comparison"),
    "DocumentComparisonModal must contain header for comparison",
  );
  assert.ok(
    comparisonModalSource.includes("AI Executive Summary"),
    "DocumentComparisonModal must compare executive summaries",
  );
  assert.ok(
    comparisonModalSource.includes("Extracted Financial Metrics"),
    "DocumentComparisonModal must compare financial metrics",
  );
});

test("DocumentQuickPreviewModal renders stored insights modal structure", () => {
  assert.ok(
    quickPreviewModalSource.includes("Stored Executive Summary"),
    "DocumentQuickPreviewModal must display executive summary",
  );
  assert.ok(
    quickPreviewModalSource.includes("Extracted Metrics"),
    "DocumentQuickPreviewModal must display extracted key metrics",
  );
});

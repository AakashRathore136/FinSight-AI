import { InferenceClient } from "@huggingface/inference";
import { extractText } from "unpdf";
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import DOMPurify from "isomorphic-dompurify";
import type { IncomingMessage, ServerResponse } from "http";

dotenv.config({ quiet: true });

/**
 * Vercel Serverless Function — Disable built-in body parser so we can
 * handle multipart/form-data manually via the Web Streams / Blob API.
 * This is the correct way to handle file uploads in Vercel serverless functions.
 */
export const config = {
  api: {
    bodyParser: false,
    // Allow up to 20 MB request bodies
    sizeLimit: "20mb",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string, fallback = ""): string {
  return String(process.env[key] || fallback).trim();
}

function getFirebaseProjectId(): string {
  return (
    getEnv("FIREBASE_PROJECT_ID") || getEnv("VITE_FIREBASE_PROJECT_ID")
  );
}

function getFirestoreDatabaseId(): string {
  return (
    getEnv("FIREBASE_FIRESTORE_DATABASE_ID") ||
    getEnv("VITE_FIREBASE_FIRESTORE_DATABASE_ID") ||
    "(default)"
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalysisResponse = {
  summary: string;
  key_metrics: Record<string, unknown>;
  risk_assessment: Array<{ level?: string; description?: string } | string>;
  action_items: string[];
  sentiment_score: number;
  entities: string[];
  full_report: string;
};

class PipelineError extends Error {
  stage: string;
  recommendation: string;
  constructor(stage: string, reason: string, recommendation: string) {
    super(reason);
    this.name = "PipelineError";
    this.stage = stage;
    this.recommendation = recommendation;
  }
}

// ---------------------------------------------------------------------------
// Sanitization / JSON parsing
// ---------------------------------------------------------------------------

function sanitizeString(text: string): string {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

function safeJsonParse(text: string): unknown {
  const cleaned = (text || "").trim();
  if (!cleaned) throw new Error("Empty model response");

  let extracted = cleaned;
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");

  if (
    firstObj !== -1 &&
    lastObj !== -1 &&
    (firstArr === -1 || firstObj < firstArr)
  ) {
    extracted = cleaned.substring(firstObj, lastObj + 1);
  } else if (firstArr !== -1 && lastArr !== -1) {
    extracted = cleaned.substring(firstArr, lastArr + 1);
  }

  try {
    return JSON.parse(extracted);
  } catch (err: any) {
    const repaired = extracted
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_m, p1) => {
        return '"' + p1.replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
      });
    try {
      return JSON.parse(repaired);
    } catch {
      // Try to close open braces/brackets
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escape = false;
      let repairStr = repaired;
      for (const char of repairStr) {
        if (escape) { escape = false; continue; }
        if (char === "\\") { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === "{") openBraces++;
          else if (char === "}") openBraces--;
          else if (char === "[") openBrackets++;
          else if (char === "]") openBrackets--;
        }
      }
      if (inString) repairStr += '"';
      while (openBrackets > 0) { repairStr += "]"; openBrackets--; }
      while (openBraces > 0) { repairStr += "}"; openBraces--; }
      try {
        return JSON.parse(repairStr);
      } catch (err3: any) {
        throw new Error(
          `JSON parsing failed after all repairs: ${err.message} / ${err3.message}`,
        );
      }
    }
  }
}

function validateAnalysisPayload(payload: any): AnalysisResponse {
  const required = [
    "summary",
    "key_metrics",
    "risk_assessment",
    "action_items",
    "sentiment_score",
    "entities",
    "full_report",
  ];
  for (const key of required) {
    if (!(key in payload)) throw new Error(`Missing required key: ${key}`);
  }
  const fullReport = String(payload.full_report || "").trim();
  const wordCount = fullReport.split(/\s+/).filter(Boolean).length;
  if (wordCount < 120)
    throw new Error(`full_report too short (${wordCount} words)`);

  return {
    summary: sanitizeString(String(payload.summary || "")),
    key_metrics:
      typeof payload.key_metrics === "object" && payload.key_metrics
        ? payload.key_metrics
        : {},
    risk_assessment: Array.isArray(payload.risk_assessment)
      ? payload.risk_assessment.map((item: any) =>
          typeof item === "object" && item
            ? {
                level: sanitizeString(String(item.level || "")),
                description: sanitizeString(String(item.description || "")),
              }
            : sanitizeString(String(item || "")),
        )
      : [],
    action_items: Array.isArray(payload.action_items)
      ? payload.action_items.map((v: unknown) => sanitizeString(String(v)))
      : [],
    sentiment_score: Number(payload.sentiment_score || 0),
    entities: Array.isArray(payload.entities)
      ? payload.entities.map((v: unknown) => sanitizeString(String(v)))
      : [],
    full_report: sanitizeString(fullReport),
  };
}

function buildFallbackAnalysis(
  documentText: string,
  fileName: string,
  reason?: string,
): AnalysisResponse {
  const normalizedText = String(documentText || "").trim();
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const characterCount = normalizedText.length;
  const paragraphCount = normalizedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean).length;

  const lowerText = normalizedText.toLowerCase();
  const themeSignals = [
    {
      level: "high",
      keywords: ["debt", "default", "breach", "covenant", "insolvency", "litigation"],
      description:
        "The document contains language associated with leverage, covenant pressure, or legal exposure.",
    },
    {
      level: "medium",
      keywords: ["liquidity", "cash flow", "working capital", "runway", "refinancing"],
      description:
        "The text references liquidity or cash flow themes.",
    },
    {
      level: "medium",
      keywords: ["forecast", "guidance", "assumption", "projection", "scenario"],
      description: "Forecasting language appears in the document.",
    },
    {
      level: "low",
      keywords: ["compliance", "policy", "audit", "control", "regulation"],
      description: "The document mentions governance or compliance topics.",
    },
  ];
  const matchedThemes = themeSignals.filter((t) =>
    t.keywords.some((k) => lowerText.includes(k)),
  );
  const riskAssessment = matchedThemes.length
    ? matchedThemes.map((t) => ({ level: t.level, description: t.description }))
    : [{ level: "low", description: "No strong risk keywords detected." }];

  const positiveSignals = ["growth", "profit", "margin", "improve", "strong", "stable"];
  const negativeSignals = ["loss", "decline", "risk", "weak", "pressure", "shortfall", "downgrade"];
  const pos = positiveSignals.reduce((c, k) => c + (lowerText.includes(k) ? 1 : 0), 0);
  const neg = negativeSignals.reduce((c, k) => c + (lowerText.includes(k) ? 1 : 0), 0);
  const sentimentScore = Math.max(
    -1,
    Math.min(1, (pos - neg) / Math.max(pos + neg, 4)),
  );

  const entityMatches =
    normalizedText.match(
      /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}|[A-Z]{2,}(?:\/[A-Z]{2,})?)\b/g,
    ) || [];
  const entities = Array.from(
    new Set(entityMatches.map((e) => e.trim()).filter((e) => e.length > 2)),
  ).slice(0, 12);

  const themeSummary = matchedThemes.length
    ? matchedThemes.map((t) => t.level).join(", ")
    : "low";

  return {
    summary:
      `Automated fallback analysis for ${fileName}. ` +
      `The upload contains about ${wordCount} words across ${paragraphCount || 1} paragraph group(s) and ${characterCount} characters. ` +
      (reason
        ? `The primary AI path was unavailable (${reason}). `
        : "The primary AI path was unavailable. ") +
      `This fallback keeps the document usable while preserving the rest of the workflow.`,
    key_metrics: {
      word_count: wordCount,
      character_count: characterCount,
      paragraph_count: paragraphCount,
      theme_count: matchedThemes.length,
    },
    risk_assessment: riskAssessment,
    action_items: [
      "Review the document manually for figures, obligations, and deadlines.",
      "Confirm any debt, cash flow, or covenant language against the latest official statements.",
      "Check whether key assumptions in the document still match current business conditions.",
      "Verify any compliance, audit, or policy references against the latest control evidence.",
      "If intended for decision-making, route it to a domain reviewer before relying on it.",
    ],
    sentiment_score: sentimentScore,
    entities,
    full_report: [
      `This fallback report was generated because the primary AI analysis pipeline could not produce a valid response for ${fileName}. The upload was still processed so the rest of the application can continue working.`,
      `The document appears to be ${wordCount > 0 ? `roughly ${wordCount} words long` : "light on extractable text"}, with ${paragraphCount || 1} paragraph group(s) detected. The source is at least partially readable, but available content may be incomplete if the PDF is scanned or image-based.`,
      `Keyword signals suggest the dominant themes are ${themeSummary}. If the text contains leverage, liquidity, guidance, or compliance references, those areas should be checked first.`,
      `From a control perspective, the safest next step is to validate the source document manually, confirm the critical numbers and obligations, and compare any apparent trends against the latest available records.`,
      `This report preserves continuity of the upload flow without pretending to be a deep model-based analysis. It is intentionally conservative, and it is best treated as a structured placeholder until the primary AI path is restored or the document is reviewed manually.`,
    ].join("\n\n"),
  };
}

function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" {
  const n = String(value || "").toLowerCase();
  if (n.includes("high")) return "high";
  if (n.includes("medium") || n.includes("moderate")) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Firebase Admin initialization
// ---------------------------------------------------------------------------

async function ensureAdminInitialized(): Promise<boolean> {
  if (admin.apps.length) return true;

  const firebaseProjectId = getFirebaseProjectId();
  if (!firebaseProjectId) {
    console.warn("[analyze] FIREBASE_PROJECT_ID not set, skipping Admin init");
    return false;
  }

  const storageBucket =
    getEnv("VITE_FIREBASE_STORAGE_BUCKET") ||
    `${firebaseProjectId}.firebasestorage.app`;

  const rawServiceAccount = getEnv("FIREBASE_SERVICE_ACCOUNT");
  if (rawServiceAccount) {
    try {
      let svc =
        typeof rawServiceAccount === "string"
          ? JSON.parse(rawServiceAccount)
          : rawServiceAccount;
      // Vercel escapes newlines in env vars — unescape them
      if (svc.private_key && typeof svc.private_key === "string") {
        svc.private_key = svc.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(svc),
        projectId: svc.project_id || firebaseProjectId,
        storageBucket,
      });
      console.log("[analyze] Firebase Admin initialized with service account");
      return true;
    } catch (err) {
      console.warn(
        "[analyze] Failed to parse FIREBASE_SERVICE_ACCOUNT:",
        err,
      );
    }
  }

  // Fallback: application default credentials (works locally / Cloud Run)
  try {
    admin.initializeApp({ projectId: firebaseProjectId, storageBucket });
    console.log("[analyze] Firebase Admin initialized with default credentials");
    return true;
  } catch (err) {
    console.warn("[analyze] Firebase Admin default init failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

type VercelReq = IncomingMessage & { [key: string]: any };
type VercelRes = ServerResponse & {
  status(code: number): VercelRes;
  json(body: unknown): void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Auth
    // -----------------------------------------------------------------------
    await ensureAdminInitialized();

    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: {
          stage: "AUTH_VERIFICATION",
          reason: "Missing or invalid Authorization token",
          recommendation: "Please refresh your session or sign in again.",
        },
      });
      return;
    }

    const idToken = authHeader.slice(7);
    let uid = "";
    if (admin.apps.length) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if (!decoded.email_verified) {
          res.status(403).json({
            error: {
              stage: "AUTH_VERIFICATION",
              reason: "Email address is not verified",
              recommendation:
                "Verify your email address and sign in again.",
            },
          });
          return;
        }
        uid = decoded.uid;
      } catch (authErr: any) {
        res.status(401).json({
          error: {
            stage: "AUTH_VERIFICATION",
            reason: authErr?.message || "Invalid token",
            recommendation: "Please sign out and sign in again.",
          },
        });
        return;
      }
    }
    const ownerId = uid;

    // -----------------------------------------------------------------------
    // 2. Parse multipart form data using native Web API (works on Vercel)
    // -----------------------------------------------------------------------
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.includes("multipart/form-data")) {
      throw new PipelineError(
        "PDF_INGESTION",
        `Expected multipart/form-data, got: ${contentType}`,
        "Upload a PDF file using the correct form.",
      );
    }

    // Collect raw body from the Node.js readable stream
    const bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    // Parse multipart using a boundary-aware parser (pure JS, no native deps)
    const boundary = (() => {
      const match = contentType.match(/boundary=([^\s;]+)/);
      return match ? match[1] : null;
    })();

    if (!boundary) {
      throw new PipelineError(
        "PDF_INGESTION",
        "Could not determine multipart boundary",
        "Ensure the request includes a valid Content-Type header with a boundary.",
      );
    }

    // Parse the multipart body to extract the file
    const { buffer: fileBuffer, filename, mimetype } = parseMultipart(
      bodyBuffer,
      boundary,
    );

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new PipelineError(
        "PDF_INGESTION",
        "No file found in request body",
        "Please select a valid PDF file to upload.",
      );
    }

    if (mimetype !== "application/pdf") {
      throw new PipelineError(
        "PDF_INGESTION",
        `Invalid file type: ${mimetype}`,
        "Only PDF files are supported.",
      );
    }

    if (fileBuffer.length > 20 * 1024 * 1024) {
      throw new PipelineError(
        "PDF_INGESTION",
        `File too large: ${fileBuffer.length} bytes`,
        "Please upload a PDF under 20 MB.",
      );
    }

    // -----------------------------------------------------------------------
    // 3. Extract PDF text with unpdf (pure JS — no native binaries)
    // -----------------------------------------------------------------------
    let extractedText = "";
    try {
      const { text } = await extractText(new Uint8Array(fileBuffer), {
        mergePages: true,
      });
      extractedText = String(text || "").trim();
    } catch (pdfErr: any) {
      throw new PipelineError(
        "PDF_EXTRACTION",
        `Failed to extract PDF text: ${pdfErr?.message || String(pdfErr)}`,
        "Ensure the file is a readable, uncorrupted, unencrypted PDF.",
      );
    }

    if (!extractedText || extractedText.length < 100) {
      throw new PipelineError(
        "PDF_VALIDATION",
        `Insufficient text extracted (${extractedText.length} chars).`,
        "Make sure the PDF contains selectable text, not scanned images.",
      );
    }

    // -----------------------------------------------------------------------
    // 4. HuggingFace analysis
    // -----------------------------------------------------------------------
    const hfApiKey = getEnv("HUGGINGFACE_API_KEY");
    let validPayload: AnalysisResponse | null = null;
    let fallbackReason = "";

    if (!hfApiKey) {
      fallbackReason = "HUGGINGFACE_API_KEY is not configured on the server";
    } else {
      const hfClient = new InferenceClient(hfApiKey);
      const systemPrompt = `You are a senior financial intelligence analyst. Produce detailed financial analysis based ONLY on the provided document.

Return ONLY valid JSON with these exact keys: summary, key_metrics, risk_assessment, action_items, sentiment_score, entities, full_report.
full_report MUST be at least 600 words.`;

      for (let attempt = 0; attempt <= 1 && !validPayload; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 45_000);
          try {
            const completion = await hfClient.chatCompletion(
              {
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                  { role: "system", content: systemPrompt },
                  {
                    role: "user",
                    content: `--- BEGIN DOCUMENT ---\n${extractedText}\n--- END DOCUMENT ---\n\nAnalyze this document. Return ONLY the JSON object.`,
                  },
                ],
                max_tokens: 4000,
                temperature: 0.2,
              },
              { signal: controller.signal },
            );
            clearTimeout(timer);
            const rawText =
              completion.choices?.[0]?.message?.content || "{}";
            const parsed = safeJsonParse(rawText);
            validPayload = validateAnalysisPayload(parsed);
          } catch (innerErr: any) {
            clearTimeout(timer);
            if (attempt >= 1) {
              fallbackReason =
                innerErr?.name === "AbortError"
                  ? "AI request timed out after 45 seconds"
                  : innerErr?.message || String(innerErr);
            }
          }
        } catch (outerErr: any) {
          if (attempt >= 1) {
            fallbackReason = outerErr?.message || String(outerErr);
          }
        }
      }
    }

    if (!validPayload) {
      validPayload = buildFallbackAnalysis(
        extractedText,
        filename || "document.pdf",
        fallbackReason || undefined,
      );
    }

    // -----------------------------------------------------------------------
    // 5. Persist to Firestore
    // -----------------------------------------------------------------------
    const rawRisk =
      validPayload.risk_assessment?.[0] &&
      typeof validPayload.risk_assessment[0] === "object"
        ? (validPayload.risk_assessment[0] as any).level
        : "low";
    const riskLevel = normalizeRiskLevel(rawRisk);
    const now = new Date();
    const storagePath = `analyses/${ownerId}/${now.getTime()}_${filename || "document.pdf"}`;
    const fileUrl = `https://finsight.local/storage/${encodeURIComponent(storagePath)}`;

    const docData: any = {
      ownerId,
      fileName: filename || "document.pdf",
      fileType: "application/pdf",
      fileSize: fileBuffer.length,
      fileUrl,
      storagePath,
      status: "completed",
      riskLevel,
      createdAt: now,
      updatedAt: now,
    };

    const analysisDoc: any = {
      ...validPayload,
      documentId: "",
      ownerId,
      riskLevel,
      processedAt: now,
    };

    let documentId = `local-${ownerId || "anon"}-${now.getTime()}`;

    if (admin.apps.length) {
      try {
        const db = getFirestore(getFirestoreDatabaseId());
        const docRef = await db.collection("documents").add({
          ...docData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        documentId = docRef.id;

        const analysisPayload = {
          ...analysisDoc,
          documentId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db
          .collection("documents")
          .doc(documentId)
          .collection("analyses")
          .add(analysisPayload);
        await db.collection("documents").doc(documentId).update({
          latestAnalysis: analysisPayload,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[analyze] Firestore write complete: ${documentId}`);
      } catch (writeErr: any) {
        console.warn("[analyze] Firestore write failed, using local ID:", writeErr?.message);
        documentId = `local-${ownerId || "anon"}-${now.getTime()}`;
      }
    }

    res.status(200).json({
      documentId,
      persistenceMode: documentId.startsWith("local-") ? "local" : "firestore",
      record: { ...docData, id: documentId },
      analysis: { ...analysisDoc, documentId },
    });
  } catch (error: any) {
    const stage = error?.stage || "PIPELINE_ERROR";
    const reason = error?.message || String(error);
    const recommendation =
      error?.recommendation ||
      "An unexpected error occurred. Please check server logs.";

    console.error(`[analyze] ${stage}: ${reason}`);

    res.status(500).json({
      error: {
        stage,
        reason,
        recommendation,
        stack:
          process.env.NODE_ENV !== "production" ? error?.stack : undefined,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Pure-JS multipart parser (no native deps, works on Vercel serverless)
// ---------------------------------------------------------------------------

function parseMultipart(
  body: Buffer,
  boundary: string,
): { buffer: Buffer; filename: string; mimetype: string } {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts: { headers: string; data: Buffer }[] = [];

  let start = body.indexOf(boundaryBuf);
  while (start !== -1) {
    const end = body.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (end === -1) break;

    const partStart = start + boundaryBuf.length;
    const part = body.slice(partStart, end);

    // Find header/body separator (\r\n\r\n)
    const sep = part.indexOf("\r\n\r\n");
    if (sep !== -1) {
      const headerBuf = part.slice(0, sep);
      const dataBuf = part.slice(sep + 4);
      // Remove trailing \r\n
      const data =
        dataBuf.length >= 2 &&
        dataBuf[dataBuf.length - 2] === 0x0d &&
        dataBuf[dataBuf.length - 1] === 0x0a
          ? dataBuf.slice(0, dataBuf.length - 2)
          : dataBuf;

      parts.push({ headers: headerBuf.toString("utf8"), data });
    }
    start = end;
  }

  // Find the file part (has "filename=" in Content-Disposition)
  for (const part of parts) {
    const lines = part.headers.split(/\r\n/);
    let filename = "";
    let mimetype = "application/octet-stream";
    let isFilePart = false;

    for (const line of lines) {
      const lc = line.toLowerCase();
      if (lc.startsWith("content-disposition:") && lc.includes("filename=")) {
        isFilePart = true;
        const match = line.match(/filename="?([^";]+)"?/i);
        if (match) filename = match[1];
      }
      if (lc.startsWith("content-type:")) {
        mimetype = line.split(":")[1]?.trim() || mimetype;
      }
    }

    if (isFilePart) {
      return { buffer: part.data, filename, mimetype };
    }
  }

  return { buffer: Buffer.alloc(0), filename: "", mimetype: "" };
}

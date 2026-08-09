import pdfParse from "pdf-parse";
import * as dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import DOMPurify from "isomorphic-dompurify";
import type { IncomingMessage, ServerResponse } from "http";

dotenv.config({ quiet: true });

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "20mb",
  },
};

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

// Strip path separators and traversal segments from client-supplied filenames
// before they become part of a Storage object path. Without this, a raw
// filename such as "team/Q3.pdf" or "report_.._final.pdf" produces an object
// path that the download guard will refuse to sign, making the file
// permanently un-downloadable.
function sanitizeStorageFilename(filename: string): string {
  let name =
    String(filename || "document.pdf").replace(/\\/g, "/").split("/").pop() ||
    "document.pdf";
  name = name
    .replace(/\.\./g, "_")
    // eslint-disable-next-line no-useless-escape
    .replace(/[\/\\]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "_")
    .trim();
  if (!name || name === "." || name === "..") name = "document.pdf";
  if (name.length > 120) {
    const extMatch = name.match(/\.[a-zA-Z0-9]{1,10}$/);
    const ext = extMatch ? extMatch[0] : "";
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name;
}

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
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const repaired = extracted
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_m, p1) => {
        return '"' + p1.replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
      });
    try {
      return JSON.parse(repaired);
    } catch {
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
      } catch (err3: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err3e = err3 as any;
        throw new Error(
          `JSON parsing failed after all repairs: ${e.message} / ${err3e.message}`,
        );
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      ? payload.risk_assessment.map((item: unknown) =>
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
      description: "The text references liquidity or cash flow themes.",
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
      `Automated analysis for ${fileName}. ` +
      `The upload contains about ${wordCount} words across ${paragraphCount || 1} paragraph group(s) and ${characterCount} characters. ` +
      (reason
        ? `The AI pipeline noted: (${reason}). `
        : "") +
      `This report provides a structured overview of the document findings.`,
    key_metrics: {
      word_count: wordCount,
      character_count: characterCount,
      paragraph_count: paragraphCount,
      theme_count: matchedThemes.length,
    },
    risk_assessment: riskAssessment,
    action_items: [
      "Review the document manually for figures, obligations, and deadlines.",
      "Confirm any debt, cash flow, or covenant language against official statements.",
      "Check whether key assumptions match current business conditions.",
      "Verify any compliance or policy references against control evidence.",
      "Route document to domain reviewer before relying on it operationally.",
    ],
    sentiment_score: sentimentScore,
    entities,
    full_report: [
      `This report was generated based on automated document ingestion for ${fileName}.`,
      `The document appears to be ${wordCount > 0 ? `roughly ${wordCount} words long` : "light on extractable text"}, with ${paragraphCount || 1} paragraph group(s) detected.`,
      `Keyword signals suggest the dominant themes are ${themeSummary}. If the text contains leverage, liquidity, guidance, or compliance references, those areas should be checked first.`,
      `From a control perspective, validate critical numbers and obligations and compare any apparent trends against records.`,
      `This report preserves continuity of the upload flow and provides immediate structured assessment for operational review.`,
    ].join("\n\n"),
  };
}

function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" {
  const n = String(value || "").toLowerCase();
  if (n.includes("high")) return "high";
  if (n.includes("medium") || n.includes("moderate")) return "medium";
  return "low";
}

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
      const svc =
        typeof rawServiceAccount === "string"
          ? JSON.parse(rawServiceAccount)
          : rawServiceAccount;
      if (svc.private_key && typeof svc.private_key === "string") {
        svc.private_key = svc.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(svc),
        projectId: svc.project_id || firebaseProjectId,
        storageBucket,
      });
      return true;
    } catch (err) {
      console.warn("[analyze] Failed to parse FIREBASE_SERVICE_ACCOUNT:", err);
    }
  }

  try {
    admin.initializeApp({ projectId: firebaseProjectId, storageBucket });
    return true;
  } catch (err) {
    console.warn("[analyze] Firebase Admin default init failed:", err);
    return false;
  }
}

type VercelReq = IncomingMessage & { [key: string]: any };
type VercelRes = ServerResponse & {
  status(code: number): VercelRes;
  json(body: unknown): void;
};

async function getRawBody(req: VercelReq): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "binary");
  if (req.body && typeof req.body === "object" && Buffer.isBuffer((req.body as any).raw)) {
    return (req.body as any).raw;
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (err) => reject(err));
    if (req.readableEnded) {
      resolve(Buffer.concat(chunks));
    }
  });
}

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

    let sepIndex = part.indexOf("\r\n\r\n");
    let sepLength = 4;
    if (sepIndex === -1) {
      sepIndex = part.indexOf("\n\n");
      sepLength = 2;
    }

    if (sepIndex !== -1) {
      const headerBuf = part.slice(0, sepIndex);
      let dataBuf = part.slice(sepIndex + sepLength);
      if (dataBuf.length >= 2 && dataBuf[dataBuf.length - 2] === 0x0d && dataBuf[dataBuf.length - 1] === 0x0a) {
        dataBuf = dataBuf.slice(0, dataBuf.length - 2);
      } else if (dataBuf.length >= 1 && dataBuf[dataBuf.length - 1] === 0x0a) {
        dataBuf = dataBuf.slice(0, dataBuf.length - 1);
      }
      parts.push({ headers: headerBuf.toString("utf8"), data: dataBuf });
    }
    start = end;
  }

  for (const part of parts) {
    const lines = part.headers.split(/\r?\n/);
    let filename = "";
    let mimetype = "application/pdf";
    let isFile = false;

    for (const line of lines) {
      const lc = line.toLowerCase();
      if (lc.startsWith("content-disposition:") && (lc.includes("filename=") || lc.includes("name="))) {
        isFile = true;
        const match = line.match(/filename="?([^";\r\n]+)"?/i);
        if (match) filename = match[1];
      }
      if (lc.startsWith("content-type:")) {
        mimetype = line.split(":")[1]?.trim() || mimetype;
      }
    }

    if (isFile && part.data.length > 0) {
      return { buffer: part.data, filename: filename || "document.pdf", mimetype };
    }
  }

  if (parts.length > 0) {
    for (const part of parts) {
      if (part.data.length > 100) {
        return { buffer: part.data, filename: "document.pdf", mimetype: "application/pdf" };
      }
    }
  }

  return { buffer: Buffer.alloc(0), filename: "", mimetype: "" };
}

export default async function handler(req: VercelReq, res: VercelRes) {
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
    await ensureAdminInitialized();

    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: {
          stage: "AUTH_VERIFICATION",
          reason: "Missing or invalid Authorization token",
          recommendation:
            "You are not authorized. Please sign in and try again.",
        },
      });
      return;
    }

    if (!admin.apps.length) {
      res.status(401).json({
        error: {
          stage: "AUTH_VERIFICATION",
          reason: "Authentication could not be verified",
          recommendation:
            "Server configuration error. Please try again later.",
        },
      });
      return;
    }

    const idToken = authHeader.slice(7);
    let ownerId = "";
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      if (decoded.email_verified !== true) {
        res.status(403).json({
          error: {
            stage: "AUTH_VERIFICATION",
            reason: "Email address is not verified",
            recommendation:
              "Verify your email address to access this feature, then sign in again.",
          },
        });
        return;
      }
      ownerId = decoded.uid;
    } catch (authErr: any) {
      console.warn("[analyze] verifyIdToken failed:", authErr?.message);
      res.status(401).json({
        error: {
          stage: "AUTH_VERIFICATION",
          reason: `Invalid ID token: ${authErr?.message || String(authErr)}`,
          recommendation:
            "Your session token has expired or is invalid. Please sign out and sign in again.",
        },
      });
      return;
    }

    const contentType = String(req.headers["content-type"] || "");
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
    const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] : null;

    const bodyBuffer = await getRawBody(req);
    let fileBuffer: Buffer = Buffer.alloc(0);
    let filename = "document.pdf";

    if (boundary && bodyBuffer.length > 0) {
      const parsed = parseMultipart(bodyBuffer, boundary);
      fileBuffer = parsed.buffer;
      filename = parsed.filename || filename;
    } else if (bodyBuffer.length > 0) {
      fileBuffer = bodyBuffer;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new PipelineError(
        "PDF_INGESTION",
        "No PDF file content detected in upload request.",
        "Please select a valid PDF file to upload.",
      );
    }

    let extractedText = "";
    try {
      const parsedPdf = await pdfParse(fileBuffer);
      extractedText = String(parsedPdf?.text || "").trim();
    } catch (pdfErr: any) {
      console.warn("[analyze] pdfParse failed, using text fallback:", pdfErr?.message);
      extractedText = fileBuffer.toString("utf8").replace(/[^\x20-\x7E\n\r\t]/g, " ").trim();
    }

    if (!extractedText || extractedText.length < 20) {
      extractedText = `Document: ${filename}\nFile Size: ${fileBuffer.length} bytes.\nNotice: Scanned PDF or non-standard text layer.`;
    }

    const hfApiKey = getEnv("HUGGINGFACE_API_KEY");
    let validPayload: AnalysisResponse | null = null;
    let fallbackReason = "";

    if (hfApiKey) {
      try {
        const { InferenceClient } = await import("@huggingface/inference");
        const hfClient = new InferenceClient(hfApiKey);
        const systemPrompt = `You are a senior financial intelligence analyst. Produce detailed financial analysis based ONLY on the provided document.

Return ONLY valid JSON with keys: summary, key_metrics, risk_assessment, action_items, sentiment_score, entities, full_report.
full_report MUST be at least 300 words.`;

        const completion = await Promise.race([
          hfClient.chatCompletion({
            model: "Qwen/Qwen2.5-Coder-32B-Instruct",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `--- BEGIN DOCUMENT ---\n${extractedText.slice(0, 12000)}\n--- END DOCUMENT ---\n\nAnalyze this document. Return ONLY valid JSON.`,
              },
            ],
            max_tokens: 3000,
            temperature: 0.2,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Hugging Face API request timed out (15s)")), 15000),
          ),
        ]);

        const rawText = completion.choices?.[0]?.message?.content || "{}";
        const parsed = safeJsonParse(rawText);
        validPayload = validateAnalysisPayload(parsed);
      } catch (hfErr: any) {
        console.warn("[analyze] Hugging Face inference skipped/failed:", hfErr?.message);
        fallbackReason = hfErr?.message || "Hugging Face model unavailable";
      }
    } else {
      fallbackReason = "HUGGINGFACE_API_KEY is not configured on server";
    }

    if (!validPayload) {
      validPayload = buildFallbackAnalysis(
        extractedText,
        filename,
        fallbackReason || undefined,
      );
    }

    const rawRisk =
      validPayload.risk_assessment?.[0] &&
      typeof validPayload.risk_assessment[0] === "object"
        ? (validPayload.risk_assessment[0] as any).level
        : "low";
    const riskLevel = normalizeRiskLevel(rawRisk);
    const now = new Date();
    const safeFilename = sanitizeStorageFilename(filename);
    const storagePath = `analyses/${ownerId}/${now.getTime()}_${safeFilename}`;
    const fileUrl = `https://finsight.local/storage/${encodeURIComponent(storagePath)}`;

    const docData: any = {
      ownerId,
      fileName: filename,
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

    let documentId = `local-${ownerId}-${now.getTime()}`;

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
      } catch (writeErr: any) {
        console.warn("[analyze] Firestore server write skipped:", writeErr?.message);
        documentId = `local-${ownerId}-${now.getTime()}`;
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

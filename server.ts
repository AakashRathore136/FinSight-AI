import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { InferenceClient } from "@huggingface/inference";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import * as dotenv from "dotenv";
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import cors from "cors";
import rateLimit from "express-rate-limit";
import DOMPurify from "isomorphic-dompurify";

dotenv.config({ quiet: true });

console.log("HF_KEY_EXISTS:", !!process.env.HUGGINGFACE_API_KEY);


const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  // Reject non-PDF uploads before multer buffers the file into memory,
  // instead of buffering it fully and only checking mimetype afterwards.
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are accepted"));
    }
    cb(null, true);
  },
});

type AnalysisResponse = {
  summary: string;
  key_metrics: Record<string, any>;
  risk_assessment: Array<{ level?: string; description?: string } | string>;
  action_items: string[];
  sentiment_score: number;
  entities: string[];
  full_report: string;
};

const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const firestoreDatabaseId = String(process.env.FIREBASE_FIRESTORE_DATABASE_ID || "(default)").trim() || "(default)";
const firestoreBaseUrl = firebaseProjectId
  ? `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents`
  : "";

// Explicit CORS allowlist. In production, only APP_URL (the deployed
// frontend origin) may call this API with credentials. Local Vite dev
// ports are allowed so `npm run dev` keeps working out of the box.
const allowedOrigins = new Set(
  [
    process.env.APP_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter((origin): origin is string => Boolean(origin) && origin !== "MY_APP_URL")
);

type VerifiedUser = {
  uid: string;
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

function safeJsonParse(text: string): any {
  let cleaned = (text || "").trim();
  if (!cleaned) {
    throw new Error("Empty model response");
  }

  // 1. Extract JSON block if surrounded by markdown or other text
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // 2. Try parsing directly
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // 3. Perform common repairs:
    // a. Remove trailing commas before closing braces/brackets
    let repaired = cleaned
      .replace(/,\s*([}\]])/g, "$1") // trailing commas
      // b. Handle unescaped newlines in JSON strings.
      .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
      });

    try {
      return JSON.parse(repaired);
    } catch (err2: any) {
      // c. Attempt to repair truncated JSON by appending missing brackets
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escape = false;
      let repairStr = repaired;

      for (let i = 0; i < repairStr.length; i++) {
        const char = repairStr[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      if (inString) {
        repairStr += '"';
      }

      while (openBrackets > 0) {
        repairStr += ']';
        openBrackets--;
      }
      while (openBraces > 0) {
        repairStr += '}';
        openBraces--;
      }

      try {
        return JSON.parse(repairStr);
      } catch (err3: any) {
        throw new Error(`JSON parsing failed after all repairs. Original: ${err.message}. Repaired: ${err3.message}`);
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
    if (!(key in payload)) {
      throw new Error(`Model response missing required key: ${key}`);
    }
  }

  const fullReport = String(payload.full_report || "").trim();
  const wordCount = fullReport.split(/\s+/).filter(Boolean).length;
  if (wordCount < 120) {
    throw new Error(`Model response full_report is too short (${wordCount} words)`);
  }
  if (wordCount < 450) {
    console.warn(`AI_SCHEMA_VALIDATION_WARNING: full_report is ${wordCount} words; accepting shorter valid analysis.`);
  }

  return {
    summary: sanitizeString(String(payload.summary || "")),
    key_metrics: typeof payload.key_metrics === "object" && payload.key_metrics ? payload.key_metrics : {},
    risk_assessment: Array.isArray(payload.risk_assessment) ? payload.risk_assessment.map((item: any) => {
      if (typeof item === "object" && item) {
        return {
          level: sanitizeString(String(item.level || "")),
          description: sanitizeString(String(item.description || "")),
        };
      }
      return sanitizeString(String(item || ""));
    }) : [],
    action_items: Array.isArray(payload.action_items) ? payload.action_items.map((v: unknown) => sanitizeString(String(v))) : [],
    sentiment_score: Number(payload.sentiment_score || 0),
    entities: Array.isArray(payload.entities) ? payload.entities.map((v: unknown) => sanitizeString(String(v))) : [],
    full_report: sanitizeString(fullReport),
  };
}

function sanitizeString(text: string): string {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "medium";
  return "low";
}

function isDefaultCredentialsError(error: any): boolean {
  const message = String(error?.message || error || "");
  return message.includes("Could not load the default credentials") ||
    message.includes("Could not load the default credentials.") ||
    message.includes("application default credentials");
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedUser> {
  if (!admin.apps.length) {
    throw new Error("Firebase Admin SDK is not initialized");
  }

  const decoded = await admin.auth().verifyIdToken(idToken);
  return { uid: decoded.uid };
}

/**
 * Verifies the Firebase ID token on every /api/* request (except /api/health)
 * before any route handler runs, so a new route can never be added without
 * authentication by accident. Attaches the verified uid to req.ownerId.
 */
async function requireFirebaseAuth(req: any, res: any, next: any) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        stage: "AUTH_VERIFICATION",
        reason: "Missing or invalid Authorization token",
        recommendation: "You are not authorized. Please refresh your session or sign in again.",
      },
    });
  }

  const idToken = authHeader.split(' ')[1];
  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    req.ownerId = decoded.uid;
    req.idToken = idToken;
    next();
  } catch (err: any) {
    console.error('AUTH_ERROR: ID token verification failed', err?.message || err);
    return res.status(401).json({
      error: {
        stage: "AUTH_VERIFICATION",
        reason: `Invalid ID token: ${err?.message || String(err)}`,
        recommendation: "Your session token has expired or is invalid. Please sign out and sign in again.",
      },
    });
  }
}

async function enrichUserContext(req: any, res: any, next: any) {
  try {
    if (!req.ownerId) {
      req.userRole = 'free';
      return next();
    }

    if (!admin.apps.length) {
      req.userRole = 'free';
      return next();
    }

    const db = getFirestore();
    const userDoc = await db.collection('users').doc(req.ownerId).get();
    req.userRole = userDoc.data()?.role || 'free';
    next();
  } catch (err: any) {
    console.warn('Failed to load user role for rate limiting:', err?.message || err);
    req.userRole = 'free';
    next();
  }
}

function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, toFirestoreValue(nestedValue)])
        ),
      },
    };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
}

function toFirestoreFields(data: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

async function createFirestoreDocumentViaRest(collectionPath: string, data: Record<string, any>, idToken: string): Promise<string> {
  if (!firestoreBaseUrl) {
    throw new Error("FIREBASE_PROJECT_ID is not configured");
  }
  const response = await fetch(`${firestoreBaseUrl}/${collectionPath}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });

  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Firestore REST write failed with status ${response.status}`);
  }

  const name = String(body.name || "");
  return name.split("/").pop() || "";
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  // Initialize Firebase Admin if credentials are available
  if (!firebaseProjectId) {
    console.warn('FIREBASE_PROJECT_ID is not configured — Firebase Admin initialization skipped.');
  } else {
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(svc),
          projectId: firebaseProjectId,
        });
        console.log('Firebase admin initialized from FIREBASE_SERVICE_ACCOUNT');
      } else {
        // Attempt application default credentials (GOOGLE_APPLICATION_CREDENTIALS)
        admin.initializeApp({ projectId: firebaseProjectId });
        console.log('Firebase admin initialized with application default credentials');
      }
    } catch (err: any) {
      if (isDefaultCredentialsError(err)) {
        console.warn('Firebase admin initialization failed — FIREBASE_SERVICE_ACCOUNT or ADC credentials are required.', err?.message || err);
      } else {
        console.warn('Firebase admin initialization failed — server-side Firestore writes will be disabled.', err?.message || err);
      }
    }
  }

  // Explicit CORS policy — only the deployed frontend origin (and local
  // dev ports) may call this API, instead of the implicit wildcard that
  // cors() with no options would produce.
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests (no Origin header).
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    })
  );

  app.use(express.json());

  // Security headers middleware to prevent clickjacking and MIME-sniffing attacks
  app.use((req, res, next) => {
    // X-Frame-Options: Prevent the application from being embedded in iframes
    res.setHeader('X-Frame-Options', 'DENY');
    // X-Content-Type-Options: Prevent browser MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Strict-Transport-Security: Force HTTPS (if in production)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Content-Security-Policy: Restrict resource loading to prevent XSS
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;");
    // X-XSS-Protection: Enable browser XSS protection (defense-in-depth)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer-Policy: Control how much referrer information is shared
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions-Policy: Disable potentially dangerous browser features
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  // Simple request logger for debugging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // JSON parse error handler (catches body-parser SyntaxError)
  app.use((err: any, req: any, res: any, next: any) => {
    if (err && err.type === 'entity.parse.failed') {
      console.warn('Invalid JSON payload received for', req.url);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      console.warn('SyntaxError parsing JSON for', req.url);
      return res.status(400).json({ error: 'Malformed JSON' });
    }
    next(err);
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Require a valid Firebase ID token on every other /api/* route so a
  // route added in the future can't accidentally ship without auth.
  app.use("/api", requireFirebaseAuth);

  // Enrich user context with role information for rate limiting decisions
  app.use("/api", enrichUserContext);

  // Rate limiting for /api/analyze endpoint to prevent API quota exhaustion
  // Limits: 5 requests per user per day, 2 concurrent requests per user per hour
  const analyzeRateLimiter = rateLimit({
    keyGenerator: (req: any) => req.ownerId || req.ip,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 5, // 5 requests per user per day
    message: {
      error: {
        stage: "RATE_LIMIT",
        reason: "Daily analysis quota exceeded (5 analyses per 24 hours per user)",
        recommendation: "Please try again tomorrow or upgrade your plan.",
      },
    },
    standardHeaders: false,
    skip: (req: any) => {
      const userRole = req.userRole || 'free';
      return userRole === 'premium' || userRole === 'admin';
    },
  });

  // In-flight concurrency limiter (separate from request-rate limiting)
  const inFlightAnalyzeByUser = new Map<string, number>();

  const concurrentAnalyzeLimiter = (req: any, res: any, next: any) => {
    const userRole = req.userRole || 'free';
    if (userRole === 'premium' || userRole === 'admin') return next();

    const key = String(req.ownerId || req.ip);
    const current = inFlightAnalyzeByUser.get(key) || 0;
    if (current >= 2) {
      return res.status(429).json({
        error: {
          stage: "CONCURRENT_LIMIT",
          reason: "Too many concurrent analysis requests (max 2 at a time)",
          recommendation: "Please wait for an in-progress analysis to finish before submitting another.",
        },
      });
    }

    inFlightAnalyzeByUser.set(key, current + 1);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      const updated = (inFlightAnalyzeByUser.get(key) || 1) - 1;
      if (updated <= 0) inFlightAnalyzeByUser.delete(key);
      else inFlightAnalyzeByUser.set(key, updated);
    };

    res.once('finish', cleanup);
    res.once('close', cleanup);
    next();
  };

  // AI Analysis Endpoint
  app.post("/api/analyze", analyzeRateLimiter, concurrentAnalyzeLimiter, upload.single("file"), async (req: any, res) => {
    try {
      console.log('=== PDF INGESTION START ===');
      const file = req.file;

      if (!file) {
        throw new PipelineError(
          "PDF_INGESTION",
          "No file uploaded",
          "Please select a valid PDF file to upload."
        );
      }

      console.log(`PDF_FILE_RECEIVED: name=${file.originalname}, size=${file.size} bytes, mimetype=${file.mimetype}`);

      if (file.mimetype !== "application/pdf") {
        throw new PipelineError(
          "PDF_INGESTION",
          `Invalid MIME type: ${file.mimetype}`,
          "Only PDF files are supported. Please convert your file to PDF format."
        );
      }

      // requireFirebaseAuth middleware has already verified the token
      // and attached the uid/token before this handler runs.
      const ownerId = req.ownerId as string;
      const idToken = req.idToken as string;

      // Extract text from PDF buffer
      console.log('PDF_EXTRACTION_START: using pdf-parse');
      let extractedText = '';
      {
        const parser = new PDFParse({ data: file.buffer });
        const parserDestroyTimeout = setTimeout(() => {
          console.warn('PDF_PARSE_DESTROY_TIMEOUT: parser.destroy() did not complete within 5s, process continuing');
        }, 5000);

        try {
          const parsed = await parser.getText();
          extractedText = (parsed?.text || "").trim();
        } catch (extractError: any) {
          console.error('PDF_EXTRACTION_ERROR: Failed to parse PDF', extractError?.message || extractError);
          throw new PipelineError(
            "PDF_EXTRACTION",
            `Failed to parse PDF: ${extractError?.message || 'Unknown error'}`,
            "Ensure the uploaded file is a valid, uncorrupted, and unencrypted PDF."
          );
        } finally {
          clearTimeout(parserDestroyTimeout);
          try {
            await Promise.race([
              parser.destroy(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('destroy timeout')), 5000))
            ]);
          } catch (destroyError: any) {
            console.warn('PDF_PARSE_DESTROY_ERROR: Failed to cleanly destroy parser', destroyError?.message || destroyError);
          }
        }
      }

      console.log(`PDF_EXTRACTION_COMPLETE: extracted ${extractedText.length} characters`);
      console.log(`PDF_TEXT_PREVIEW: ${extractedText.slice(0, 500)}`);

      // Validate extraction
      if (!extractedText || extractedText.length < 100) {
        throw new PipelineError(
          "PDF_VALIDATION",
          `PDF extraction yielded insufficient text (${extractedText.length} characters).`,
          "Make sure the PDF contains selectable, readable text (not scanned images without OCR processing)."
        );
      }

      console.log('PDF_VALIDATION_PASSED: text meets minimum requirements');

      dotenv.config({ quiet: true });
      const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
      if (!huggingFaceApiKey) {
        throw new PipelineError(
          "AI_CONFIG",
          "HUGGINGFACE_API_KEY is not configured on the server",
          "Set the HUGGINGFACE_API_KEY environment variable."
        );
      }
      const hfClient = new InferenceClient(huggingFaceApiKey);

      // Build AI request with REAL extracted PDF text
      const systemPrompt = `You are a senior financial intelligence analyst. Produce detailed financial analysis based ONLY on the provided document.

Return ONLY valid JSON. No markdown, no code blocks, no explanations outside JSON.

Schema:
{
  "summary": "string - executive summary 150+ words",
  "key_metrics": "object - metrics with numeric values",
  "risk_assessment": "array - objects with level and description",
  "action_items": "array - 5+ specific recommendations",
  "sentiment_score": "number between -1.0 and 1.0",
  "entities": "array - organizations and people mentioned",
  "full_report": "string - comprehensive analysis 600+ words"
}

full_report REQUIREMENTS:
- MUST be 600+ words (minimum 600)
- Structured in 4-5 substantial paragraphs
- Each paragraph 150+ words with clear topic sentence
- Paragraph 1: Executive overview of financial position and outlook
- Paragraph 2: Detailed risk analysis with specific risks identified
- Paragraph 3: Key metrics and financial performance assessment  
- Paragraph 4: Strategic implications and recommendations
- Use data and figures from the document only
- Professional financial language
- NO markdown formatting
- NO hallucinations or invented data

CRITICAL RULES:
- Reference specific metrics from source document
- Explain implications and what data means
- Use formal, professional tone
- Return ONLY the JSON object`;

      console.log('AI_REQUEST_PREPARATION: payload ready with real extracted PDF text');
      console.log(`AI_REQUEST_CONTENT_LENGTH: ${extractedText.length} characters from PDF`);
      
      let validPayload: AnalysisResponse | null = null;
      let retries = 0;
      const maxRetries = 1;

      while (retries <= maxRetries && !validPayload) {
        console.log(`AI_REQUEST_START (attempt ${retries + 1}): calling Llama-3.3-70B-Instruct via Hugging Face Inference (together)`);
        
        const messages: any[] = [
          {
            role: "system",
            content: systemPrompt
          }
        ];

        if (retries === 0) {
          messages.push({
            role: "user",
            content: extractedText
          });
        } else {
          messages.push({
            role: "user",
            content: `${extractedText}\n\nPrevious analysis was too brief. EXPAND the full_report to 1000+ words with detailed findings, risks, and recommendations. Return only valid JSON.`
          });
        }

        try {
          const completion = await hfClient.chatCompletion({
            provider: "together",
            model: "meta-llama/Llama-3.3-70B-Instruct",
            messages,
            max_tokens: 5000,
            temperature: 0.2
          });
          console.log('AI_REQUEST_COMPLETE: received response from Llama-3.3-70B-Instruct');

          const rawText = completion.choices?.[0]?.message?.content || "{}";
          console.log(`AI_RESPONSE_LENGTH: ${rawText.length} characters`);

          // Parse JSON response from AI
          console.log('AI_JSON_PARSING_START');
          let parsedResponse;
          try {
            parsedResponse = safeJsonParse(rawText);
          } catch (parseError: any) {
            console.error('AI_JSON_PARSE_ERROR:', parseError?.message || parseError);
            console.error('AI_RAW_RESPONSE_SAMPLE:', rawText.slice(0, 500));
            if (retries >= maxRetries) {
              throw new PipelineError(
                "JSON_PARSING",
                `Failed to parse JSON response from AI: ${parseError?.message}`,
                "The AI model output could not be parsed as valid JSON. Retrying may yield clean JSON output."
              );
            }
            retries++;
            continue;
          }
          console.log('AI_JSON_PARSE_SUCCESS');

          // Validate against schema
          console.log('AI_SCHEMA_VALIDATION_START');
          try {
            validPayload = validateAnalysisPayload(parsedResponse);
            console.log('AI_SCHEMA_VALIDATION_SUCCESS');
            console.log(`AI_ANALYSIS_GENERATED: summary=${validPayload.summary.substring(0, 100)}...`);
            console.log(`AI_FULL_REPORT_LENGTH: ${validPayload.full_report.length} characters`);
          } catch (validateError: any) {
            console.error('AI_SCHEMA_VALIDATION_ERROR:', validateError?.message || validateError);
            if (retries >= maxRetries) {
              throw new PipelineError(
                "SCHEMA_VALIDATION",
                `AI response failed validation: ${validateError?.message}`,
                "The AI model failed to structure its response properly. Try submitting again to recreate."
              );
            }
            retries++;
            continue;
          }
        } catch (hfError: any) {
          if (hfError instanceof PipelineError) {
            throw hfError;
          }
          console.error('HUGGINGFACE_INFERENCE_ERROR:', hfError?.message || hfError);
          if (retries >= maxRetries) {
            throw new PipelineError(
              "AI_INFERENCE",
              `Hugging Face inference failed: ${hfError?.message || String(hfError)}`,
              "Verify the HUGGINGFACE_API_KEY environment variable. Hugging Face could be experiencing temporary downtime."
            );
          }
          retries++;
          continue;
        }
      }

      if (!validPayload) {
        throw new PipelineError(
          "AI_INFERENCE",
          "Failed to generate valid analysis after retries",
          "The AI model repeatedly failed validation rules. Try a different document or request a simpler scan."
        );
      }

      console.log(`FIRESTORE_WRITE_START: ownerId=${ownerId}, database=${firestoreDatabaseId}, document=${file.originalname}`);

      // Compose document record
      const rawRiskLevel = (validPayload.risk_assessment && validPayload.risk_assessment[0] && typeof validPayload.risk_assessment[0] === 'object') ? validPayload.risk_assessment[0].level : 'low';
      const riskLevel = normalizeRiskLevel(rawRiskLevel);
      const now = new Date();

      const docData: any = {
        ownerId,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        fileUrl: '',
        storagePath: '',
        status: 'completed',
        riskLevel,
        createdAt: now,
        updatedAt: now,
      };

      const analysisDoc = {
        ...validPayload,
        documentId: '',
        ownerId,
        riskLevel,
        processedAt: now,
      };

      let documentId = '';
      let analysisId = '';
      try {
        if (!admin.apps.length) {
          throw new Error("Firebase Admin SDK not initialized");
        }
        const dbAdmin = getFirestore(firestoreDatabaseId);
        const adminDocData = {
          ...docData,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const docRef = await dbAdmin.collection('documents').add(adminDocData);
        documentId = docRef.id;
        console.log(`FIRESTORE_DOCUMENT_CREATED: documentId=${documentId}`);

        const adminAnalysisDoc = {
          ...analysisDoc,
          documentId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const analysisRef = await dbAdmin.collection(`documents`).doc(documentId).collection('analyses').add(adminAnalysisDoc);
        analysisId = analysisRef.id;
        console.log(`FIRESTORE_ANALYSIS_CREATED: analysisId=${analysisId}`);

        // Update parent with latestAnalysis snapshot when Admin credentials are available.
        await dbAdmin.collection('documents').doc(documentId).update({
          latestAnalysis: adminAnalysisDoc,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`FIRESTORE_PARENT_UPDATED: latestAnalysis snapshot stored`);
      } catch (writeError: any) {
        console.warn('Firebase Admin write failed/unavailable; falling back to Firestore REST writes with user token:', writeError?.message || writeError);
        try {
          documentId = await createFirestoreDocumentViaRest('documents', docData, idToken);
          console.log(`FIRESTORE_DOCUMENT_CREATED_REST: documentId=${documentId}`);

          analysisId = await createFirestoreDocumentViaRest(
            `documents/${documentId}/analyses`,
            { ...analysisDoc, documentId },
            idToken
          );
          console.log(`FIRESTORE_ANALYSIS_CREATED_REST: analysisId=${analysisId}`);
        } catch (restError: any) {
          console.error('FIRESTORE_REST_WRITE_FAILED:', restError?.message || restError);
          throw new PipelineError(
            "FIRESTORE_WRITE",
            `Firestore database write failed: ${restError?.message || String(restError)}`,
            "Check database security rules, database existence, and network connection."
          );
        }
      }

      console.log('=== PDF INGESTION PIPELINE COMPLETE SUCCESS ===');
      console.log(`FINAL_RESULT: documentId=${documentId}, fileName=${file.originalname}, extractedTextLength=${extractedText.length}, analysisId=${analysisId}`);
      return res.status(200).json({ documentId });
    } catch (error: any) {
      console.error("=== PDF INGESTION PIPELINE FAILED ===");
      console.error("ERROR_MESSAGE:", error?.message || error);
      console.error("ERROR_STACK:", error?.stack || 'No stack trace');
      
      const stage = error?.stage || "PIPELINE_ERROR";
      const reason = error?.message || String(error);
      const stack = error?.stack || "No stack trace";
      const recommendation = error?.recommendation || "An unexpected system interrupt occurred. Please check server logs.";
      
      return res.status(500).json({
        error: {
          stage,
          reason,
          stack,
          recommendation
        }
      });
    }
  });

  // Catches errors from the upload.single("file") middleware above —
  // oversized files (LIMIT_FILE_SIZE) and non-PDF rejections from
  // fileFilter — and returns clean JSON instead of falling through to
  // Express's default HTML error page.
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({
        error: {
          stage: "PDF_INGESTION",
          reason: err.message,
          recommendation: err.code === "LIMIT_FILE_SIZE"
            ? `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB upload limit.`
            : "Please check the uploaded file and try again.",
        },
      });
    }
    if (err && err.message === "Only PDF files are accepted") {
      return res.status(400).json({
        error: {
          stage: "PDF_INGESTION",
          reason: err.message,
          recommendation: "Only PDF files are supported. Please convert your file to PDF format.",
        },
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinSight AI running on http://localhost:${PORT}`);
  });
}

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('UNHANDLED_PROMISE_REJECTION:', {
    reason: reason?.message || String(reason),
    stack: reason?.stack || 'No stack trace',
    timestamp: new Date().toISOString(),
  });
  console.error('Promise state:', promise);
});

process.on('uncaughtException', (error: Error) => {
  console.error('UNCAUGHT_EXCEPTION:', {
    message: error?.message || String(error),
    stack: error?.stack || 'No stack trace',
    timestamp: new Date().toISOString(),
  });
  process.exit(1);
});

startServer();

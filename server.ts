import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { InferenceClient } from "@huggingface/inference";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import * as dotenv from "dotenv";
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

dotenv.config({ quiet: true });

console.log("HF_KEY_EXISTS:", !!process.env.HUGGINGFACE_API_KEY);


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
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

const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || "(default)";
const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents`;

type VerifiedUser = {
  uid: string;
};

function parseGeminiJson(text: string): any {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    throw new Error("Empty model response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned);
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
    summary: String(payload.summary || ""),
    key_metrics: typeof payload.key_metrics === "object" && payload.key_metrics ? payload.key_metrics : {},
    risk_assessment: Array.isArray(payload.risk_assessment) ? payload.risk_assessment : [],
    action_items: Array.isArray(payload.action_items) ? payload.action_items.map((v: unknown) => String(v)) : [],
    sentiment_score: Number(payload.sentiment_score || 0),
    entities: Array.isArray(payload.entities) ? payload.entities.map((v: unknown) => String(v)) : [],
    full_report: fullReport,
  };
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
  if (admin.apps.length) {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return { uid: decoded.uid };
    } catch (error: any) {
      if (!isDefaultCredentialsError(error)) {
        throw error;
      }
      console.warn("Firebase Admin credentials unavailable; falling back to Identity Toolkit token verification.");
    }
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.users?.[0]?.localId) {
    const message = body?.error?.message || "Invalid ID token";
    throw new Error(message);
  }

  return { uid: body.users[0].localId };
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
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(svc),
        projectId: firebaseConfig.projectId,
      });
      console.log('Firebase admin initialized from FIREBASE_SERVICE_ACCOUNT');
    } else {
      // Attempt application default credentials (GOOGLE_APPLICATION_CREDENTIALS)
      admin.initializeApp({ projectId: firebaseConfig.projectId });
      console.log('Firebase admin initialized with application default credentials');
    }
  } catch (err: any) {
    console.warn('Firebase admin initialization failed — server-side Firestore writes will be disabled.', err?.message || err);
  }

  app.use(express.json());

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

  // AI Analysis Endpoint
  app.post("/api/analyze", upload.single("file"), async (req, res) => {
    try {
      console.log('=== PDF INGESTION START ===');
      const file = req.file;

      if (!file) {
        console.error('PDF_EXTRACTION_ERROR: No file uploaded');
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`PDF_FILE_RECEIVED: name=${file.originalname}, size=${file.size} bytes, mimetype=${file.mimetype}`);

      if (file.mimetype !== "application/pdf") {
        console.error(`PDF_EXTRACTION_ERROR: Invalid MIME type: ${file.mimetype}`);
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Verify admin SDK and auth before spending time/money on parsing or AI inference.
      if (!admin.apps.length) {
        console.error('FIRESTORE_ERROR: Firebase admin SDK not initialized');
        return res.status(500).json({ error: 'Server misconfiguration: Firebase Admin is not initialized' });
      }

      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) {
        console.error('AUTH_ERROR: Missing or invalid Authorization token');
        return res.status(401).json({ error: 'Missing or invalid Authorization token' });
      }

      const idToken = authHeader.split(' ')[1];
      let ownerId = 'unknown';
      try {
        const decoded = await verifyFirebaseIdToken(idToken);
        ownerId = decoded.uid;
      } catch (err: any) {
        console.error('AUTH_ERROR: ID token verification failed', err?.message || err);
        return res.status(401).json({ error: 'Invalid ID token' });
      }

      // Extract text from PDF buffer
      console.log('PDF_EXTRACTION_START: using pdf-parse');
      let extractedText = '';
      try {
        const parser = new PDFParse({ data: file.buffer });
        try {
          const parsed = await parser.getText();
          extractedText = (parsed?.text || "").trim();
        } finally {
          await parser.destroy().catch(() => undefined);
        }
      } catch (extractError: any) {
        console.error('PDF_EXTRACTION_ERROR: Failed to parse PDF', extractError?.message || extractError);
        return res.status(400).json({ error: `PDF extraction failed: ${extractError?.message || 'Unknown error'}` });
      }

      console.log(`PDF_EXTRACTION_COMPLETE: extracted ${extractedText.length} characters`);
      console.log(`PDF_TEXT_PREVIEW: ${extractedText.slice(0, 500)}`);

      // Validate extraction
      if (!extractedText || extractedText.length < 100) {
        console.error(`PDF_EXTRACTION_ERROR: Extracted text too short (${extractedText.length} chars). Requires minimum 100 characters.`);
        return res.status(400).json({ error: `PDF extraction yielded insufficient text (${extractedText.length} chars). Ensure PDF contains readable text.` });
      }

      console.log('PDF_VALIDATION_PASSED: text meets minimum requirements');

      dotenv.config({ quiet: true });
      const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
      if (!huggingFaceApiKey) {
        console.error('AI_CONFIG_ERROR: HUGGINGFACE_API_KEY is not configured');
        return res.status(500).json({ error: "HUGGINGFACE_API_KEY is not configured" });
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
        console.log(`AI_REQUEST_START (attempt ${retries + 1}): calling Llama-3.3-70B-Instruct via Hugging Face Inference (novita)`);
        
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

        const completion = await hfClient.chatCompletion({
          provider: "novita",
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
          parsedResponse = parseGeminiJson(rawText);
        } catch (parseError: any) {
          console.error('AI_JSON_PARSE_ERROR:', parseError?.message || parseError);
          console.error('AI_RAW_RESPONSE_SAMPLE:', rawText.slice(0, 500));
          if (retries >= maxRetries) {
            return res.status(500).json({ error: `Hugging Face inference failed: ${parseError?.message}` });
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
            return res.status(500).json({ error: `Hugging Face inference failed: ${validateError?.message}` });
          }
          retries++;
          continue;
        }
      }

      if (!validPayload) {
        return res.status(500).json({ error: 'Failed to generate valid analysis after retries' });
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
        if (!isDefaultCredentialsError(writeError)) {
          throw writeError;
        }

        console.warn('Firebase Admin write unavailable; falling back to Firestore REST writes with user token.');
        documentId = await createFirestoreDocumentViaRest('documents', docData, idToken);
        console.log(`FIRESTORE_DOCUMENT_CREATED_REST: documentId=${documentId}`);

        analysisId = await createFirestoreDocumentViaRest(
          `documents/${documentId}/analyses`,
          { ...analysisDoc, documentId },
          idToken
        );
        console.log(`FIRESTORE_ANALYSIS_CREATED_REST: analysisId=${analysisId}`);
      }

      console.log('=== PDF INGESTION PIPELINE COMPLETE SUCCESS ===');
      console.log(`FINAL_RESULT: documentId=${documentId}, fileName=${file.originalname}, extractedTextLength=${extractedText.length}, analysisId=${analysisId}`);
      return res.status(200).json({ documentId });
    } catch (error: any) {
      console.error("=== PDF INGESTION PIPELINE FAILED ===");
      console.error("ERROR_MESSAGE:", error?.message || error);
      console.error("ERROR_STACK:", error?.stack || 'No stack trace');
      return res.status(500).json({ error: error?.message || "Failed to analyze document" });
    }
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

startServer();

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Vercel Serverless Function: /api/agent-chat
 *
 * Server-side model call for the agentic financial copilot (src/lib/chatAgent.ts).
 * The browser never holds the Hugging Face inference key; it posts the message
 * history here and this function performs the HF Inference call with the
 * server-side HUGGINGFACE_API_KEY, keeping the credential out of the client
 * bundle entirely. (Issue #1341)
 *
 * Heavy imports are dynamic so ESM/CJS interop issues cannot crash the runtime.
 */

export const maxDuration = 60; // Grant up to 60s execution time on Vercel

const DEFAULT_AGENT_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct";

function getEnv(key: string, fallback = ""): string {
  return String(process.env[key] || fallback).trim();
}

function getAllowedOrigins(): Set<string> {
  const raw = getEnv("VITE_ALLOWED_ORIGINS") || getEnv("ALLOWED_ORIGINS");
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function applyCors(req: any, res: any): void {
  const origin = String(req.headers?.origin ?? "");
  const allowed = getAllowedOrigins();
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin && !process.env.NODE_ENV?.includes("production")) {
    // Non-browser / same-origin tooling in development
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// In-memory per-user rate limiter for the paid 60s HF model call. Bounds cost
// and mitigates DoS: each authenticated user may issue at most RATE_LIMIT_MAX
// requests within RATE_LIMIT_WINDOW_MS. (State lives per serverless instance;
// this is a best-effort throttle, not a distributed guarantee.)
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const userRequestLog = new Map<string, number[]>();

function checkRateLimit(uid: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (userRequestLog.get(uid) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (hits.length >= RATE_LIMIT_MAX) {
    const oldest = hits[0];
    const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000);
    userRequestLog.set(uid, hits);
    return { allowed: false, retryAfterSec };
  }
  hits.push(now);
  userRequestLog.set(uid, hits);
  return { allowed: true, retryAfterSec: 0 };
}

async function getAdminApp(): Promise<any | null> {
  try {
    const { default: admin } = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(getEnv("FIREBASE_SERVICE_ACCOUNT"))) });
    }
    return { admin };
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  applyCors(req, res);

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method Not Allowed" }); return; }

  const authHeader = String(req.headers?.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        stage: "AUTH_VERIFICATION",
        reason: "Missing or invalid Authorization token",
        recommendation: "You are not authorized. Please sign in and try again.",
      },
    });
    return;
  }

  const appCtx = await getAdminApp();
  if (!appCtx) {
    res.status(401).json({
      error: {
        stage: "AUTH_VERIFICATION",
        reason: "Authentication could not be verified",
        recommendation: "Server configuration error. Please try again later.",
      },
    });
    return;
  }

  try {
    const decoded = await appCtx.admin.auth().verifyIdToken(authHeader.slice(7));
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
  } catch (authErr: any) {
    console.warn("[agentChat] token verify failed:", authErr?.message);
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

  // Per-user rate limit / quota on the paid HF model call to bound cost and
  // prevent abuse / DoS from a single account.
  const rate = checkRateLimit(decoded.uid);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSec));
    res.status(429).json({
      error: {
        stage: "RATE_LIMIT",
        reason: "Too many requests to the AI copilot. Please wait and try again.",
        retryAfterSec: rate.retryAfterSec,
      },
    });
    return;
  }

  const { systemPrompt, messages, model } = req.body || {};
  if (typeof systemPrompt !== "string" || !Array.isArray(messages)) {
    res.status(400).json({
      error: {
        stage: "BAD_REQUEST",
        reason: "systemPrompt (string) and messages (array) are required",
      },
    });
    return;
  }

  // Only a plain model id is accepted, never arbitrary strings, so the model
  // field cannot be abused to smuggle prompt content into the request.
  const requestedModel =
    typeof model === "string" && /^[\w.\-/]+$/.test(model)
      ? model
      : DEFAULT_AGENT_MODEL;

  const huggingFaceApiKey = getEnv("HUGGINGFACE_API_KEY");
  if (!huggingFaceApiKey) {
    res.status(503).json({
      error: {
        stage: "MODEL_UNAVAILABLE",
        reason: "HUGGINGFACE_API_KEY is not configured on the server",
      },
    });
    return;
  }

  try {
    const { InferenceClient } = await import("@huggingface/inference");
    const hfClient = new InferenceClient(huggingFaceApiKey);
    const completion = await hfClient.chatCompletion({
      model: requestedModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ] as any,
      max_tokens: 800,
      temperature: 0.2,
    });
    const content = (completion as any)?.choices?.[0]?.message?.content ?? null;
    if (content == null) {
      res.status(502).json({
        error: { stage: "MODEL_ERROR", reason: "Empty model response" },
      });
      return;
    }
    res.json({ content });
  } catch (err: any) {
    console.error("AGENT_CHAT_ERROR:", err?.message || err);
    res.status(502).json({
      error: { stage: "MODEL_ERROR", reason: "Model request failed" },
    });
  }
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const agentSource = readFileSync(
  path.join(repoRoot, "src", "lib", "chatAgent.ts"),
  "utf8",
);

const chatUtilsSource = readFileSync(
  path.join(repoRoot, "src", "lib", "chatUtils.ts"),
  "utf8",
);

const chatAssistantPath = path.join(
  repoRoot,
  "src",
  "components",
  "chat",
  "ChatAssistant.tsx",
);
const chatAssistantSource = readFileSync(chatAssistantPath, "utf8");

test("chatAgent exposes a ReAct-style agent loop", () => {
  assert.match(agentSource, /export async function runAgentLoop/);
  assert.match(agentSource, /MAX_ITERATIONS/);
  // The loop must iterate (call the model, parse, execute a tool, feed back).
  assert.match(agentSource, /for \(let i = 0; i < MAX_ITERATIONS; i\+\+\)/);
  assert.match(agentSource, /callModel/);
  assert.match(agentSource, /parseAgentJson/);
  assert.match(agentSource, /observation/);
});

test("chatAgent exposes a tool catalogue that wraps existing analysis modules", () => {
  assert.match(agentSource, /export const TOOL_CATALOGUE/);
  // The catalogue must surface the deterministic analysis functions the issue
  // names, so the model can reach them.
  assert.match(agentSource, /forecast_cash_flow/);
  assert.match(agentSource, /detect_anomalies/);
  assert.match(agentSource, /identify_recurring_transactions/);
  assert.match(agentSource, /calculate_financial_health_score/);
  assert.match(agentSource, /project_goal/);
  assert.match(agentSource, /spending_summary/);
  // Tools delegate to the real deterministic modules in src/lib/*.
  assert.match(agentSource, /calculateMonthlyForecast/);
  assert.match(agentSource, /detectAnomalies/);
  assert.match(agentSource, /identifyRecurringTransactions/);
  assert.match(agentSource, /calculateOverallScore/);
  assert.match(agentSource, /generateTimelineProjection/);
});

test("chatAgent degrades gracefully when no model/token is configured", () => {
  // runAgentLoop must return null when the model cannot be called, so callers
  // can fall back to the deterministic keyword router.
  assert.match(agentSource, /if \(!token\) return null/);
  assert.match(agentSource, /return null/);
  assert.match(
    agentSource,
    /export async function generateAgentChatResponse/,
  );
  assert.match(agentSource, /fallback/);
});

test("chatUtils re-exports the agentic copilot alongside the keyword router", () => {
  // The deterministic keyword router is preserved as the fallback.
  assert.match(chatUtilsSource, /export function generateChatResponse/);
  assert.match(chatUtilsSource, /lowerMessage\.includes/);
  // The agentic entry point is re-exported from chatUtils.
  assert.match(
    chatUtilsSource,
    /export \{ generateAgentChatResponse, runAgentLoop, TOOL_CATALOGUE \} from "\.\/chatAgent"/,
  );
});

test("ChatAssistant no longer inserts an artificial thinking delay", () => {
  // The fake 1200 + random*800 ms sleep must be gone.
  assert.doesNotMatch(
    chatAssistantSource,
    /setTimeout\(resolve, 1200 \+ Math\.random\(\) \* 800\)/,
  );
  // The assistant now awaits the agentic (async) response with a fallback.
  assert.match(chatAssistantSource, /generateAgentChatResponse/);
  assert.match(chatAssistantSource, /generateChatResponse/);
  assert.match(chatAssistantSource, /await generateAgentChatResponse/);
});

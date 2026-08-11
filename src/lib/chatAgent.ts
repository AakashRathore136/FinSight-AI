/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agentic Financial Copilot — a ReAct-style tool-calling agent loop that
 * exposes the existing deterministic financial analysis modules
 * (src/lib/cashflowUtils, insightsUtils, healthUtils, goalUtils, ...) as
 * tools the model can pick, sequence, and read before answering.
 *
 * The model chooses and sequences tools; it never computes. Every figure in
 * the final answer comes from a deterministic function that already ships in
 * this repo. When no model/token is configured, runAgentLoop returns null so
 * callers fall back to the deterministic keyword router in chatUtils.ts.
 */

import { HfInference } from "@huggingface/inference";

import { calculateMonthlyForecast, identifyRecurringTransactions } from "./cashflowUtils";
import { detectAnomalies } from "./insightsUtils";
import {
  calculateSpendingScore,
  calculateSavingsScore,
  calculateBudgetAdherence,
  calculateOverallScore,
} from "./healthUtils";
import {
  calculateMonthlyContribution,
  generateTimelineProjection,
} from "./goalUtils";
import { formatCurrency } from "./utils";
import type { FinancialContext, ChatResponse } from "./chatUtils";

// HF chat model used for the agent loop. Configurable via env so deployments can
// point at a different instruct model without code changes.
const DEFAULT_AGENT_MODEL =
  (import.meta as any).env?.VITE_AGENT_MODEL ||
  "meta-llama/Meta-Llama-3-8B-Instruct";

const MAX_ITERATIONS = 4;

export interface AgentStep {
  thought: string;
  tool?: string;
  args?: Record<string, unknown>;
  observation?: unknown;
}

export interface AgentResult {
  message: string;
  chartData?: any[];
  steps: AgentStep[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, string>;
  run: (args: Record<string, unknown>, context: FinancialContext) => unknown;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Catalogue of tools the agent can call. Each wraps a deterministic analysis
// function that already ships in src/lib/*.
export const TOOL_CATALOGUE: AgentTool[] = [
  {
    name: "forecast_cash_flow",
    description:
      "Project income, expenses, and net cash flow for the next 6 months based on the user's transaction history.",
    parameters: {},
    run: (_args, ctx) => calculateMonthlyForecast(ctx.transactions),
  },
  {
    name: "detect_anomalies",
    description:
      "Find unusual transactions (spending spikes/outliers) per category. Answers 'why was last month so expensive?'",
    parameters: { threshold: "z-score threshold (default 2)" },
    run: (args, ctx) =>
      detectAnomalies(ctx.transactions, undefined, toNumber(args.threshold, 2)),
  },
  {
    name: "identify_recurring_transactions",
    description:
      "Detect recurring (subscription-like) expenses and their actual frequency (weekly/monthly/quarterly).",
    parameters: {},
    run: (_args, ctx) => identifyRecurringTransactions(ctx.transactions),
  },
  {
    name: "calculate_financial_health_score",
    description:
      "Compute the overall financial health score (0-100) from spending, savings, and budget adherence sub-scores.",
    parameters: {},
    run: (_args, ctx) => {
      const spending = calculateSpendingScore(ctx.transactions);
      const savings = calculateSavingsScore(ctx.transactions);
      const adherence = calculateBudgetAdherence(
        ctx.transactions,
        ctx.budgetCategories,
      );
      return {
        overall: calculateOverallScore(spending, savings, adherence),
        spending,
        savings,
        budgetAdherence: adherence,
      };
    },
  },
  {
    name: "project_goal",
    description:
      "Project a savings goal timeline. Given a target amount, current amount, and deadline, returns the monthly contribution needed and a month-by-month projection.",
    parameters: {
      targetAmount: "goal target amount",
      currentAmount: "amount saved so far",
      deadline: "ISO date string deadline",
    },
    run: (args, _ctx) => {
      const target = toNumber(args.targetAmount);
      const current = toNumber(args.currentAmount);
      const deadline = String(args.deadline ?? "");
      const monthly = calculateMonthlyContribution(target, current, deadline);
      return {
        monthlyContribution: monthly,
        timeline: generateTimelineProjection(target, current, monthly),
      };
    },
  },
  {
    name: "spending_summary",
    description:
      "Return total spending/income, top categories, savings rate, and budget utilization for the current period.",
    parameters: {},
    run: (_args, ctx) => ({
      totalSpending: ctx.totalSpending,
      totalIncome: ctx.totalIncome,
      savingsRate: ctx.savingsRate,
      budgetUtilization: ctx.budgetUtilization,
      topCategories: ctx.topCategories,
      spendingByMonth: ctx.spendingByMonth,
    }),
  },
];

function getHfToken(): string | null {
  const env = (import.meta as any).env;
  return env?.VITE_HF_TOKEN || env?.HF_TOKEN || null;
}

function buildSystemPrompt(tools: AgentTool[]): string {
  const toolList = tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}` +
        (Object.keys(t.parameters).length
          ? ` params: ${JSON.stringify(t.parameters)}`
          : ""),
    )
    .join("\n");
  return [
    "You are an agentic financial copilot. You answer the user's question by",
    "calling tools that run real deterministic financial analysis on their data.",
    "You do NOT compute numbers yourself — every figure must come from a tool.",
    "",
    "Available tools:",
    toolList,
    "",
    "Respond with EXACTLY ONE JSON object per turn, no prose before or after:",
    '  - To call a tool: {"tool":"<name>","args":{...}}',
    '  - To answer:    {"answer":"<your answer to the user, grounded in the tool results>"}',
    "",
    "Call tools one at a time. After enough observations, emit the final answer.",
    "In the answer, cite the numbers from the tool results. Keep it concise.",
  ].join("\n");
}

// Parse a single JSON object out of the model's (possibly wrapped) text reply.
function parseAgentJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  // Try direct parse first.
  try {
    const v = JSON.parse(text.trim());
    if (v && typeof v === "object") return v;
  } catch {
    /* fall through to fenced extraction */
  }
  // Extract the first {...} block, tolerating wrapping prose / code fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const v = JSON.parse(candidate.slice(start, end + 1));
    if (v && typeof v === "object") return v;
  } catch {
    return null;
  }
  return null;
}

function summariseObservation(obs: unknown): string {
  try {
    const json = JSON.stringify(obs);
    // Keep observations compact so they fit in the model context.
    return json.length > 2000 ? json.slice(0, 2000) + "…" : json;
  } catch {
    return String(obs);
  }
}

async function callModel(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string | null> {
  const token = getHfToken();
  if (!token) return null;
  try {
    const hf = new HfInference(token);
    const completion = await hf.chatCompletion({
      model: DEFAULT_AGENT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ] as any,
      max_tokens: 800,
      temperature: 0.2,
    });
    return (completion as any)?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Run the agentic tool-calling loop. Returns null when no model/token is
 * configured or the model cannot produce a valid answer, so callers can fall
 * back to the deterministic keyword router.
 */
export async function runAgentLoop(
  userMessage: string,
  context: FinancialContext,
): Promise<AgentResult | null> {
  const tools = TOOL_CATALOGUE;
  const systemPrompt = buildSystemPrompt(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: userMessage },
  ];
  const steps: AgentStep[] = [];
  let chartData: any[] | undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const reply = await callModel(systemPrompt, messages);
    if (!reply) return null;

    const parsed = parseAgentJson(reply);
    if (!parsed) {
      // Model replied with free text — treat as a final answer.
      return { message: reply.trim(), steps, chartData };
    }

    if (typeof parsed.answer === "string") {
      steps.push({ thought: parsed.answer as string });
      return { message: parsed.answer as string, steps, chartData };
    }

    const toolName = typeof parsed.tool === "string" ? parsed.tool : "";
    const tool = toolName ? toolMap.get(toolName) : undefined;
    if (!tool) {
      // Unknown tool — stop and let the caller fall back.
      return null;
    }

    const args =
      parsed.args && typeof parsed.args === "object"
        ? (parsed.args as Record<string, unknown>)
        : {};

    let observation: unknown;
    try {
      observation = tool.run(args, context);
    } catch (err) {
      observation = { error: (err as Error)?.message ?? "tool failed" };
    }

    steps.push({ thought: `call ${toolName}`, tool: toolName, args, observation });

    // Surface spending-by-month charts when a tool returns them.
    if (
      toolName === "forecast_cash_flow" ||
      toolName === "spending_summary"
    ) {
      const obs = observation as any;
      if (Array.isArray(obs?.spendingByMonth)) {
        chartData = obs.spendingByMonth;
      } else if (Array.isArray(obs)) {
        chartData = obs;
      }
    }

    messages.push({ role: "assistant", content: JSON.stringify(parsed) });
    messages.push({
      role: "user",
      content:
        "Observation: " + summariseObservation(observation) +
        "\nNow either call another tool or emit {\"answer\": ...}.",
    });
  }

  // Exhausted iterations without a final answer.
  return null;
}

/**
 * Agentic chat response. Tries the tool-calling agent loop; falls back to the
 * deterministic keyword router when the model is unavailable.
 */
export async function generateAgentChatResponse(
  userMessage: string,
  context: FinancialContext,
  fallback: (msg: string, ctx: FinancialContext) => ChatResponse,
): Promise<ChatResponse & { steps?: AgentStep[] }> {
  const agentResult = await runAgentLoop(userMessage, context);
  if (agentResult) {
    return {
      message: agentResult.message,
      chartData: agentResult.chartData,
      steps: agentResult.steps,
    };
  }
  return fallback(userMessage, context);
}

export { formatCurrency };

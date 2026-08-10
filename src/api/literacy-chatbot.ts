import logger from "../lib/logger.js";

// Mock Database of users' Knowledge Scores
const userKnowledgeDb: Record<string, number> = {};

export async function chatWithFinancialTutor(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // In production, we would pass `message` to an LLM like OpenAI with a strict System Prompt:
    // "You are FinBot, a gamified financial tutor. Explain concepts clearly. If the user answers a question correctly, award them points by returning { pointsAwarded: X } in JSON."

    // Simulating LLM network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    let reply = "That's a great question about finance! Remember, the key to building wealth is consistency.";
    let pointsAwarded = 0;

    const lowerMsg = message.toLowerCase();

    // Very basic mock logic to simulate a conversational flow
    if (lowerMsg.includes("compound interest")) {
      reply = "Compound interest is the addition of interest to the principal sum of a loan or deposit! Essentially, it's **interest on interest**.\n\nQuick Quiz: If you invest $100 at 10% annually, how much do you have after 2 years?";
    } else if (lowerMsg.includes("121") || lowerMsg.includes("121 dollars")) {
      reply = "Correct! $100 -> $110 -> $121. You've earned the **Compound Master** badge!";
      pointsAwarded = 50;
    } else if (lowerMsg.includes("tax")) {
      reply = "In a progressive tax system, you are only taxed the higher rate on the money that falls *inside* that specific bracket, not your entire income!";
      pointsAwarded = 10;
    }

    // Update user score
    if (!userKnowledgeDb[user.uid]) {
      userKnowledgeDb[user.uid] = 0;
    }
    userKnowledgeDb[user.uid] += pointsAwarded;

    res.json({
      success: true,
      data: {
        reply,
        pointsAwarded,
        totalScore: userKnowledgeDb[user.uid]
      }
    });

  } catch (error: any) {
    logger.error("CHATBOT_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to communicate with the tutor" });
  }
}

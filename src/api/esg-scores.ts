import logger from "../lib/logger.js";

interface EsgData {
  ticker: string;
  name: string;
  totalScore: number;
  environmentScore: number;
  socialScore: number;
  governanceScore: number;
  controversyLevel: number;
  rating: "Excellent" | "Average" | "Poor";
}

// In production, this would call Yahoo Finance ESG endpoints or MSCI ESG Ratings API
export async function getPortfolioEsgScores(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Mocking an external API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock User Holdings (usually fetched from DB) mapped to mock ESG Scores
    // ESG Scores are typically 0-100 where higher is better (or sometimes inverted, we assume 100=Best here)
    const portfolioEsg: EsgData[] = [
      {
        ticker: "MSFT",
        name: "Microsoft Corporation",
        totalScore: 88,
        environmentScore: 92,
        socialScore: 85,
        governanceScore: 89,
        controversyLevel: 1, // 1-5, 1 being lowest controversy
        rating: "Excellent"
      },
      {
        ticker: "XOM",
        name: "Exxon Mobil",
        totalScore: 35,
        environmentScore: 12,
        socialScore: 40,
        governanceScore: 55,
        controversyLevel: 4,
        rating: "Poor"
      },
      {
        ticker: "AAPL",
        name: "Apple Inc.",
        totalScore: 75,
        environmentScore: 80,
        socialScore: 68,
        governanceScore: 78,
        controversyLevel: 2,
        rating: "Average"
      },
      {
        ticker: "TSLA",
        name: "Tesla Inc.",
        totalScore: 65,
        environmentScore: 95,
        socialScore: 45,
        governanceScore: 55,
        controversyLevel: 3,
        rating: "Average"
      }
    ];

    // Calculate aggregated portfolio rating
    const averageScore = portfolioEsg.reduce((acc, curr) => acc + curr.totalScore, 0) / portfolioEsg.length;
    
    let aggregateRating = "Average";
    if (averageScore > 75) aggregateRating = "Excellent";
    else if (averageScore < 50) aggregateRating = "Poor";

    res.json({
      success: true,
      data: {
        holdings: portfolioEsg,
        aggregateScore: Math.round(averageScore),
        aggregateRating
      }
    });

  } catch (error: any) {
    logger.error("ESG_API_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to fetch ESG scores" });
  }
}

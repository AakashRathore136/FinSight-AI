import logger from "../lib/logger.js";

// Mock implementation of a background aggregation query
// In production, this would query a materialized view or a data warehouse (like Snowflake/BigQuery)
// where spending averages are grouped by income deciles and strictly enforce K-anonymity.

export async function getPeerSpendingComparison(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Assume we have retrieved the user's income bracket from their profile
    const userIncomeBracket = "$80k - $120k";
    
    // Check K-Anonymity requirement:
    // If the cohort size for this bracket in this region is < 100, we refuse to serve the data
    const cohortSize = 4520; // Mock count of active users in this bracket
    const K_ANONYMITY_THRESHOLD = 100;
    
    if (cohortSize < K_ANONYMITY_THRESHOLD) {
      return res.status(403).json({
        error: "Privacy Restriction",
        message: "Not enough anonymized users in your demographic to provide a statistically private comparison."
      });
    }

    // Mock User's monthly spending averages
    const userSpending = {
      Housing: 1800,
      Food: 850,
      Transportation: 400,
      Entertainment: 300,
      Shopping: 450,
      Utilities: 250
    };

    // Mock Peer Average for the $80k-$120k cohort
    const peerSpending = {
      Housing: 2100,
      Food: 600,
      Transportation: 450,
      Entertainment: 250,
      Shopping: 300,
      Utilities: 280
    };

    // Transform data for the frontend Radar Chart
    const categories = Object.keys(userSpending) as Array<keyof typeof userSpending>;
    const chartData = categories.map(category => ({
      category,
      User: userSpending[category],
      Peers: peerSpending[category],
      fullMark: Math.max(userSpending[category], peerSpending[category]) * 1.2 // dynamic scaling
    }));

    res.json({
      success: true,
      data: chartData,
      meta: {
        cohort: userIncomeBracket,
        cohortSize,
        privacyStandard: `K-Anonymity (k=${K_ANONYMITY_THRESHOLD}) Enforced`
      }
    });

  } catch (error: any) {
    logger.error("PEER_SPENDING_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to generate peer spending comparison" });
  }
}

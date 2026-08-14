import logger from "../lib/logger.js";

// Mocking the generation of a vector embedding using a model like all-MiniLM-L6-v2
async function generateEmbedding(text: string): Promise<number[]> {
  // Simulating external API call to HuggingFace or OpenAI text-embedding-3-small
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Return a mock vector of 384 dimensions (standard for MiniLM)
  // For mocking, we just generate an array of random floats between -1 and 1
  return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
}

// Mocking PostgreSQL pgvector cosine similarity search
// In production: SELECT * FROM transactions ORDER BY embedding <=> '[query_vector]' LIMIT 5;
async function vectorSearchTransactions(queryVector: number[], threshold = 0.7) {
  // Simulated database of transactions that have already been embedded asynchronously
  const mockTransactions = [
    { id: "tx_01", merchant: "Starbucks Store #4992", category: "Food & Dining", location: "Seattle, WA", date: "2023-04-12", amount: 6.50 },
    { id: "tx_02", merchant: "Amazon Web Services", category: "Software", location: "Online", date: "2023-11-05", amount: 145.20 },
    { id: "tx_03", merchant: "Chevron Gas", category: "Auto & Transport", location: "Portland, OR", date: "2023-12-20", amount: 45.00 },
    { id: "tx_04", merchant: "Airbnb Reservation", category: "Travel", location: "Austin, TX", date: "2024-01-10", amount: 650.00 },
    { id: "tx_05", merchant: "Seattle Coffee Works", category: "Food & Dining", location: "Seattle, WA", date: "2023-08-22", amount: 12.00 },
  ];

  // Since we can't do actual cosine similarity on random vectors and get meaningful results,
  // we'll mock the semantic matching logic based on keyword heuristics just for the demo,
  // but architecturally returning it as if it were a vector match.

  return mockTransactions.map(tx => {
    // Generate a fake similarity score (0.0 to 1.0)
    // We'll arbitrarily boost the score if it's the Seattle coffee transaction to simulate a good semantic match
    let similarity = Math.random() * 0.5; 
    
    if (tx.location.includes("Seattle") && tx.category.includes("Food")) {
      similarity = 0.85 + (Math.random() * 0.1); // Score ~ 0.85 - 0.95
    }

    return { ...tx, similarityScore: parseFloat(similarity.toFixed(4)) };
  })
  .filter(tx => tx.similarityScore >= threshold)
  .sort((a, b) => b.similarityScore - a.similarityScore);
}


export async function searchTransactionsSemantic(req: any, res: any) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    logger.info(`Performing semantic search for user ${user.uid} with query: "${query}"`);

    // 1. Embed the user's natural language query
    const queryVector = await generateEmbedding(query);

    // 2. Perform Cosine Similarity Search against pgvector
    const results = await vectorSearchTransactions(queryVector, 0.6); // 0.6 similarity threshold

    res.json({
      success: true,
      data: {
        query,
        matchCount: results.length,
        results
      }
    });

  } catch (error: any) {
    logger.error("SEMANTIC_SEARCH_ERROR", { message: error.message });
    res.status(500).json({ error: "Failed to perform semantic search" });
  }
}

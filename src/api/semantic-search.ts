import logger from "../lib/logger.js";

// Mocking the generation of a vector embedding using a model like all-MiniLM-L6-v2.
// The embedding is DETERMINISTIC per text (bag-of-words hashed into a 384-dim,
// L2-normalized vector) so that semantically similar texts yield similar vectors
// and cosine similarity is meaningful. A random embedding would make the search
// ignore the query entirely.
async function generateEmbedding(text: string): Promise<number[]> {
  // Simulating external API call to HuggingFace or OpenAI text-embedding-3-small
  await new Promise(resolve => setTimeout(resolve, 300));

  const vector = new Array(384).fill(0);
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    vector[hash % 384] += 1;
  }

  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
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

  const scored = [];
  for (const tx of mockTransactions) {
    const txVector = await generateEmbedding(`${tx.merchant} ${tx.category} ${tx.location}`);
    const similarity = cosineSimilarity(queryVector, txVector);
    scored.push({ ...tx, similarityScore: parseFloat(similarity.toFixed(4)) });
  }

  scored.sort((a, b) => b.similarityScore - a.similarityScore);

  const aboveThreshold = scored.filter(tx => tx.similarityScore >= threshold);
  return aboveThreshold.length > 0 ? aboveThreshold : scored.slice(0, 5);
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

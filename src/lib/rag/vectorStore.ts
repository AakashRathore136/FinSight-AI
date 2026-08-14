/**
 * In-memory Vector Store with Cosine Similarity Retrieval
 */
import { DocumentChunk } from "./textChunker";

export interface ScoredChunk extends DocumentChunk {
  score: number;
}

/**
 * Computes Cosine Similarity between two numerical vector embeddings.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates a raw term-frequency pseudo-embedding vector for text similarity scoring.
 * IDF weighting is applied separately by the vector store.
 */
export function generateSparseEmbedding(text: string, vocabulary: string[]): number[] {
  const words = text.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];
  const freqMap: Record<string, number> = {};
  words.forEach((w) => {
    freqMap[w] = (freqMap[w] || 0) + 1;
  });

  return vocabulary.map((term) => freqMap[term] || 0);
}

export class InMemoryVectorStore {
  private chunks: DocumentChunk[] = [];
  private embeddings: number[][] = [];
  private vocabulary: string[] = [];
  private idf: number[] = [];

  /**
   * Indexes document chunks into the store.
   */
  public addChunks(chunks: DocumentChunk[]): void {
    this.chunks = chunks;

    // Build vocabulary
    const vocabSet = new Set<string>();
    chunks.forEach((chunk) => {
      const words = chunk.text.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];
      words.forEach((w) => {
        if (w.length > 2) vocabSet.add(w);
      });
    });

    this.vocabulary = Array.from(vocabSet);

    // Compute document frequencies and IDF weights.
    const df = new Array(this.vocabulary.length).fill(0);
    this.embeddings = chunks.map((chunk) => {
      const e = generateSparseEmbedding(chunk.text, this.vocabulary);
      e.forEach((c, i) => {
        if (c > 0) df[i]++;
      });
      return e;
    });

    const N = chunks.length;
    this.idf = df.map((d) => (d > 0 ? Math.log((N + 1) / (d + 1)) + 1 : 0));

    // Weight stored embeddings by IDF.
    this.embeddings = this.embeddings.map((e) =>
      e.map((c, i) => c * this.idf[i])
    );
  }

  /**
   * Performs Similarity Search and retrieves top-k relevant chunks for a query.
   */
  public similaritySearch(query: string, topK: number = 3, minScore = 1e-6): ScoredChunk[] {
    if (this.chunks.length === 0 || this.vocabulary.length === 0) return [];

    const queryEmbedding = generateSparseEmbedding(query, this.vocabulary).map(
      (c, i) => c * this.idf[i]
    );

    const scored = this.chunks.map((chunk, index) => {
      const score = cosineSimilarity(queryEmbedding, this.embeddings[index]);
      return { ...chunk, score };
    });

    return scored
      .filter((s) => s.score > minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public clear(): void {
    this.chunks = [];
    this.embeddings = [];
    this.vocabulary = [];
  }
}

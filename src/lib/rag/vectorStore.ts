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
 * Generates lightweight TF-IDF-like pseudo-embedding vector for text similarity scoring.
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
    this.embeddings = chunks.map((chunk) =>
      generateSparseEmbedding(chunk.text, this.vocabulary)
    );
  }

  /**
   * Performs Similarity Search and retrieves top-k relevant chunks for a query.
   */
  public similaritySearch(query: string, topK: number = 3): ScoredChunk[] {
    if (this.chunks.length === 0 || this.vocabulary.length === 0) return [];

    const queryEmbedding = generateSparseEmbedding(query, this.vocabulary);

    const scored = this.chunks.map((chunk, index) => {
      const score = cosineSimilarity(queryEmbedding, this.embeddings[index]);
      return { ...chunk, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public clear(): void {
    this.chunks = [];
    this.embeddings = [];
    this.vocabulary = [];
  }
}

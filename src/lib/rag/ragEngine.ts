/**
 * Main RAG Engine integrating chunking, vector indexing, and context retrieval
 */
import { chunkFinancialDocument, DocumentChunk } from "./textChunker";
import { InMemoryVectorStore, ScoredChunk } from "./vectorStore";

export class RAGEngine {
  private vectorStore: InMemoryVectorStore;
  private isIndexed: boolean = false;

  constructor() {
    this.vectorStore = new InMemoryVectorStore();
  }

  /**
   * Process and index a full financial document text.
   */
  public indexDocument(rawText: string): { chunkCount: number; indexed: boolean } {
    const chunks = chunkFinancialDocument(rawText);
    this.vectorStore.addChunks(chunks);
    this.isIndexed = chunks.length > 0;
    return { chunkCount: chunks.length, indexed: this.isIndexed };
  }

  /**
   * Indexes already processed document chunks directly.
   */
  public indexChunks(chunks: DocumentChunk[]): void {
    this.vectorStore.addChunks(chunks);
    this.isIndexed = chunks.length > 0;
  }

  /**
   * Retrieves relevant context for a user query.
   */
  public retrieveContext(query: string, topK: number = 3): {
    contextText: string;
    relevantChunks: ScoredChunk[];
  } {
    if (!this.isIndexed) {
      return { contextText: "", relevantChunks: [] };
    }

    const relevantChunks = this.vectorStore.similaritySearch(query, topK);
    const contextText = relevantChunks
      .map((c, i) => `[Reference ${i + 1} - ${c.sectionHeader}]:\n${c.text}`)
      .join("\n\n");

    return { contextText, relevantChunks };
  }

  public reset(): void {
    this.vectorStore.clear();
    this.isIndexed = false;
  }
}

export const globalRagEngine = new RAGEngine();

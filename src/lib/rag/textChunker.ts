/**
 * Text Chunker module for Financial Document RAG Pipeline
 * Splits long financial text into semantically overlapping chunks.
 */

export interface DocumentChunk {
  id: string;
  text: string;
  pageNumber?: number;
  sectionHeader?: string;
  tokenCount: number;
  metadata?: Record<string, any>;
}

export interface ChunkingOptions {
  chunkSize?: number; // approximate token size (words * 1.3)
  chunkOverlap?: number;
  detectFinancialBoundaries?: boolean;
}

/**
 * Estimates token count for a text string (roughly 1.3 tokens per word).
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

/**
 * Chunks extracted text into overlapping segments with financial section awareness.
 */
export function chunkFinancialDocument(
  text: string,
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const { chunkSize = 500, chunkOverlap = 50, detectFinancialBoundaries = true } = options;
  const chunks: DocumentChunk[] = [];
  
  if (!text || !text.trim()) return [];

  // Financial section headers regex patterns
  const sectionHeaderRegex = /(?:BALANCE SHEET|INCOME STATEMENT|CASH FLOWS|NOTES TO FINANCIAL STATEMENTS|RISK FACTORS|MANAGEMENT'S DISCUSSION|AUDITOR'S REPORT|MD&A|NOTE \d+)/i;

  const paragraphs = text.split(/\n\s*\n/);
  let currentChunkText = "";
  let currentHeader = "Executive Summary";
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    // Detect section headers if enabled
    if (detectFinancialBoundaries && sectionHeaderRegex.test(para.slice(0, 100))) {
      const match = para.match(sectionHeaderRegex);
      if (match) {
        currentHeader = match[0].toUpperCase();
      }
    }

    const paraTokens = estimateTokens(para);
    const currentTokens = estimateTokens(currentChunkText);

    if (currentTokens + paraTokens > chunkSize && currentChunkText.length > 0) {
      chunks.push({
        id: `chunk-${chunkIndex++}`,
        text: currentChunkText.trim(),
        sectionHeader: currentHeader,
        tokenCount: currentTokens,
      });

      // Maintain overlap by retaining last portion of text
      const words = currentChunkText.split(/\s+/);
      const overlapWords = words.slice(-Math.max(10, Math.floor(chunkOverlap / 1.3))).join(" ");
      currentChunkText = overlapWords + " " + para;
    } else {
      currentChunkText = currentChunkText ? `${currentChunkText}\n\n${para}` : para;
    }
  }

  if (currentChunkText.trim()) {
    chunks.push({
      id: `chunk-${chunkIndex++}`,
      text: currentChunkText.trim(),
      sectionHeader: currentHeader,
      tokenCount: estimateTokens(currentChunkText),
    });
  }

  return chunks;
}

import { extractText } from "unpdf";

export interface ExtractedDocument {
  pages: string[];
  totalPages: number;
  fullText: string;
}

export const PAGE_SEPARATOR = "\n\n\n\n";

/**
 * Extracts each page from the PDF buffer individually to track page numbers and offsets.
 */
export async function extractPages(buffer: Buffer): Promise<ExtractedDocument> {
  try {
    const { totalPages, text } = await extractText(buffer, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text || ""];
    
    // Clean each page's text of carriage returns if present, but keep structure
    const cleanedPages = pages.map((p) => (p || "").replace(/\r\n/g, "\n"));
    
    return {
      pages: cleanedPages,
      totalPages: cleanedPages.length,
      fullText: cleanedPages.join(PAGE_SEPARATOR),
    };
  } catch (err: any) {
    console.error("[extractPages] unpdf extraction failed:", err?.message || err);
    // Return empty fallback page so that the pipeline doesn't crash on invalid PDFs
    return {
      pages: [""],
      totalPages: 1,
      fullText: "",
    };
  }
}

/**
 * Returns character offsets where each page starts in the full text string.
 */
export function getPageOffsets(pages: string[]): number[] {
  const offsets: number[] = [];
  let currentOffset = 0;
  for (const page of pages) {
    offsets.push(currentOffset);
    currentOffset += page.length + PAGE_SEPARATOR.length;
  }
  return offsets;
}

// Shared parsing utilities for all highlight ingestion modes.
// Pure functions — no database or network access.

export interface ParsedHighlight {
  title: string;
  author: string;
  page: string | null;
  content: string;
}

/**
 * Parse a Kindle "My Clippings.txt" file into individual highlights.
 * Blocks are separated by "==========" lines. Only highlight-type entries
 * are returned (bookmarks and notes are skipped).
 */
export function parseKindleClippings(raw: string): ParsedHighlight[] {
  const blocks = raw
    .split("==========")
    .map((b) => b.trim())
    .filter(Boolean);
  const results: ParsedHighlight[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.length < 3) continue;

    // Line 0: "Book Title (Author Name)"
    const titleLine = lines[0];
    const authorMatch = titleLine.match(/\(([^)]+)\)\s*$/);
    const author = authorMatch ? authorMatch[1].trim() : "Unknown";
    const title = authorMatch
      ? titleLine.slice(0, authorMatch.index).trim()
      : titleLine.trim();

    // Line 1: metadata — extract page or location
    const metaLine = lines[1];
    const pageMatch = metaLine.match(/page\s+(\d+)/i);
    const locMatch = metaLine.match(/location\s+([\d-]+)/i);
    const page = pageMatch
      ? `p. ${pageMatch[1]}`
      : locMatch
        ? `loc. ${locMatch[1]}`
        : null;

    // Only keep highlights (not bookmarks or notes)
    if (!metaLine.toLowerCase().includes("highlight")) continue;

    // Lines 2+: the actual highlighted text
    const content = lines
      .slice(2)
      .filter(Boolean)
      .join(" ")
      .trim();

    if (!content) continue;

    results.push({ title, author, page, content });
  }

  return results;
}

/**
 * Split raw PDF text (from pdf-parse) into highlight-sized chunks.
 * Splits on blank lines, filters very short or very long paragraphs.
 */
export function parsePdfText(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length >= 80 && chunk.length <= 2000);
}

/**
 * Split manually-entered text into individual highlights (one per line).
 */
export function parseManualText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

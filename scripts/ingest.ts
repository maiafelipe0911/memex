import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { books, highlights } from "../src/lib/schema";

// ---------------------------------------------------------------------------
// Kindle "My Clippings.txt" parser
// ---------------------------------------------------------------------------
// Each clipping block looks like:
//
//   Book Title (Author Name)
//   - Your Highlight on page 42 | location 600-612 | Added on Monday, January 1, 2024 ...
//
//   The actual highlighted text goes here.
//   ==========
//
// Blocks are separated by "==========\n".

interface ParsedHighlight {
  title: string;
  author: string;
  page: string | null;
  content: string;
}

function parseClippings(raw: string): ParsedHighlight[] {
  const blocks = raw.split("==========").map((b) => b.trim()).filter(Boolean);
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

    // Line 1: metadata — try to extract page or location
    const metaLine = lines[1];
    const pageMatch = metaLine.match(/page\s+(\d+)/i);
    const locMatch = metaLine.match(/location\s+([\d-]+)/i);
    const page = pageMatch
      ? `p. ${pageMatch[1]}`
      : locMatch
        ? `loc. ${locMatch[1]}`
        : null;

    // Skip bookmarks and notes — we only want highlights
    if (!metaLine.toLowerCase().includes("highlight")) continue;

    // Lines 2+: the highlight text (skip the empty line after metadata)
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/ingest.ts <path-to-My-Clippings.txt>");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseClippings(raw);

  if (parsed.length === 0) {
    console.log("No highlights found in the file.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Group highlights by book (title + author)
  const byBook = new Map<string, ParsedHighlight[]>();
  for (const h of parsed) {
    const key = `${h.title}|||${h.author}`;
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key)!.push(h);
  }

  console.log(`Found ${parsed.length} highlights across ${byBook.size} book(s).\n`);

  for (const [key, items] of byBook) {
    const { title, author } = items[0];

    // Check if book already exists
    const existing = await db
      .select()
      .from(books)
      .where(eq(books.title, title))
      .limit(1);

    let bookId: number;
    if (existing.length > 0) {
      bookId = existing[0].id;
      console.log(`Book already exists: "${title}" (id=${bookId})`);
    } else {
      const [newBook] = await db
        .insert(books)
        .values({ title, author })
        .returning();
      bookId = newBook.id;
      console.log(`Created book: "${title}" by ${author} (id=${bookId})`);
    }

    // Insert highlights
    const rows = items.map((h) => ({
      bookId,
      content: h.content,
      page: h.page,
    }));

    await db.insert(highlights).values(rows);
    console.log(`  → Inserted ${rows.length} highlight(s)`);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

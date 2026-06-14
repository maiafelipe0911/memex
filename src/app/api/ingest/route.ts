import { db } from "@/lib/db";
import { books, highlights } from "@/lib/schema";
import { getCurrentUserId } from "@/lib/dev-auth";
import { and, eq } from "drizzle-orm";
import {
  parseKindleClippings,
  parsePdfText,
  parseManualText,
} from "@/lib/ingest";
import { embedHighlightsByIds } from "@/lib/embed";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const mode = formData.get("mode") as string;

  try {
    if (mode === "kindle") {
      const text = (formData.get("text") as string | null)?.trim();
      if (!text) {
        return Response.json({ error: "No text provided" }, { status: 400 });
      }

      const parsed = parseKindleClippings(text);
      if (parsed.length === 0) {
        return Response.json(
          { error: "No highlights found — check the pasted text is from My Clippings.txt" },
          { status: 400 }
        );
      }

      // Group by book (title + author)
      const byBook = new Map<string, typeof parsed>();
      for (const h of parsed) {
        const key = `${h.title}|||${h.author}`;
        if (!byBook.has(key)) byBook.set(key, []);
        byBook.get(key)!.push(h);
      }

      let totalInserted = 0;
      const allIds: number[] = [];

      for (const [, items] of byBook) {
        const { title, author } = items[0];
        const bookId = await upsertBook(userId, title, author);
        const rows = items.map((h) => ({
          bookId,
          content: h.content,
          page: h.page,
          type: "highlight" as const,
          source: "kindle" as const,
        }));
        const inserted = await db
          .insert(highlights)
          .values(rows)
          .returning({ id: highlights.id });
        allIds.push(...inserted.map((r) => r.id));
        totalInserted += inserted.length;
      }

      const embedded = await embedHighlightsByIds(allIds);
      return Response.json({ inserted: totalInserted, embedded });
    }

    if (mode === "pdf") {
      const file = formData.get("file") as File | null;
      const bookTitle = (formData.get("bookTitle") as string | null)?.trim();
      const bookAuthor = (formData.get("bookAuthor") as string | null)?.trim();

      if (!file) return Response.json({ error: "No file uploaded" }, { status: 400 });
      if (!bookTitle) return Response.json({ error: "Book title is required" }, { status: 400 });
      if (!bookAuthor) return Response.json({ error: "Author is required" }, { status: 400 });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const pdfData = await pdfParse(buffer);
      const chunks = parsePdfText(pdfData.text);

      if (chunks.length === 0) {
        return Response.json(
          { error: "No text could be extracted from the PDF" },
          { status: 400 }
        );
      }

      const bookId = await upsertBook(userId, bookTitle, bookAuthor);
      const rows = chunks.map((content) => ({
        bookId,
        content,
        page: null as string | null,
        type: "highlight" as const,
        source: "pdf" as const,
      }));

      const inserted = await db
        .insert(highlights)
        .values(rows)
        .returning({ id: highlights.id });
      const embedded = await embedHighlightsByIds(inserted.map((r) => r.id));
      return Response.json({ inserted: inserted.length, embedded });
    }

    if (mode === "manual") {
      const text = (formData.get("text") as string | null)?.trim();
      const bookTitle = (formData.get("bookTitle") as string | null)?.trim();
      const bookAuthor = (formData.get("bookAuthor") as string | null)?.trim();

      if (!bookTitle) return Response.json({ error: "Book title is required" }, { status: 400 });
      if (!bookAuthor) return Response.json({ error: "Author is required" }, { status: 400 });
      if (!text) return Response.json({ error: "No highlights provided" }, { status: 400 });

      const lines = parseManualText(text);
      if (lines.length === 0) {
        return Response.json({ error: "No highlights found" }, { status: 400 });
      }

      const bookId = await upsertBook(userId, bookTitle, bookAuthor);
      const rows = lines.map((content) => ({
        bookId,
        content,
        page: null as string | null,
        type: "note" as const,
        source: "manual" as const,
      }));

      const inserted = await db
        .insert(highlights)
        .values(rows)
        .returning({ id: highlights.id });
      const embedded = await embedHighlightsByIds(inserted.map((r) => r.id));
      return Response.json({ inserted: inserted.length, embedded });
    }

    return Response.json({ error: "Invalid mode. Use kindle, pdf, or manual." }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/ingest]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function upsertBook(
  userId: string,
  title: string,
  author: string
): Promise<number> {
  const existing = await db
    .select({ id: books.id })
    .from(books)
    .where(and(eq(books.title, title), eq(books.userId, userId)))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [newBook] = await db
    .insert(books)
    .values({ title, author, userId })
    .returning({ id: books.id });
  return newBook.id;
}

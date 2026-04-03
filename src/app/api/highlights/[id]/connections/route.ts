import { db } from "@/lib/db";
import { highlights, books } from "@/lib/schema";
import { eq, ne, and, isNotNull, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions/vector";

const TOP_K = 10;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const highlightId = parseInt(id, 10);

  if (isNaN(highlightId)) {
    return Response.json({ error: "Invalid highlight ID" }, { status: 400 });
  }

  // 1. Fetch source highlight's embedding and bookId
  const [source] = await db
    .select({ id: highlights.id, bookId: highlights.bookId, embedding: highlights.embedding })
    .from(highlights)
    .where(eq(highlights.id, highlightId))
    .limit(1);

  if (!source) {
    return Response.json({ error: "Highlight not found" }, { status: 404 });
  }

  if (!source.embedding) {
    return Response.json(
      { error: "This highlight has no embedding yet. Run `npm run embed` first." },
      { status: 400 }
    );
  }

  // 2. Find top K similar highlights from other books
  const distance = cosineDistance(highlights.embedding, source.embedding);

  try {
    const connections = await db
      .select({
        id: highlights.id,
        content: highlights.content,
        page: highlights.page,
        bookId: highlights.bookId,
        bookTitle: books.title,
        bookAuthor: books.author,
        similarity: sql<number>`round((1 - (${distance}))::numeric, 4)`,
      })
      .from(highlights)
      .innerJoin(books, eq(highlights.bookId, books.id))
      .where(
        and(
          isNotNull(highlights.embedding),
          ne(highlights.bookId, source.bookId),
        )
      )
      .orderBy(distance)
      .limit(TOP_K);

    return Response.json(connections);
  } catch (e) {
    console.error("[connections] query failed:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

import { db } from "@/lib/db";
import { highlights, books } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/dev-auth";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: highlights.id,
      content: highlights.content,
      page: highlights.page,
      bookId: highlights.bookId,
      bookTitle: books.title,
      bookAuthor: books.author,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .where(eq(books.userId, userId))
    .orderBy(books.title, highlights.id);

  return Response.json(rows);
}

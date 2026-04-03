import { db } from "@/lib/db";
import { highlights, books } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
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
    .orderBy(books.title, highlights.id);

  return Response.json(rows);
}

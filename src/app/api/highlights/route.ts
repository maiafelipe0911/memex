import { db } from "@/lib/db";
import { highlights, books } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
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
    .where(eq(books.userId, session.user.id))
    .orderBy(books.title, highlights.id);

  return Response.json(rows);
}

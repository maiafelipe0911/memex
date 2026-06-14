import { db } from "@/lib/db";
import { books } from "@/lib/schema";
import { getCurrentUserId } from "@/lib/dev-auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allBooks = await db
    .select()
    .from(books)
    .where(eq(books.userId, userId));
  return Response.json(allBooks);
}

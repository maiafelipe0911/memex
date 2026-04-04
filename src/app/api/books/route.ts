import { db } from "@/lib/db";
import { books } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allBooks = await db
    .select()
    .from(books)
    .where(eq(books.userId, session.user.id));
  return Response.json(allBooks);
}

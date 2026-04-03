import { db } from "@/lib/db";
import { books } from "@/lib/schema";

export async function GET() {
  const allBooks = await db.select().from(books);
  return Response.json(allBooks);
}

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { books, highlights, users } from "../src/lib/schema";
import { parseKindleClippings } from "../src/lib/ingest";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/ingest.ts <path-to-My-Clippings.txt>");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseKindleClippings(raw);

  if (parsed.length === 0) {
    console.log("No highlights found in the file.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Group highlights by book (title + author)
  const byBook = new Map<string, typeof parsed>();
  for (const h of parsed) {
    const key = `${h.title}|||${h.author}`;
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key)!.push(h);
  }

  console.log(`Found ${parsed.length} highlights across ${byBook.size} book(s).\n`);

  // Resolve the owner — use the first user in the DB (seed user)
  const [owner] = await db.select({ id: users.id }).from(users).limit(1);
  if (!owner) {
    console.error(
      "No user found. Run the migrate-existing-data script first, or sign in via the app."
    );
    process.exit(1);
  }
  const userId = owner.id;
  console.log(`Assigning books to user ${userId}\n`);

  for (const [, items] of byBook) {
    const { title, author } = items[0];

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
        .values({ title, author, userId })
        .returning();
      bookId = newBook.id;
      console.log(`Created book: "${title}" by ${author} (id=${bookId})`);
    }

    const rows = items.map((h) => ({
      bookId,
      content: h.content,
      page: h.page,
    }));

    await db.insert(highlights).values(rows);
    console.log(`  → Inserted ${rows.length} highlight(s)`);
  }

  console.log("\nDone! Run `npm run embed` to generate embeddings.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-time migration script: creates a seed user and assigns all existing
 * books to that user. Run once after pushing the auth schema changes.
 *
 * Usage: npx tsx scripts/migrate-existing-data.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  // 1. Check if there are books without a userId
  const orphanedBooks = await sql`SELECT count(*) as cnt FROM books WHERE user_id IS NULL`;
  const count = Number(orphanedBooks[0].cnt);

  if (count === 0) {
    console.log("No orphaned books found — migration already done or no data.");
    return;
  }

  console.log(`Found ${count} books without a userId.`);

  // 2. Create (or find) the seed user
  const SEED_EMAIL = "seed@memex.local";
  const existing = await sql`SELECT id FROM "user" WHERE email = ${SEED_EMAIL}`;

  let seedUserId: string;
  if (existing.length > 0) {
    seedUserId = existing[0].id;
    console.log(`Seed user already exists: ${seedUserId}`);
  } else {
    const seedId = crypto.randomUUID();
    await sql`INSERT INTO "user" (id, name, email) VALUES (${seedId}, ${"Memex Owner"}, ${SEED_EMAIL})`;
    seedUserId = seedId;
    console.log(`Created seed user: ${seedUserId}`);
  }

  // 3. Backfill all books
  const result = await sql`UPDATE books SET user_id = ${seedUserId} WHERE user_id IS NULL`;
  console.log(`Updated ${count} books with userId = ${seedUserId}`);

  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

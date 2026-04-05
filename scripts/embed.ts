import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { isNull, eq } from "drizzle-orm";
import { voyageEmbed } from "../src/lib/voyage";
import { highlights } from "../src/lib/schema";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BATCH_SIZE = 64;
const DELAY_MS = 500; // pause between batches to respect rate limits

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in .env.local");
    process.exit(1);
  }
  if (!process.env.VOYAGE_API_KEY) {
    console.error("Missing VOYAGE_API_KEY in .env.local");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  const apiKey = process.env.VOYAGE_API_KEY;

  // Fetch all highlights that still need embeddings
  const pending = await db
    .select({ id: highlights.id, content: highlights.content })
    .from(highlights)
    .where(isNull(highlights.embedding));

  if (pending.length === 0) {
    console.log("All highlights already have embeddings. Nothing to do.");
    return;
  }

  console.log(`Found ${pending.length} highlight(s) without embeddings.\n`);

  let done = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);

    console.log(
      `Batch ${batchNum}/${totalBatches} — embedding ${batch.length} highlight(s)...`
    );

    try {
      const embeddings = await voyageEmbed(batch.map((h) => h.content), apiKey);

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        if (!embedding) {
          console.error(
            `  Highlight id=${batch[j].id}: no embedding returned, skipping.`
          );
          continue;
        }

        try {
          await db
            .update(highlights)
            .set({ embedding })
            .where(eq(highlights.id, batch[j].id));
          done++;
        } catch (updateErr) {
          console.error(
            `  Highlight id=${batch[j].id}: update failed —`,
            updateErr
          );
        }
      }

      console.log(`  Done. Total embedded so far: ${done}/${pending.length}`);
    } catch (batchErr) {
      console.error(
        `  Batch ${batchNum}: embedding request failed —`,
        batchErr
      );
    }

    // Rate-limit delay — skip after the last batch
    if (i + BATCH_SIZE < pending.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(
    `\nFinished. ${done}/${pending.length} highlights now have embeddings.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

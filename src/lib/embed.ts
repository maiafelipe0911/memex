// Embedding utilities for use by API routes.
// Uses the app's shared db client and Voyage AI.

import { db } from "@/lib/db";
import { highlights } from "@/lib/schema";
import { inArray, eq } from "drizzle-orm";
import { voyageEmbed } from "@/lib/voyage";

const BATCH_SIZE = 64;
const DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate and store embeddings for specific highlight IDs.
 * Returns the number of highlights successfully embedded.
 */
export async function embedHighlightsByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;

  if (!process.env.VOYAGE_API_KEY) {
    console.warn("[embed] VOYAGE_API_KEY not set — skipping embedding");
    return 0;
  }

  const apiKey = process.env.VOYAGE_API_KEY;

  const pending = await db
    .select({ id: highlights.id, content: highlights.content })
    .from(highlights)
    .where(inArray(highlights.id, ids));

  let done = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    try {
      const embeddings = await voyageEmbed(
        batch.map((h) => h.content),
        apiKey
      );

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        if (!embedding) continue;

        try {
          await db
            .update(highlights)
            .set({ embedding })
            .where(eq(highlights.id, batch[j].id));
          done++;
        } catch (e) {
          console.error(`[embed] Failed to update highlight ${batch[j].id}:`, e);
        }
      }
    } catch (e) {
      console.error("[embed] Batch failed:", e);
    }

    if (i + BATCH_SIZE < pending.length) {
      await sleep(DELAY_MS);
    }
  }

  return done;
}

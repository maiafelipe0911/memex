// Weekly digest builder and email sender.
// Finds top connection pairs for a user and sends them via Resend.

import { db } from "@/lib/db";
import { highlights, books, users } from "@/lib/schema";
import { eq, and, isNotNull, ne, sql, inArray } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions/vector";
import { Resend } from "resend";

const DIGEST_PAIRS = 5; // highlight pairs to include in the digest

interface ConnectionPair {
  sourceContent: string;
  sourceBook: string;
  targetContent: string;
  targetBook: string;
  similarity: number;
}

/**
 * Pick a random sample of highlights for a user and find their best cross-book
 * connections, returning the top DIGEST_PAIRS unique pairs.
 */
export async function buildDigestPairs(userId: string): Promise<ConnectionPair[]> {
  // Grab a random highlight that has an embedding
  const userHighlights = await db
    .select({
      id: highlights.id,
      content: highlights.content,
      bookId: highlights.bookId,
      bookTitle: books.title,
      embedding: highlights.embedding,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .where(and(isNotNull(highlights.embedding), eq(books.userId, userId)))
    .orderBy(sql`random()`)
    .limit(20);

  if (userHighlights.length < 2) return [];

  const pairs: ConnectionPair[] = [];
  const seen = new Set<string>();

  for (const source of userHighlights.slice(0, 10)) {
    if (!source.embedding) continue;

    const distance = cosineDistance(highlights.embedding, source.embedding);

    const matches = await db
      .select({
        id: highlights.id,
        content: highlights.content,
        bookTitle: books.title,
        similarity: sql<number>`round((1 - (${distance}))::numeric, 4)`,
      })
      .from(highlights)
      .innerJoin(books, eq(highlights.bookId, books.id))
      .where(
        and(
          isNotNull(highlights.embedding),
          ne(highlights.bookId, source.bookId),
          eq(books.userId, userId),
          // Exclude the source highlight's own book
          ne(highlights.id, source.id)
        )
      )
      .orderBy(distance)
      .limit(1);

    if (matches.length === 0) continue;
    const match = matches[0];

    const pairKey = [source.id, match.id].sort().join("-");
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    pairs.push({
      sourceContent: source.content,
      sourceBook: source.bookTitle,
      targetContent: match.content,
      targetBook: match.bookTitle,
      similarity: match.similarity,
    });

    if (pairs.length >= DIGEST_PAIRS) break;
  }

  return pairs;
}

/** Build an HTML email body from connection pairs. */
function buildEmailHtml(pairs: ConnectionPair[], userName: string): string {
  if (pairs.length === 0) {
    return `<p>No connections found yet — add more highlights to start seeing links across your library.</p>`;
  }

  const pairCards = pairs
    .map(
      (p) => `
      <div style="margin-bottom:24px; padding:16px; background:#f9f9f9; border-radius:8px; border-left:3px solid #6366f1;">
        <p style="margin:0 0 8px; font-size:14px; color:#374151;">"${p.sourceContent}"</p>
        <p style="margin:0 0 12px; font-size:12px; color:#9ca3af;">— ${p.sourceBook}</p>
        <p style="margin:0 0 4px; font-size:11px; color:#6366f1;">connects with (${Math.round(p.similarity * 100)}% similar)</p>
        <p style="margin:0 0 8px; font-size:14px; color:#374151;">"${p.targetContent}"</p>
        <p style="margin:0; font-size:12px; color:#9ca3af;">— ${p.targetBook}</p>
      </div>`
    )
    .join("");

  return `
    <div style="font-family:system-ui,sans-serif; max-width:600px; margin:0 auto; padding:24px;">
      <h1 style="font-size:20px; color:#111827; margin-bottom:4px;">Your Memex Weekly Digest</h1>
      <p style="font-size:14px; color:#6b7280; margin-bottom:24px;">
        Hi ${userName} — here are ${pairs.length} unexpected connections from your library this week.
      </p>
      ${pairCards}
      <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
      <p style="font-size:12px; color:#9ca3af;">
        Visit <a href="https://memex.app" style="color:#6366f1;">Memex</a> to explore more connections.
      </p>
    </div>`;
}

/** Send the weekly digest for a user. Returns true if sent successfully. */
export async function sendDigest(userId: string): Promise<boolean> {
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.email) return false;

  const pairs = await buildDigestPairs(userId);
  const html = buildEmailHtml(pairs, user.name ?? "there");

  try {
    await resend.emails.send({
      from: "Memex <digest@memex.app>",
      to: user.email,
      subject: `Your Memex digest — ${pairs.length} connection${pairs.length !== 1 ? "s" : ""} this week`,
      html,
    });

    // Update lastDigestAt
    await db
      .update(users)
      .set({ lastDigestAt: new Date() })
      .where(eq(users.id, userId));

    return true;
  } catch (err) {
    console.error(`[digest] Failed to send to ${user.email}:`, err);
    return false;
  }
}

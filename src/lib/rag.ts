// RAG (Retrieval-Augmented Generation) utilities for the chat interface.
// Embeds the user query, retrieves relevant highlights, streams a Claude answer.

import { db } from "@/lib/db";
import { highlights, books } from "@/lib/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm/sql/functions/vector";
import { voyageEmbed } from "@/lib/voyage";
import Anthropic from "@anthropic-ai/sdk";

const TOP_K = 8;

export interface RelevantHighlight {
  id: number;
  content: string;
  bookTitle: string;
  bookAuthor: string;
  similarity: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Embed a query string and retrieve the most semantically relevant highlights for a user. */
export async function findRelevantHighlights(
  query: string,
  userId: string
): Promise<RelevantHighlight[]> {
  const [embedding] = await voyageEmbed([query], process.env.VOYAGE_API_KEY!);
  if (!embedding) return [];

  const distance = cosineDistance(highlights.embedding, embedding);

  const rows = await db
    .select({
      id: highlights.id,
      content: highlights.content,
      bookTitle: books.title,
      bookAuthor: books.author,
      similarity: sql<number>`round((1 - (${distance}))::numeric, 4)`,
    })
    .from(highlights)
    .innerJoin(books, eq(highlights.bookId, books.id))
    .where(and(isNotNull(highlights.embedding), eq(books.userId, userId)))
    .orderBy(distance)
    .limit(TOP_K);

  return rows;
}

/**
 * Stream a Claude answer grounded in the provided highlights.
 * Returns a ReadableStream of SSE chunks: `data: <text>\n\n` and `data: [DONE]\n\n`.
 */
export function streamChatAnswer(
  messages: ChatMessage[],
  context: RelevantHighlight[]
): ReadableStream<Uint8Array> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const contextBlock =
    context.length > 0
      ? context
          .map(
            (h, i) =>
              `[${i + 1}] "${h.content}"\n— ${h.bookTitle} by ${h.bookAuthor}`
          )
          .join("\n\n")
      : "No relevant highlights found.";

  const systemPrompt = `You are a thinking partner helping the user explore their reading notes and highlights.

You have access to the following excerpts from the user's library that are most relevant to their question:

${contextBlock}

Guidelines:
- Answer based primarily on the provided highlights
- When you reference a highlight, cite it naturally (e.g. "As ${context[0]?.bookTitle ?? "the book"} notes…")
- If the highlights don't cover the question, say so honestly and share any synthesis you can offer
- Keep answers concise and thought-provoking — push the user to think, not just inform them`;

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(text)}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: String(err) })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

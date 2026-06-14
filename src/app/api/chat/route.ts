import { getCurrentUserId } from "@/lib/dev-auth";
import { findRelevantHighlights, streamChatAnswer } from "@/lib/rag";
import type { ChatMessage } from "@/lib/rag";

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages array is required" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }
  if (!process.env.VOYAGE_API_KEY) {
    return Response.json({ error: "VOYAGE_API_KEY not configured" }, { status: 500 });
  }

  // Use the latest user message for retrieval
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) {
    return Response.json({ error: "No user message found" }, { status: 400 });
  }

  const context = await findRelevantHighlights(lastUserMessage.content, userId);
  const stream = streamChatAnswer(messages, context);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

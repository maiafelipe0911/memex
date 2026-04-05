"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages([...newMessages, { role: "assistant", content: "", pending: true }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${err.error ?? "Something went wrong."}`,
          };
          return updated;
        });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;

          try {
            const text = JSON.parse(payload);
            if (typeof text === "string") {
              assembled += text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assembled,
                  pending: true,
                };
                return updated;
              });
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }

      // Finalize (remove pending flag)
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: assembled };
        return updated;
      });
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${String(e)}`,
        };
        return updated;
      });
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-500">
                Ask anything about your highlights and books.
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Claude will answer using the most relevant passages from your library.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {msg.content || (msg.pending ? <ThinkingDots /> : null)}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 resize-none rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Ask about your highlights… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              disabled={loading}
              className="rounded-xl bg-zinc-800 px-3 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40"
              title="New conversation"
            >
              New
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
    </span>
  );
}

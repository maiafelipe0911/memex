"use client";

import { useEffect, useState } from "react";

type Book = { id: number; title: string; author: string };
type Highlight = {
  id: number;
  content: string;
  page: string | null;
  bookId: number;
  bookTitle: string;
  bookAuthor: string;
};
type Connection = Highlight & { similarity: number };

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<number | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchJson("/api/books"), fetchJson("/api/highlights")])
      .then(([booksData, highlightsData]) => {
        setBooks(booksData);
        setHighlights(highlightsData);
      })
      .catch((err) => {
        setLoadError(
          "Couldn't load your library. Check that DATABASE_URL in .env.local " +
            "points to a real database, then reload. " +
            `(${err instanceof Error ? err.message : String(err)})`
        );
      });
  }, []);

  const bookHighlights = highlights.filter((h) => h.bookId === selectedBookId);

  function selectBook(id: number) {
    setSelectedBookId(id);
    setSelectedHighlightId(null);
    setConnections([]);
  }

  function selectHighlight(id: number) {
    setSelectedHighlightId(id);
    setConnections([]);
    setLoadingConnections(true);
    fetchJson(`/api/highlights/${id}/connections`)
      .then((data) => {
        setConnections(data);
        setLoadingConnections(false);
      })
      .catch(() => {
        setLoadingConnections(false);
      });
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 p-8 text-zinc-100 font-sans">
        <p className="max-w-md rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 bg-zinc-950 text-zinc-100 font-sans overflow-hidden">

      {/* Panel 1: Books */}
      <div className="w-52 border-r border-zinc-800 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h1 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            Memex
          </h1>
        </div>
        <div className="overflow-y-auto flex-1">
          {books.map((book) => (
            <button
              key={book.id}
              onClick={() => selectBook(book.id)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/60 ${
                selectedBookId === book.id ? "bg-zinc-800" : ""
              }`}
            >
              <div className="text-sm font-medium text-zinc-100 truncate">
                {book.title}
              </div>
              <div className="text-xs text-zinc-500 truncate mt-0.5">
                {book.author}
              </div>
            </button>
          ))}
          {books.length === 0 && (
            <p className="px-4 py-4 text-xs text-zinc-500">
              No books yet.{" "}
              <code className="font-mono">npm run ingest</code>
            </p>
          )}
        </div>
      </div>

      {/* Panel 2: Highlights */}
      <div className="flex-1 border-r border-zinc-800 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase truncate">
            {selectedBookId
              ? (books.find((b) => b.id === selectedBookId)?.title ?? "Highlights")
              : "Highlights"}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {!selectedBookId && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              Select a book to see its highlights.
            </p>
          )}
          {selectedBookId && bookHighlights.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No highlights for this book.
            </p>
          )}
          {bookHighlights.map((h) => (
            <button
              key={h.id}
              onClick={() => selectHighlight(h.id)}
              className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/60 ${
                selectedHighlightId === h.id
                  ? "bg-zinc-800 border-l-2 border-l-indigo-500"
                  : ""
              }`}
            >
              <p className="text-sm text-zinc-200 leading-relaxed line-clamp-3">
                {h.content}
              </p>
              {h.page && (
                <span className="text-xs text-zinc-500 mt-1.5 inline-block">
                  {h.page}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Panel 3: Connections */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            Connections
          </h2>
        </div>
        <div className="overflow-y-auto flex-1">
          {!selectedHighlightId && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              Select a highlight to find cross-book connections.
            </p>
          )}
          {loadingConnections && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              Finding connections…
            </p>
          )}
          {!loadingConnections && selectedHighlightId && connections.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No connections found. Add more books and run{" "}
              <code className="font-mono text-xs">npm run embed</code>.
            </p>
          )}
          {connections.map((c) => (
            <div
              key={c.id}
              className="px-4 py-3 border-b border-zinc-800/50"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-400 truncate mr-2">
                  {c.bookTitle}
                </span>
                <span className="text-xs font-mono text-indigo-400 flex-shrink-0">
                  {Number(c.similarity).toFixed(2)}
                </span>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {c.content}
              </p>
              {c.page && (
                <span className="text-xs text-zinc-500 mt-1.5 inline-block">
                  {c.page}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

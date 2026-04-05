"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type Tab = "kindle" | "pdf" | "manual";

export default function AddPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("kindle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    inserted: number;
    embedded: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [kindleText, setKindleText] = useState("");
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfAuthor, setPdfAuthor] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualText, setManualText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    fd.append("mode", tab);

    if (tab === "kindle") {
      if (!kindleText.trim()) {
        setError("Paste your Kindle clippings text first.");
        return;
      }
      fd.append("text", kindleText);
    } else if (tab === "pdf") {
      const file = fileRef.current?.files?.[0];
      if (!file) { setError("Select a PDF file."); return; }
      if (!pdfTitle.trim()) { setError("Enter the book title."); return; }
      if (!pdfAuthor.trim()) { setError("Enter the author."); return; }
      fd.append("file", file);
      fd.append("bookTitle", pdfTitle);
      fd.append("bookAuthor", pdfAuthor);
    } else {
      if (!manualTitle.trim()) { setError("Enter the book / source title."); return; }
      if (!manualAuthor.trim()) { setError("Enter the author."); return; }
      if (!manualText.trim()) { setError("Enter at least one highlight."); return; }
      fd.append("bookTitle", manualTitle);
      fd.append("bookAuthor", manualAuthor);
      fd.append("text", manualText);
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setSuccess({ inserted: data.inserted, embedded: data.embedded });
        setTimeout(() => router.push("/"), 2500);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => { setTab(t); setError(null); setSuccess(null); }}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        tab === t
          ? "text-zinc-100 border-indigo-500"
          : "text-zinc-500 border-transparent hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );

  const field =
    "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors";

  return (
    <div className="min-h-full bg-zinc-950 flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-zinc-100">Add Highlights</h1>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-zinc-800">
          {tabBtn("kindle", "Kindle")}
          {tabBtn("pdf", "PDF")}
          {tabBtn("manual", "Manual")}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Kindle ── */}
          {tab === "kindle" && (
            <>
              <p className="text-sm text-zinc-400">
                Paste the full contents of{" "}
                <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">
                  My Clippings.txt
                </code>{" "}
                from your Kindle. Book titles and authors are extracted automatically.
              </p>
              <textarea
                className={`${field} h-64 resize-y font-mono text-xs leading-relaxed`}
                placeholder={
                  "==========\nBook Title (Author Name)\n- Your Highlight on page 42 | …\n\nThe highlighted text goes here.\n=========="
                }
                value={kindleText}
                onChange={(e) => setKindleText(e.target.value)}
              />
            </>
          )}

          {/* ── PDF ── */}
          {tab === "pdf" && (
            <>
              <p className="text-sm text-zinc-400">
                Upload a PDF — text is extracted and split into highlight-sized paragraphs.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Book title</label>
                  <input
                    className={field}
                    placeholder="e.g. The Black Swan"
                    value={pdfTitle}
                    onChange={(e) => setPdfTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Author</label>
                  <input
                    className={field}
                    placeholder="e.g. Nassim Taleb"
                    value={pdfAuthor}
                    onChange={(e) => setPdfAuthor(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">PDF file</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    className="w-full cursor-pointer text-sm text-zinc-400 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-200 hover:file:bg-zinc-600"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Manual ── */}
          {tab === "manual" && (
            <>
              <p className="text-sm text-zinc-400">
                Type one highlight or note per line. These will be embedded and connected to the rest of your library.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Book / source title</label>
                  <input
                    className={field}
                    placeholder="e.g. My Notes on AI"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Author</label>
                  <input
                    className={field}
                    placeholder="e.g. Your Name"
                    value={manualAuthor}
                    onChange={(e) => setManualAuthor(e.target.value)}
                  />
                </div>
                <textarea
                  className={`${field} h-48 resize-y`}
                  placeholder="One highlight or thought per line…"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Feedback */}
          {error && (
            <p className="rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-green-900/30 border border-green-800 px-3 py-2 text-sm text-green-400">
              Imported {success.inserted} highlights · embedded {success.embedded}. Redirecting…
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Processing…" : "Import highlights"}
          </button>
        </form>
      </div>
    </div>
  );
}

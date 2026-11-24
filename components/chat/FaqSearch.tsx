"use client";

import { useState } from "react";

interface SearchResult {
  id: number;
  question: string;
}

export default function FaqSearch({
  languageCode,
  onSelect,
}: {
  languageCode: "en" | "hi";
  onSelect: (faq: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, languageCode });
      const response = await fetch(`/api/chat/faqs/search?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error("FAQ search is temporarily unavailable.");
      setResults(data.faqs as SearchResult[]);
    } catch {
      setError(languageCode === "hi" ? "खोज अभी उपलब्ध नहीं है। कृपया फिर कोशिश करें।" : "Search is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="border-t border-stone-200 bg-white px-4 py-3" aria-label="FAQ search">
      <form className="flex gap-2" onSubmit={search}>
        <label className="sr-only" htmlFor="faq-search">
          {languageCode === "hi" ? "अक्सर पूछे जाने वाले प्रश्न खोजें" : "Search FAQs"}
        </label>
        <input
          id="faq-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={120}
          required
          placeholder={languageCode === "hi" ? "प्रश्न खोजें..." : "Search a question..."}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        >
          {loading ? "…" : languageCode === "hi" ? "खोजें" : "Search"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-800" role="alert">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-3 space-y-1">
          {results.map((faq) => (
            <li key={faq.id}>
              <button
                type="button"
                onClick={() => onSelect(faq)}
                className="w-full rounded-md px-2 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
              >
                {faq.question}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && query && results.length === 0 && !error && (
        <p className="mt-2 text-sm text-slate-700">
          {languageCode === "hi" ? "कोई स्वीकृत उत्तर नहीं मिला।" : "No approved answers found."}
        </p>
      )}
    </section>
  );
}

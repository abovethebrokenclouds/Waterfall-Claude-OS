import { useState, type FormEvent } from "react";

interface Props {
  onSubmit: (url: string) => void;
  loading: boolean;
}

/** The hero URL field + "Generate shorts" button. */
export function UrlInput({ onSubmit, loading }: Props) {
  const [url, setUrl] = useState("");

  const handle = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handle} className="flex w-full max-w-2xl gap-2">
      <input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube, podcast, or video URL…"
        className="flex-1 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate shorts"}
      </button>
    </form>
  );
}

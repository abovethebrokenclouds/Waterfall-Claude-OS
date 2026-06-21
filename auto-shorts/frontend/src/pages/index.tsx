import { useState } from "react";
import Head from "next/head";
import { UrlInput } from "../components/UrlInput";
import { ShortCard } from "../components/ShortCard";
import { EditModal } from "../components/EditModal";
import { useGenerateShorts } from "../hooks/useGenerateShorts";
import type { ShortCopy } from "../lib/types";

export default function Home() {
  const { loading, error, result, generate, updateShort } =
    useGenerateShorts();
  const [editingId, setEditingId] = useState<string | null>(null);

  const copyFor = (shortId: string): ShortCopy | undefined =>
    result?.platformCopy.find((c) => c.shortId === shortId);

  const editingPlan = result?.shorts.find((s) => s.id === editingId);

  return (
    <>
      <Head>
        <title>Auto-Shorts AI</title>
        <meta
          name="description"
          content="Turn any URL into platform-ready short-form videos."
        />
      </Head>

      <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center gap-10 px-4 py-16">
        <header className="text-center">
          <h1 className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-5xl font-extrabold text-transparent">
            Auto-Shorts AI
          </h1>
          <p className="mt-3 text-slate-400">
            Paste a URL. Get platform-ready shorts with captions, hooks, and copy.
          </p>
        </header>

        <UrlInput onSubmit={generate} loading={loading} />

        {error && (
          <p className="rounded-lg bg-red-950/60 px-4 py-2 text-red-300">
            {error}
          </p>
        )}

        {loading && (
          <p className="animate-pulse text-slate-400">
            Ingesting, transcribing, and planning your shorts…
          </p>
        )}

        {result && result.shorts.length > 0 && (
          <section className="w-full">
            <h2 className="mb-4 text-lg font-semibold text-slate-200">
              {result.shorts.length} shorts from{" "}
              {result.ingestion.metadata.title ?? result.ingestion.url}
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.shorts.map((plan) => (
                <ShortCard
                  key={plan.id}
                  plan={plan}
                  copy={copyFor(plan.id)}
                  onEdit={() => setEditingId(plan.id)}
                />
              ))}
            </div>
          </section>
        )}

        {result && result.shorts.length === 0 && !loading && (
          <p className="text-slate-400">
            No highlights found for that URL. Try a longer video.
          </p>
        )}
      </main>

      {editingPlan && (
        <EditModal
          plan={editingPlan}
          copy={copyFor(editingPlan.id)}
          onClose={() => setEditingId(null)}
          onSave={(patch) => updateShort(editingPlan.id, patch)}
        />
      )}
    </>
  );
}

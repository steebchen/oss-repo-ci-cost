"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [repoSlug, setRepoSlug] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate format
    const match = repoSlug.match(/^([^/]+)\/([^/]+)$/);
    if (!match) {
      setError("Invalid format. Use: owner/repo (e.g., facebook/react)");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: repoSlug }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start calculation");
      }

      // Navigate to results page
      router.push(`/${repoSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            GitHub Actions Cost Calculator
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Calculate theoretical GitHub Actions costs for any public repository
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-md">
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="repo"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Repository
              </label>
              <input
                type="text"
                id="repo"
                value={repoSlug}
                onChange={(e) => setRepoSlug(e.target.value)}
                placeholder="owner/repo (e.g., facebook/react)"
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
                disabled={isLoading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !repoSlug.trim()}
              className="flex h-12 items-center justify-center rounded-lg bg-blue-600 px-6 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Starting..." : "Calculate Costs"}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-sm text-zinc-500 dark:text-zinc-500">
          <p>
            Public repositories have FREE GitHub Actions usage.
            <br />
            This shows theoretical costs if the repository were private.
          </p>
          <p className="mt-2">
            Pricing based on January 2026 rates: Linux $0.008/min, Windows
            $0.016/min, macOS $0.08/min
          </p>
        </div>
      </main>
    </div>
  );
}

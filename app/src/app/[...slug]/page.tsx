"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface CostData {
  slug: string;
  owner: string;
  repo: string;
  daysAnalyzed: number;
  totalRuns: number;
  analyzedRuns: number;
  linuxMinutes: number;
  windowsMinutes: number;
  macosMinutes: number;
  actualCost: number;
  monthlyCost: number;
  yearlyCost: number;
  updatedAt: string;
}

interface StatusResponse {
  status: "pending" | "completed" | "error" | "not_found";
  data: CostData | null;
  error: string | null;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1)} hours`;
  }
  return `${minutes.toFixed(1)} min`;
}

export default function ResultsPage() {
  const params = useParams();
  const slugParts = params.slug as string[];
  const slug = slugParts?.join("/") || "";

  const [status, setStatus] = useState<
    "loading" | "pending" | "completed" | "error" | "not_found"
  >("loading");
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/status/${slug}`);
        const result: StatusResponse = await response.json();

        setStatus(result.status);
        setData(result.data);
        setError(result.error);

        // If still pending, poll again
        if (result.status === "pending") {
          setTimeout(checkStatus, 2000);
        }
      } catch (err) {
        console.error("Error checking status:", err);
        setStatus("error");
        setError("Failed to fetch status");
      }
    };

    checkStatus();
  }, [slug]);

  if (status === "loading" || status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-16">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Calculating Costs
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Analyzing workflow runs for <strong>{slug}</strong>
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              This may take a few minutes for repositories with many workflow
              runs...
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-16">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Not Found
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              No calculation found for <strong>{slug}</strong>
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Start New Calculation
          </Link>
        </main>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <main className="flex w-full max-w-2xl flex-col items-center gap-8 px-6 py-16">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-red-600 dark:text-red-400">
              Calculation Failed
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Error analyzing <strong>{slug}</strong>
            </p>
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Try Again
          </Link>
        </main>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            GitHub Actions Cost Analysis
          </h1>
          <p className="mt-2 text-xl text-zinc-600 dark:text-zinc-400">
            <a
              href={`https://github.com/${data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {data.slug}
            </a>
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Summary (Last {data.daysAnalyzed} days)
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Analyzed {data.analyzedRuns} of {data.totalRuns} workflow runs
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Actual Cost ({data.daysAnalyzed} days)
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatCost(data.actualCost)}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                Estimated Monthly
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatCost(data.monthlyCost)}
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">
                Estimated Yearly
              </p>
              <p className="mt-1 text-2xl font-bold text-purple-700 dark:text-purple-300">
                {formatCost(data.yearlyCost)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Usage Breakdown
          </h2>

          <div className="mt-6 space-y-4">
            {data.linuxMinutes > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <span className="text-lg">🐧</span>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      Linux
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500">
                      $0.008/min
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatMinutes(data.linuxMinutes)}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    {formatCost(data.linuxMinutes * 0.008)}
                  </p>
                </div>
              </div>
            )}

            {data.windowsMinutes > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <span className="text-lg">🪟</span>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      Windows
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500">
                      $0.016/min (2x)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatMinutes(data.windowsMinutes)}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    {formatCost(data.windowsMinutes * 0.016)}
                  </p>
                </div>
              </div>
            )}

            {data.macosMinutes > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <span className="text-lg">🍎</span>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      macOS
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500">
                      $0.08/min (10x)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {formatMinutes(data.macosMinutes)}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-500">
                    {formatCost(data.macosMinutes * 0.08)}
                  </p>
                </div>
              </div>
            )}

            {data.linuxMinutes === 0 &&
              data.windowsMinutes === 0 &&
              data.macosMinutes === 0 && (
                <p className="text-zinc-500 dark:text-zinc-500">
                  No usage data available
                </p>
              )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Note:</strong> Public repositories have FREE GitHub Actions
            usage. This shows theoretical costs if this repository were private.
            Pricing based on January 2026 rates.
          </p>
        </div>

        <div className="flex justify-center">
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 px-6 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Calculate Another Repository
          </Link>
        </div>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
          Last updated: {new Date(data.updatedAt).toLocaleString()}
        </p>
      </main>
    </div>
  );
}

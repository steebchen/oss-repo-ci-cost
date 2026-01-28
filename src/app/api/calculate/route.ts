import { NextResponse } from "next/server";
import { getPloyContext } from "@meetploy/nextjs";
import { calculateRepoCost } from "@/lib/github";

export async function POST(request: Request) {
  const { env } = getPloyContext();

  try {
    const { slug } = await request.json();

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    // Parse owner/repo
    const match = slug.match(/^([^/]+)\/([^/]+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Invalid format. Use: owner/repo" },
        { status: 400 }
      );
    }

    const [, owner, repo] = match;

    // Check if we already have recent data (within last hour)
    const existing = await env.DB.prepare(
      `SELECT * FROM repo_costs
       WHERE slug = ?
       AND status = 'completed'
       AND datetime(updated_at) > datetime('now', '-1 hour')`
    )
      .bind(slug)
      .first();

    if (existing) {
      // Return existing data
      return NextResponse.json({ status: "completed", cached: true });
    }

    // Check if calculation is already in progress
    const inProgress = await env.DB.prepare(
      `SELECT * FROM repo_costs WHERE slug = ? AND status = 'pending'`
    )
      .bind(slug)
      .first();

    if (inProgress) {
      return NextResponse.json({ status: "pending" });
    }

    // Insert or update as pending
    await env.DB.prepare(
      `INSERT INTO repo_costs (owner, repo, slug, status, updated_at)
       VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(slug) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP`
    )
      .bind(owner, repo, slug)
      .run();

    // Run calculation in background (non-blocking)
    // For simplicity, we'll run it inline but we could use a queue in production
    runCalculation(env.DB, owner, repo, slug).catch((error) => {
      console.error("Background calculation error:", error);
    });

    return NextResponse.json({ status: "pending" });
  } catch (error) {
    console.error("Calculate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function runCalculation(
  db: PloyEnv["DB"],
  owner: string,
  repo: string,
  slug: string
) {
  try {
    const token = process.env.GITHUB_TOKEN;
    const result = await calculateRepoCost(owner, repo, 7, token);

    await db
      .prepare(
        `UPDATE repo_costs SET
         status = 'completed',
         days_analyzed = ?,
         total_runs = ?,
         analyzed_runs = ?,
         linux_minutes = ?,
         windows_minutes = ?,
         macos_minutes = ?,
         actual_cost = ?,
         monthly_cost = ?,
         yearly_cost = ?,
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE slug = ?`
      )
      .bind(
        result.daysAnalyzed,
        result.totalRuns,
        result.analyzedRuns,
        result.linuxMinutes,
        result.windowsMinutes,
        result.macosMinutes,
        result.actualCost,
        result.monthlyCost,
        result.yearlyCost,
        slug
      )
      .run();

    console.log(`Completed calculation for ${slug}`);
  } catch (error) {
    console.error(`Calculation failed for ${slug}:`, error);

    await db
      .prepare(
        `UPDATE repo_costs SET
         status = 'error',
         error_message = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE slug = ?`
      )
      .bind(error instanceof Error ? error.message : "Unknown error", slug)
      .run();
  }
}

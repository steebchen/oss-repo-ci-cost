import { NextResponse } from "next/server";
import { getPloyContext } from "@meetploy/nextjs";
import { calculateRepoCost } from "@/lib/github";

interface RepoCostRow {
  execution_id: string | null;
  status: string;
  slug: string;
}

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
      .first<RepoCostRow>();

    if (inProgress) {
      return NextResponse.json({
        status: "pending",
        executionId: inProgress.execution_id,
      });
    }

    // Insert as pending
    await env.DB.prepare(
      `INSERT INTO repo_costs (owner, repo, slug, status, updated_at)
       VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(slug) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP`
    )
      .bind(owner, repo, slug)
      .run();

    // Try to use workflow if available, otherwise fall back to direct calculation
    if (env.COST_CALCULATOR) {
      // Trigger the workflow
      const { executionId } = await env.COST_CALCULATOR.trigger({
        owner,
        repo,
        slug,
        days: 7,
      });

      // Store execution ID for status tracking
      await env.DB.prepare(
        `UPDATE repo_costs SET execution_id = ? WHERE slug = ?`
      )
        .bind(executionId, slug)
        .run();

      return NextResponse.json({ status: "pending", executionId });
    }

    // Fallback: direct calculation (for dev/test environments without workflow support)
    console.log("Workflow not available, using direct calculation");

    try {
      const result = await calculateRepoCost(owner, repo, 7, process.env.GITHUB_TOKEN);

      await env.DB.prepare(
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

      return NextResponse.json({ status: "completed" });
    } catch (calcError) {
      console.error("Direct calculation error:", calcError);

      await env.DB.prepare(
        `UPDATE repo_costs SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`
      )
        .bind(String(calcError), slug)
        .run();

      return NextResponse.json({ status: "error", error: String(calcError) });
    }
  } catch (error) {
    console.error("Calculate error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

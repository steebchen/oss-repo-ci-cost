import { NextResponse } from "next/server";
import { getPloyContext } from "@meetploy/nextjs";

interface RepoCostRow {
  slug: string;
  owner: string;
  repo: string;
  status: string;
  execution_id: string | null;
  days_analyzed: number | null;
  total_runs: number | null;
  analyzed_runs: number | null;
  linux_minutes: number | null;
  windows_minutes: number | null;
  macos_minutes: number | null;
  actual_cost: number | null;
  monthly_cost: number | null;
  yearly_cost: number | null;
  error_message: string | null;
  updated_at: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { env } = getPloyContext();
  const { slug: slugParts } = await params;
  const slug = slugParts.join("/");

  try {
    const result = await env.DB.prepare(
      `SELECT * FROM repo_costs WHERE slug = ?`
    )
      .bind(slug)
      .first<RepoCostRow>();

    if (!result) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // If pending with execution ID, check workflow status
    if (result.status === "pending" && result.execution_id) {
      try {
        const execution = await env.COST_CALCULATOR.getExecution(
          result.execution_id as string
        );

        if (execution.status === "failed") {
          // Update DB with error status
          await env.DB.prepare(
            `UPDATE repo_costs SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`
          )
            .bind("Workflow execution failed", slug)
            .run();

          return NextResponse.json({
            status: "error",
            data: null,
            error: "Workflow execution failed",
            executionId: result.execution_id,
          });
        }

        // Still running
        return NextResponse.json({
          status: "pending",
          data: null,
          error: null,
          executionId: result.execution_id,
          workflowStatus: execution.status,
        });
      } catch (error) {
        console.error("Error checking workflow status:", error);
        // Fall through to return DB status
      }
    }

    return NextResponse.json({
      status: result.status,
      data:
        result.status === "completed"
          ? {
              slug: result.slug,
              owner: result.owner,
              repo: result.repo,
              daysAnalyzed: result.days_analyzed,
              totalRuns: result.total_runs,
              analyzedRuns: result.analyzed_runs,
              linuxMinutes: result.linux_minutes,
              windowsMinutes: result.windows_minutes,
              macosMinutes: result.macos_minutes,
              actualCost: result.actual_cost,
              monthlyCost: result.monthly_cost,
              yearlyCost: result.yearly_cost,
              updatedAt: result.updated_at,
            }
          : null,
      error: result.status === "error" ? result.error_message : null,
      executionId: result.execution_id || null,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

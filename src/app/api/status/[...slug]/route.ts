import { NextResponse } from "next/server";
import { getPloyContext } from "@meetploy/nextjs";

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
      .first();

    if (!result) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
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
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import type { Ploy, WorkflowContext } from "@meetploy/types";
import { Octokit } from "octokit";

const PRICING = {
  LINUX: 0.008,
  WINDOWS: 0.016,
  MACOS: 0.08,
};

interface WorkflowInput {
  owner: string;
  repo: string;
  slug: string;
  days: number;
}

interface WorkflowOutput {
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
}

interface CostResult {
  linux: number;
  windows: number;
  macos: number;
  total: number;
  breakdown: {
    UBUNTU: { minutes: number; cost: number };
    WINDOWS: { minutes: number; cost: number };
    MACOS: { minutes: number; cost: number };
  };
}

interface Job {
  started_at: string | null;
  completed_at: string | null;
  labels: string[];
}

function detectRunnerOS(labels: string[]): "UBUNTU" | "WINDOWS" | "MACOS" {
  const labelsLower = labels.map((l) => l.toLowerCase());
  if (labelsLower.some((l) => l.includes("macos") || l.includes("mac-os"))) {
    return "MACOS";
  }
  if (labelsLower.some((l) => l.includes("windows"))) {
    return "WINDOWS";
  }
  return "UBUNTU";
}

function calculateCostFromJobs(jobs: Job[]): CostResult {
  const costs: CostResult = {
    linux: 0,
    windows: 0,
    macos: 0,
    total: 0,
    breakdown: {
      UBUNTU: { minutes: 0, cost: 0 },
      WINDOWS: { minutes: 0, cost: 0 },
      MACOS: { minutes: 0, cost: 0 },
    },
  };

  for (const job of jobs) {
    if (!job.started_at || !job.completed_at) continue;

    const startTime = new Date(job.started_at);
    const endTime = new Date(job.completed_at);
    const durationMs = endTime.getTime() - startTime.getTime();
    const minutes = durationMs / 1000 / 60;

    const os = detectRunnerOS(job.labels || []);
    costs.breakdown[os].minutes += minutes;

    if (os === "UBUNTU") {
      costs.breakdown[os].cost += minutes * PRICING.LINUX;
      costs.linux += minutes * PRICING.LINUX;
    } else if (os === "WINDOWS") {
      costs.breakdown[os].cost += minutes * PRICING.WINDOWS;
      costs.windows += minutes * PRICING.WINDOWS;
    } else if (os === "MACOS") {
      costs.breakdown[os].cost += minutes * PRICING.MACOS;
      costs.macos += minutes * PRICING.MACOS;
    }
  }

  costs.total = costs.linux + costs.windows + costs.macos;
  return costs;
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

export default {
  workflows: {
    async calculate_repo_cost({
      input,
      env,
      step,
    }: WorkflowContext<PloyEnv, WorkflowInput>): Promise<WorkflowOutput> {
      const { owner, repo, slug, days } = input;
      const token = process.env.GITHUB_TOKEN;
      const octokit = new Octokit({ auth: token });

      // Step 1: Fetch all workflow runs
      const allRuns = await step.run("fetch-workflow-runs", async () => {
        const dateFilter = `>=${getDateDaysAgo(days)}`;
        console.log(`Fetching workflow runs for ${owner}/${repo} from last ${days} days...`);

        const runs = await octokit.paginate(
          octokit.rest.actions.listWorkflowRunsForRepo,
          {
            owner,
            repo,
            per_page: 100,
            status: "completed",
            created: dateFilter,
          },
          (response) => response.data
        );

        console.log(`Found ${runs.length} completed workflow runs`);
        return runs.map((run) => ({ id: run.id }));
      });

      // Step 2: Process runs in batches to get timing data
      let totalLinuxMinutes = 0;
      let totalWindowsMinutes = 0;
      let totalMacOSMinutes = 0;
      let totalCost = 0;
      let analyzedRuns = 0;

      // Process in batches of 10
      const batchSize = 10;
      for (let i = 0; i < allRuns.length; i += batchSize) {
        const batch = allRuns.slice(i, i + batchSize);
        const batchIndex = Math.floor(i / batchSize);

        const batchResults = await step.run(
          `process-batch-${batchIndex}`,
          async () => {
            const results: CostResult[] = [];

            for (const run of batch) {
              try {
                let cost: CostResult;

                try {
                  const timing = await octokit.rest.actions.getWorkflowRunUsage({
                    owner,
                    repo,
                    run_id: run.id,
                  });

                  const billable = timing.data.billable || {};
                  let hasBillableData = false;

                  for (const osKey of Object.keys(billable)) {
                    const osData = billable[osKey as keyof typeof billable];
                    if (
                      osData &&
                      typeof osData === "object" &&
                      "total_ms" in osData &&
                      osData.total_ms > 0
                    ) {
                      hasBillableData = true;
                      break;
                    }
                  }

                  if (!hasBillableData) {
                    throw new Error("No billable data");
                  }

                  cost = {
                    linux: 0,
                    windows: 0,
                    macos: 0,
                    total: 0,
                    breakdown: {
                      UBUNTU: { minutes: 0, cost: 0 },
                      WINDOWS: { minutes: 0, cost: 0 },
                      MACOS: { minutes: 0, cost: 0 },
                    },
                  };

                  if (billable.UBUNTU && "total_ms" in billable.UBUNTU) {
                    const minutes = billable.UBUNTU.total_ms / 1000 / 60;
                    cost.breakdown.UBUNTU.minutes = minutes;
                    cost.breakdown.UBUNTU.cost = minutes * PRICING.LINUX;
                    cost.linux = cost.breakdown.UBUNTU.cost;
                  }
                  if (billable.WINDOWS && "total_ms" in billable.WINDOWS) {
                    const minutes = billable.WINDOWS.total_ms / 1000 / 60;
                    cost.breakdown.WINDOWS.minutes = minutes;
                    cost.breakdown.WINDOWS.cost = minutes * PRICING.WINDOWS;
                    cost.windows = cost.breakdown.WINDOWS.cost;
                  }
                  if (billable.MACOS && "total_ms" in billable.MACOS) {
                    const minutes = billable.MACOS.total_ms / 1000 / 60;
                    cost.breakdown.MACOS.minutes = minutes;
                    cost.breakdown.MACOS.cost = minutes * PRICING.MACOS;
                    cost.macos = cost.breakdown.MACOS.cost;
                  }

                  cost.total = cost.linux + cost.windows + cost.macos;
                } catch {
                  const jobsResponse =
                    await octokit.rest.actions.listJobsForWorkflowRun({
                      owner,
                      repo,
                      run_id: run.id,
                      per_page: 100,
                    });
                  cost = calculateCostFromJobs(jobsResponse.data.jobs);
                }

                results.push(cost);
              } catch (error) {
                console.error(`Error processing run ${run.id}:`, error);
              }
            }

            return results;
          }
        );

        for (const cost of batchResults) {
          totalLinuxMinutes += cost.breakdown.UBUNTU.minutes;
          totalWindowsMinutes += cost.breakdown.WINDOWS.minutes;
          totalMacOSMinutes += cost.breakdown.MACOS.minutes;
          totalCost += cost.total;
          analyzedRuns++;
        }
      }

      // Step 3: Save results to database
      const monthlyMultiplier = 30 / days;
      const yearlyMultiplier = 365 / days;

      const result: WorkflowOutput = {
        slug,
        owner,
        repo,
        daysAnalyzed: days,
        totalRuns: allRuns.length,
        analyzedRuns,
        linuxMinutes: totalLinuxMinutes,
        windowsMinutes: totalWindowsMinutes,
        macosMinutes: totalMacOSMinutes,
        actualCost: totalCost,
        monthlyCost: totalCost * monthlyMultiplier,
        yearlyCost: totalCost * yearlyMultiplier,
      };

      await step.run("save-results", async () => {
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

        console.log(`Completed calculation for ${slug}`);
      });

      return result;
    },
  },
} satisfies Ploy<PloyEnv>;

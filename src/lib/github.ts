import { Octokit } from "octokit";

const PRICING = {
  LINUX: 0.008,
  WINDOWS: 0.016,
  MACOS: 0.08,
};

export interface CostBreakdown {
  UBUNTU: { minutes: number; cost: number };
  WINDOWS: { minutes: number; cost: number };
  MACOS: { minutes: number; cost: number };
}

export interface CostResult {
  linux: number;
  windows: number;
  macos: number;
  total: number;
  breakdown: CostBreakdown;
}

export interface CalculationResult {
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

function createClient(token?: string): Octokit {
  return new Octokit({ auth: token });
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
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

interface Job {
  started_at: string | null;
  completed_at: string | null;
  labels: string[];
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

export async function calculateRepoCost(
  owner: string,
  repo: string,
  days: number = 7,
  token?: string
): Promise<CalculationResult> {
  const octokit = createClient(token);
  const dateFilter = `>=${getDateDaysAgo(days)}`;

  console.log(`Fetching workflow runs for ${owner}/${repo} from last ${days} days...`);

  // Fetch ALL workflow runs with pagination
  const allRuns = await octokit.paginate(
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

  console.log(`Found ${allRuns.length} completed workflow runs`);

  let totalLinuxMinutes = 0;
  let totalWindowsMinutes = 0;
  let totalMacOSMinutes = 0;
  let totalCost = 0;
  let analyzedRuns = 0;

  for (const run of allRuns) {
    try {
      // Try to get timing data first
      let cost: CostResult;

      try {
        const timing = await octokit.rest.actions.getWorkflowRunUsage({
          owner,
          repo,
          run_id: run.id,
        });

        // Check if billable data has actual values
        const billable = timing.data.billable || {};
        let hasBillableData = false;

        for (const osKey of Object.keys(billable)) {
          const osData = billable[osKey as keyof typeof billable];
          if (osData && typeof osData === "object" && "total_ms" in osData && osData.total_ms > 0) {
            hasBillableData = true;
            break;
          }
        }

        if (!hasBillableData) {
          throw new Error("No billable data");
        }

        // Calculate from billable data
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
        // Fall back to jobs-based calculation for public repos
        const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
          owner,
          repo,
          run_id: run.id,
          per_page: 100,
        });
        cost = calculateCostFromJobs(jobsResponse.data.jobs);
      }

      totalLinuxMinutes += cost.breakdown.UBUNTU.minutes;
      totalWindowsMinutes += cost.breakdown.WINDOWS.minutes;
      totalMacOSMinutes += cost.breakdown.MACOS.minutes;
      totalCost += cost.total;
      analyzedRuns++;
    } catch (error) {
      console.error(`Error processing run ${run.id}:`, error);
    }
  }

  // Calculate projections
  const monthlyMultiplier = 30 / days;
  const yearlyMultiplier = 365 / days;

  return {
    slug: `${owner}/${repo}`,
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
}

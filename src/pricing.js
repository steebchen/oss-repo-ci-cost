/**
 * GitHub Actions Pricing (as of January 2026)
 * Prices reduced by up to 39% effective January 1, 2026
 *
 * Note: Public repositories have FREE GitHub Actions usage
 * These prices apply to private repositories only
 */

export const PRICING = {
  // Per-minute rates in USD (after January 2026 price reduction)
  LINUX: 0.008,    // Linux runners (standard)
  WINDOWS: 0.016,  // Windows runners (2x multiplier)
  MACOS: 0.08,     // macOS runners (10x multiplier)

  // Free tier minutes per month (for private repos)
  FREE_TIER: {
    FREE: 0,
    PRO: 3000,
    TEAM: 3000,
    ENTERPRISE: 50000
  }
};

/**
 * Calculate cost for workflow run timing data
 * @param {Object} timing - Timing data from GitHub API
 * @param {Object} timing.billable - Billable usage by OS
 * @returns {Object} Cost breakdown
 */
export function calculateCost(timing) {
  const billable = timing.billable || {};

  const costs = {
    linux: 0,
    windows: 0,
    macos: 0,
    total: 0,
    breakdown: {
      UBUNTU: { minutes: 0, cost: 0 },
      WINDOWS: { minutes: 0, cost: 0 },
      MACOS: { minutes: 0, cost: 0 }
    }
  };

  // Calculate Linux cost (Ubuntu)
  if (billable.UBUNTU) {
    const minutes = billable.UBUNTU.total_ms / 1000 / 60;
    costs.breakdown.UBUNTU.minutes = minutes;
    costs.breakdown.UBUNTU.cost = minutes * PRICING.LINUX;
    costs.linux = costs.breakdown.UBUNTU.cost;
  }

  // Calculate Windows cost
  if (billable.WINDOWS) {
    const minutes = billable.WINDOWS.total_ms / 1000 / 60;
    costs.breakdown.WINDOWS.minutes = minutes;
    costs.breakdown.WINDOWS.cost = minutes * PRICING.WINDOWS;
    costs.windows = costs.breakdown.WINDOWS.cost;
  }

  // Calculate macOS cost
  if (billable.MACOS) {
    const minutes = billable.MACOS.total_ms / 1000 / 60;
    costs.breakdown.MACOS.minutes = minutes;
    costs.breakdown.MACOS.cost = minutes * PRICING.MACOS;
    costs.macos = costs.breakdown.MACOS.cost;
  }

  costs.total = costs.linux + costs.windows + costs.macos;

  return costs;
}

/**
 * Format cost for display
 * @param {number} cost - Cost in USD
 * @returns {string} Formatted cost
 */
export function formatCost(cost) {
  return `$${cost.toFixed(4)}`;
}

/**
 * Format minutes for display
 * @param {number} minutes - Minutes
 * @returns {string} Formatted minutes
 */
export function formatMinutes(minutes) {
  return `${minutes.toFixed(2)} min`;
}

/**
 * Detect runner OS from job labels
 * @param {Array} labels - Job runner labels
 * @returns {string} OS type (UBUNTU, WINDOWS, MACOS)
 */
export function detectRunnerOS(labels) {
  const labelsLower = labels.map(l => l.toLowerCase());

  if (labelsLower.some(l => l.includes('macos') || l.includes('mac-os'))) {
    return 'MACOS';
  }
  if (labelsLower.some(l => l.includes('windows'))) {
    return 'WINDOWS';
  }
  // Default to Ubuntu/Linux
  return 'UBUNTU';
}

/**
 * Calculate cost from jobs data (for public repos where billable data isn't available)
 * @param {Array} jobs - Jobs from workflow run
 * @returns {Object} Cost breakdown
 */
export function calculateCostFromJobs(jobs) {
  const costs = {
    linux: 0,
    windows: 0,
    macos: 0,
    total: 0,
    breakdown: {
      UBUNTU: { minutes: 0, cost: 0 },
      WINDOWS: { minutes: 0, cost: 0 },
      MACOS: { minutes: 0, cost: 0 }
    }
  };

  for (const job of jobs) {
    if (!job.started_at || !job.completed_at) continue;

    const startTime = new Date(job.started_at);
    const endTime = new Date(job.completed_at);
    const durationMs = endTime - startTime;
    const minutes = durationMs / 1000 / 60;

    const os = detectRunnerOS(job.labels || []);

    costs.breakdown[os].minutes += minutes;

    if (os === 'UBUNTU') {
      costs.breakdown[os].cost += minutes * PRICING.LINUX;
      costs.linux += minutes * PRICING.LINUX;
    } else if (os === 'WINDOWS') {
      costs.breakdown[os].cost += minutes * PRICING.WINDOWS;
      costs.windows += minutes * PRICING.WINDOWS;
    } else if (os === 'MACOS') {
      costs.breakdown[os].cost += minutes * PRICING.MACOS;
      costs.macos += minutes * PRICING.MACOS;
    }
  }

  costs.total = costs.linux + costs.windows + costs.macos;

  return costs;
}

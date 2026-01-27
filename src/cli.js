#!/usr/bin/env node

import { createClient, getWorkflowRuns, getWorkflowRunTiming, parseRepository } from './github-api.js';
import { calculateCost, formatCost, formatMinutes } from './pricing.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const repoString = args[0];
  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1])
    : 10;
  const dateFilter = args.includes('--since')
    ? `>=${args[args.indexOf('--since') + 1]}`
    : null;

  try {
    const { owner, repo } = parseRepository(repoString);

    console.log(`\nFetching workflow runs for ${owner}/${repo}...`);
    console.log(`Note: GitHub Actions usage in PUBLIC repositories is FREE`);
    console.log(`This calculator shows theoretical costs if this were a private repo\n`);

    const octokit = createClient(GITHUB_TOKEN);

    // Fetch workflow runs
    const runs = await getWorkflowRuns(octokit, owner, repo, {
      per_page: limit,
      created: dateFilter
    });

    if (runs.length === 0) {
      console.log('No completed workflow runs found.');
      process.exit(0);
    }

    console.log(`Found ${runs.length} completed workflow run(s)\n`);

    let totalCost = 0;
    let totalLinuxMinutes = 0;
    let totalWindowsMinutes = 0;
    let totalMacOSMinutes = 0;
    let successCount = 0;

    // Process each run
    for (const run of runs) {
      try {
        const timing = await getWorkflowRunTiming(octokit, owner, repo, run.id);
        const cost = calculateCost(timing);

        console.log(`Run #${run.run_number}: ${run.name}`);
        console.log(`  ID: ${run.id}`);
        console.log(`  Status: ${run.conclusion}`);
        console.log(`  Date: ${new Date(run.created_at).toLocaleDateString()}`);
        console.log(`  Duration: ${formatMinutes(timing.run_duration_ms / 1000 / 60)}`);

        if (cost.breakdown.UBUNTU.minutes > 0) {
          console.log(`  Linux: ${formatMinutes(cost.breakdown.UBUNTU.minutes)} → ${formatCost(cost.breakdown.UBUNTU.cost)}`);
          totalLinuxMinutes += cost.breakdown.UBUNTU.minutes;
        }
        if (cost.breakdown.WINDOWS.minutes > 0) {
          console.log(`  Windows: ${formatMinutes(cost.breakdown.WINDOWS.minutes)} → ${formatCost(cost.breakdown.WINDOWS.cost)}`);
          totalWindowsMinutes += cost.breakdown.WINDOWS.minutes;
        }
        if (cost.breakdown.MACOS.minutes > 0) {
          console.log(`  macOS: ${formatMinutes(cost.breakdown.MACOS.minutes)} → ${formatCost(cost.breakdown.MACOS.cost)}`);
          totalMacOSMinutes += cost.breakdown.MACOS.minutes;
        }

        console.log(`  Total Cost: ${formatCost(cost.total)}\n`);

        totalCost += cost.total;
        successCount++;
      } catch (error) {
        if (error.message.includes('not available')) {
          console.log(`Run #${run.run_number}: Timing data not available (likely public repo)\n`);
        } else {
          console.error(`Run #${run.run_number}: Error - ${error.message}\n`);
        }
      }
    }

    // Print summary
    console.log('─'.repeat(60));
    console.log('SUMMARY');
    console.log('─'.repeat(60));
    console.log(`Analyzed runs: ${successCount}/${runs.length}`);
    if (totalLinuxMinutes > 0) {
      console.log(`Total Linux minutes: ${formatMinutes(totalLinuxMinutes)}`);
    }
    if (totalWindowsMinutes > 0) {
      console.log(`Total Windows minutes: ${formatMinutes(totalWindowsMinutes)}`);
    }
    if (totalMacOSMinutes > 0) {
      console.log(`Total macOS minutes: ${formatMinutes(totalMacOSMinutes)}`);
    }
    console.log(`\nTotal Cost: ${formatCost(totalCost)}`);
    console.log('─'.repeat(60));

    if (successCount === 0) {
      console.log('\nNote: No timing data available. This is expected for:');
      console.log('- Public repositories (Actions are free)');
      console.log('- Repositories without proper API access');
      console.log('\nSet GITHUB_TOKEN environment variable for authenticated requests.');
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
GitHub Actions Cost Calculator

Usage:
  gh-actions-cost <owner/repo> [options]

Options:
  --limit <n>        Number of workflow runs to analyze (default: 10)
  --since <date>     Only analyze runs since date (YYYY-MM-DD)
  --help, -h         Show this help message

Environment Variables:
  GITHUB_TOKEN       GitHub personal access token (optional but recommended)

Examples:
  gh-actions-cost facebook/react
  gh-actions-cost microsoft/vscode --limit 20
  gh-actions-cost vercel/next.js --since 2026-01-01

Notes:
  - Public repositories have FREE GitHub Actions usage
  - This calculator shows theoretical costs for private repositories
  - Pricing based on January 2026 rates (reduced by up to 39%)
  - Set GITHUB_TOKEN for better API rate limits
  `);
}

main();

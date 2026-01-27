#!/usr/bin/env node

import { createClient, getWorkflowRuns, getWorkflowRunTiming, getWorkflowRunJobs, parseRepository } from './github-api.js';
import { calculateCost, calculateCostFromJobs, formatCost, formatMinutes } from './pricing.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const repoString = args[0];
  const days = args.includes('--days')
    ? parseInt(args[args.indexOf('--days') + 1])
    : null;
  const dateFilter = args.includes('--since')
    ? `>=${args[args.indexOf('--since') + 1]}`
    : days
      ? `>=${getDateDaysAgo(days)}`
      : null;

  // Verbose mode shows individual runs
  const verbose = args.includes('--verbose') || args.includes('-v');

  try {
    const { owner, repo } = parseRepository(repoString);

    console.log(`\nFetching workflow runs for ${owner}/${repo}...`);
    if (days) {
      console.log(`Analyzing runs from the last ${days} days (since ${getDateDaysAgo(days)})`);
    }
    console.log(`Note: GitHub Actions usage in PUBLIC repositories is FREE`);
    console.log(`This calculator shows theoretical costs if this were a private repo\n`);

    const octokit = createClient(GITHUB_TOKEN);

    // Fetch ALL workflow runs with pagination
    console.log('Fetching all workflow runs (paginating through results)...');
    const runs = await getWorkflowRuns(octokit, owner, repo, {
      created: dateFilter,
      paginate: true
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
    let processedCount = 0;

    // Process each run
    for (const run of runs) {
      processedCount++;
      if (processedCount % 50 === 0) {
        console.log(`Processing run ${processedCount}/${runs.length}...`);
      }

      try {
        // First try to get timing data (works better for private repos)
        let cost;
        let durationMinutes;

        try {
          const timing = await getWorkflowRunTiming(octokit, owner, repo, run.id);
          cost = calculateCost(timing);
          durationMinutes = timing.run_duration_ms / 1000 / 60;

          // If billable data shows 0 cost (public repo), fall back to jobs-based calculation
          if (cost.total === 0) {
            throw new Error('No billable data, falling back to jobs');
          }
        } catch {
          // Fall back to jobs-based calculation for public repos
          const jobs = await getWorkflowRunJobs(octokit, owner, repo, run.id);
          cost = calculateCostFromJobs(jobs);
          durationMinutes = cost.breakdown.UBUNTU.minutes + cost.breakdown.WINDOWS.minutes + cost.breakdown.MACOS.minutes;
        }

        if (verbose) {
          console.log(`Run #${run.run_number}: ${run.name}`);
          console.log(`  ID: ${run.id}`);
          console.log(`  Status: ${run.conclusion}`);
          console.log(`  Date: ${new Date(run.created_at).toLocaleDateString()}`);
          console.log(`  Duration: ${formatMinutes(durationMinutes)}`);

          if (cost.breakdown.UBUNTU.minutes > 0) {
            console.log(`  Linux: ${formatMinutes(cost.breakdown.UBUNTU.minutes)} -> ${formatCost(cost.breakdown.UBUNTU.cost)}`);
          }
          if (cost.breakdown.WINDOWS.minutes > 0) {
            console.log(`  Windows: ${formatMinutes(cost.breakdown.WINDOWS.minutes)} -> ${formatCost(cost.breakdown.WINDOWS.cost)}`);
          }
          if (cost.breakdown.MACOS.minutes > 0) {
            console.log(`  macOS: ${formatMinutes(cost.breakdown.MACOS.minutes)} -> ${formatCost(cost.breakdown.MACOS.cost)}`);
          }

          console.log(`  Total Cost: ${formatCost(cost.total)}\n`);
        }

        totalLinuxMinutes += cost.breakdown.UBUNTU.minutes;
        totalWindowsMinutes += cost.breakdown.WINDOWS.minutes;
        totalMacOSMinutes += cost.breakdown.MACOS.minutes;
        totalCost += cost.total;
        successCount++;
      } catch (error) {
        if (verbose) {
          console.error(`Run #${run.run_number}: Error - ${error.message}\n`);
        }
      }
    }

    // Calculate projections
    const actualDays = days || 7; // Default to 7 days for projection
    const monthlyMultiplier = 30 / actualDays;
    const yearlyMultiplier = 365 / actualDays;

    const monthlyCost = totalCost * monthlyMultiplier;
    const yearlyCost = totalCost * yearlyMultiplier;
    const monthlyLinux = totalLinuxMinutes * monthlyMultiplier;
    const monthlyWindows = totalWindowsMinutes * monthlyMultiplier;
    const monthlyMacOS = totalMacOSMinutes * monthlyMultiplier;
    const yearlyLinux = totalLinuxMinutes * yearlyMultiplier;
    const yearlyWindows = totalWindowsMinutes * yearlyMultiplier;
    const yearlyMacOS = totalMacOSMinutes * yearlyMultiplier;

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log(`SUMMARY (Last ${actualDays} days)`);
    console.log('═'.repeat(60));
    console.log(`Analyzed runs: ${successCount}/${runs.length}`);
    console.log('');
    console.log('ACTUAL USAGE:');
    if (totalLinuxMinutes > 0) {
      console.log(`  Linux:   ${formatMinutes(totalLinuxMinutes)}`);
    }
    if (totalWindowsMinutes > 0) {
      console.log(`  Windows: ${formatMinutes(totalWindowsMinutes)}`);
    }
    if (totalMacOSMinutes > 0) {
      console.log(`  macOS:   ${formatMinutes(totalMacOSMinutes)}`);
    }
    console.log(`  Total Cost: ${formatCost(totalCost)}`);

    console.log('');
    console.log('─'.repeat(60));
    console.log('PROJECTED MONTHLY (based on last ' + actualDays + ' days):');
    if (monthlyLinux > 0) {
      console.log(`  Linux:   ${formatMinutes(monthlyLinux)} (~${(monthlyLinux / 60).toFixed(1)} hours)`);
    }
    if (monthlyWindows > 0) {
      console.log(`  Windows: ${formatMinutes(monthlyWindows)} (~${(monthlyWindows / 60).toFixed(1)} hours)`);
    }
    if (monthlyMacOS > 0) {
      console.log(`  macOS:   ${formatMinutes(monthlyMacOS)} (~${(monthlyMacOS / 60).toFixed(1)} hours)`);
    }
    console.log(`  Estimated Monthly Cost: ${formatCost(monthlyCost)}`);

    console.log('');
    console.log('─'.repeat(60));
    console.log('PROJECTED YEARLY (based on last ' + actualDays + ' days):');
    if (yearlyLinux > 0) {
      console.log(`  Linux:   ${formatMinutes(yearlyLinux)} (~${(yearlyLinux / 60).toFixed(1)} hours)`);
    }
    if (yearlyWindows > 0) {
      console.log(`  Windows: ${formatMinutes(yearlyWindows)} (~${(yearlyWindows / 60).toFixed(1)} hours)`);
    }
    if (yearlyMacOS > 0) {
      console.log(`  macOS:   ${formatMinutes(yearlyMacOS)} (~${(yearlyMacOS / 60).toFixed(1)} hours)`);
    }
    console.log(`  Estimated Yearly Cost: ${formatCost(yearlyCost)}`);
    console.log('═'.repeat(60));

    if (successCount === 0) {
      console.log('\nNote: No data available. Possible reasons:');
      console.log('- Repositories without proper API access');
      console.log('\nSet GITHUB_TOKEN environment variable for authenticated requests.');
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function printHelp() {
  console.log(`
GitHub Actions Cost Calculator

Usage:
  gh-actions-cost <owner/repo> [options]

Options:
  --days <n>         Analyze runs from last n days (default: 7)
  --since <date>     Only analyze runs since date (YYYY-MM-DD)
  --verbose, -v      Show details for each run
  --help, -h         Show this help message

Environment Variables:
  GITHUB_TOKEN       GitHub personal access token (optional but recommended)

Examples:
  gh-actions-cost theopenco/llmgateway --days 7
  gh-actions-cost facebook/react --days 30 --verbose
  gh-actions-cost microsoft/vscode --since 2026-01-01

Notes:
  - Public repositories have FREE GitHub Actions usage
  - This calculator shows theoretical costs for private repositories
  - Pricing based on January 2026 rates (reduced by up to 39%)
  - Set GITHUB_TOKEN for better API rate limits
  - Monthly/yearly projections are extrapolated from the analyzed period
  `);
}

main();

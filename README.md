# GitHub Actions Cost Calculator

Calculate theoretical GitHub Actions costs for any OSS repository using official GitHub pricing and the GitHub API.

## Overview

This tool analyzes GitHub Actions workflow runs and calculates the theoretical cost based on:
- Minutes used per workflow run
- Runner type (Linux, Windows, macOS)
- Official GitHub pricing (as of January 2026)

**Important:** GitHub Actions usage in **public repositories is FREE**. This calculator shows theoretical costs as if the repository were private, useful for:
- Estimating costs before migrating to private repos
- Understanding resource usage patterns
- Comparing CI/CD costs across projects

## Features

- Fetches workflow run data via GitHub API
- Calculates costs with accurate pricing multipliers
- Breaks down costs by OS (Linux/Windows/macOS)
- Supports date filtering and custom run limits
- Works with or without authentication

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```bash
node src/cli.js <owner/repo>
```

### With Options

```bash
# Analyze last 20 runs
node src/cli.js facebook/react --limit 20

# Analyze runs since specific date
node src/cli.js microsoft/vscode --since 2026-01-01

# With authentication (recommended for better rate limits)
GITHUB_TOKEN=your_token_here node src/cli.js vercel/next.js
```

### Getting a GitHub Token

For better API rate limits, create a GitHub Personal Access Token:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (for private repos) or `public_repo` (for public only)
4. Copy the token and set it as environment variable:

```bash
export GITHUB_TOKEN=your_token_here
```

## Pricing Information

Based on GitHub's official pricing (effective January 2026, reduced by up to 39%):

| Runner Type | Cost per Minute | Multiplier |
|-------------|-----------------|------------|
| Linux       | $0.008          | 1x         |
| Windows     | $0.016          | 2x         |
| macOS       | $0.080          | 10x        |

**Notes:**
- Prices shown are for private repositories
- Public repositories: FREE (unlimited usage)
- Pricing subject to change by GitHub

## API Limitations

This tool uses the GitHub API endpoint:
- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing`

**Important Limitations:**
- Timing data may not be available for public repositories (as they're free)
- The endpoint may be deprecated in the future (GitHub is closing it down)
- Requires proper authentication for private repositories
- Rate limits apply (60 requests/hour unauthenticated, 5000/hour authenticated)

## Example Output

```
Fetching workflow runs for facebook/react...
Note: GitHub Actions usage in PUBLIC repositories is FREE
This calculator shows theoretical costs if this were a private repo

Found 10 completed workflow run(s)

Run #12345: CI
  ID: 12345678
  Status: success
  Date: 1/26/2026
  Duration: 8.50 min
  Linux: 8.50 min → $0.0680
  Total Cost: $0.0680

Run #12344: Tests
  ID: 12345677
  Status: success
  Date: 1/25/2026
  Duration: 12.30 min
  Linux: 10.20 min → $0.0816
  Windows: 2.10 min → $0.0336
  Total Cost: $0.1152

────────────────────────────────────────────────────────────
SUMMARY
────────────────────────────────────────────────────────────
Analyzed runs: 2/10
Total Linux minutes: 18.70 min
Total Windows minutes: 2.10 min

Total Cost: $0.1832
────────────────────────────────────────────────────────────
```

## Technical Details

### How It Works

1. Fetches workflow runs using GitHub REST API
2. For each run, retrieves timing data with OS breakdown
3. Calculates costs using official pricing multipliers
4. Aggregates and displays results

### Data Sources

- **GitHub API:** [REST API endpoints for workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- **Pricing:** [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- **2026 Updates:** [Pricing changes for GitHub Actions](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)

### Known Issues

- Timing data may not be available for all repositories (especially public ones)
- The GitHub API endpoint for timing is being deprecated
- Costs do not include additional charges for larger runner configurations

## Contributing

Contributions welcome! Please ensure:
- Code follows existing patterns
- Pricing data is kept up-to-date with GitHub's official rates
- Error handling for API limitations

## License

MIT

## Disclaimer

This tool is for estimation purposes only. Actual costs may vary based on:
- GitHub plan type
- Free tier allowances
- Runner configuration
- API availability

Always refer to GitHub's official billing documentation for accurate cost information.
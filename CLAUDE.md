# OSS Repo CI Cost Calculator

A Next.js application that calculates theoretical GitHub Actions costs for any public repository.

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page with repo input form
│   │   ├── [...slug]/page.tsx          # Results page (e.g., /owner/repo)
│   │   ├── api/
│   │   │   ├── init/route.ts           # Database initialization endpoint
│   │   │   ├── calculate/route.ts      # Start calculation endpoint
│   │   │   └── status/[...slug]/route.ts # Check calculation status
│   │   ├── layout.tsx
│   │   └── globals.css
│   └── lib/
│       └── github.ts                   # GitHub API client and cost calculation logic
├── e2e/
│   └── full-flow.spec.ts               # Playwright e2e tests
├── tests/
│   └── setup.ts                        # Vitest setup
├── ploy.yaml                           # Ploy configuration (DB binding)
├── playwright.config.ts
├── vitest.config.ts
└── next.config.ts
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite via Ploy (D1-compatible)
- **Styling**: Tailwind CSS
- **GitHub API**: Octokit
- **Testing**: Vitest + Playwright

## Environment Variables

- `GITHUB_TOKEN` - Optional GitHub personal access token for higher API rate limits (60/hour unauthenticated, 5000/hour authenticated)

## Key Commands

```bash
pnpm dev          # Start development server (via Ploy)
pnpm build        # Build for production
pnpm test         # Run unit tests (Vitest)
pnpm test:e2e     # Run e2e tests (Playwright)
```

## Database Schema

The app uses a single `repo_costs` table:

```sql
CREATE TABLE repo_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,          -- "owner/repo"
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, error
  days_analyzed INTEGER,
  total_runs INTEGER,
  analyzed_runs INTEGER,
  linux_minutes REAL DEFAULT 0,
  windows_minutes REAL DEFAULT 0,
  macos_minutes REAL DEFAULT 0,
  actual_cost REAL DEFAULT 0,
  monthly_cost REAL DEFAULT 0,
  yearly_cost REAL DEFAULT 0,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

## Pricing (January 2026)

| Runner Type | Cost per Minute | Multiplier |
|-------------|-----------------|------------|
| Linux       | $0.008          | 1x         |
| Windows     | $0.016          | 2x         |
| macOS       | $0.080          | 10x        |

**Note**: Public repositories have FREE GitHub Actions usage. This app shows theoretical costs if the repository were private.

## API Flow

1. User submits repo slug on landing page
2. POST `/api/calculate` creates pending record, starts background calculation
3. User redirected to `/<owner>/<repo>` which polls `/api/status/<owner>/<repo>`
4. Results cached for 1 hour to avoid redundant API calls

## Development Notes

- Initialize DB by visiting `/api/init` before first use
- The GitHub API timing endpoint doesn't return billable data for public repos, so we fall back to calculating from job durations
- Results are cached in SQLite - completed calculations within the last hour are reused

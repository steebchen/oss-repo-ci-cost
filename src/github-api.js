import { Octokit } from 'octokit';

/**
 * Create GitHub API client
 * @param {string} token - GitHub personal access token (optional for public repos)
 * @returns {Octokit} Octokit instance
 */
export function createClient(token) {
  return new Octokit({
    auth: token
  });
}

/**
 * Get workflow runs for a repository
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Workflow runs
 */
export async function getWorkflowRuns(octokit, owner, repo, options = {}) {
  const {
    per_page = 100,
    page = 1,
    status = 'completed',
    created = null, // Date filter, e.g., '>=2026-01-01'
  } = options;

  try {
    const params = {
      owner,
      repo,
      per_page,
      page,
      status
    };

    if (created) {
      params.created = created;
    }

    const response = await octokit.rest.actions.listWorkflowRunsForRepo(params);
    return response.data.workflow_runs;
  } catch (error) {
    throw new Error(`Failed to fetch workflow runs: ${error.message}`);
  }
}

/**
 * Get timing data for a specific workflow run
 * @param {Octokit} octokit - Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} runId - Workflow run ID
 * @returns {Promise<Object>} Timing data
 */
export async function getWorkflowRunTiming(octokit, owner, repo, runId) {
  try {
    const response = await octokit.rest.actions.getWorkflowRunUsage({
      owner,
      repo,
      run_id: runId
    });
    return response.data;
  } catch (error) {
    // Note: This endpoint may not be available for all repositories
    // or may be deprecated in the future
    if (error.status === 404) {
      throw new Error(`Timing data not available for run ${runId}. This may be because:
- The repository is public (no billable minutes tracked)
- The endpoint is deprecated or unavailable
- Insufficient permissions`);
    }
    throw new Error(`Failed to fetch timing data: ${error.message}`);
  }
}

/**
 * Parse repository string (owner/repo format)
 * @param {string} repoString - Repository string
 * @returns {Object} Owner and repo
 */
export function parseRepository(repoString) {
  const match = repoString.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error('Invalid repository format. Use: owner/repo');
  }
  return {
    owner: match[1],
    repo: match[2]
  };
}

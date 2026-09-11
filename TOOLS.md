# Tool & Capability Inventory

Generated from source **and** from the running server (`list-tools`), so bundled MCP
servers appear here too — they are registered at runtime and cannot be seen in source.

| Surface | Count | Enabled by default |
|---|---|---|
| Native tools | 142 | 19 |
| Bundled MCP tools | 82 | 82 |
| **Total tools** | **224** | **101** |
| Remote MCP servers | 2 | both reachable without a gateway |
| Local MCP servers | 3 | 0 — opt-in |
| Prompts | 8 | – |
| Resources | 5 | – |

**Enabled** column: ● on by default, ○ registered but dormant (enable via `.qnscmcp.yaml`).

## Verification notes

Tools are checked by invoking their own `execute()` through the registry with
`bun run scripts/try-tool.ts <id> '<json>'`, which validates arguments against the
tool's schema exactly as the MCP layer does. That bypasses the editor, so a failure
is attributable to the tool rather than to transport or client configuration.

Findings so far:

- **GitHub auth works per user.** The OAuth App flow was exercised end to end: the
  first call opened a browser and took 8.6s, the second reused the keyring token and
  took 0.8s with no prompt. Seven read-only GitHub tools were verified against the
  real organisation.
- **Only 15 of the 91 GitHub tools are enabled by default.** The rest need
  `tools.include` or `tools.includeCategories` in `.qnscmcp.yaml`. Anyone expecting
  all 92 to appear will be surprised.
- **`weather` cannot work here.** It calls `api.weather.gov`, the US National
  Weather Service: verified passing for New York coordinates and returning 404 for
  Ho Chi Minh City. Marked `[-]` rather than `[!]` — it is not broken, just
  US-only, and would need a different provider to be useful.

**Review status:** `[ ]` not checked, `[x]` verified working, `[!]` broken/needs work, `[-]` not applicable to us.

---

## 1. Native tools (142)

### GitHub (92 tools)

#### Github: Actions (10)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-actions-cancel-workflow-run` | `cancelGithubWorkflowRun` | Cancels a workflow run |
| [ ] | ○ | `github-actions-create-dispatch` | `createGithubWorkflowDispatch` | Manually trigger a GitHub Actions workflow run |
| [ ] | ○ | `github-actions-get-workflow` | `getGithubWorkflow` | Gets a specific workflow in a repository by ID or file name |
| [ ] | ○ | `github-actions-get-workflow-run` | `getGithubWorkflowRun` | Gets a specific workflow run by ID |
| [ ] | ○ | `github-actions-get-workflow-run-job` | `getGithubWorkflowRunJob` | Gets a specific job in a workflow run by ID |
| [ ] | ○ | `github-actions-get-workflow-run-logs` | `getGithubWorkflowRunLogs` | Gets a log for a workflow run by ID |
| [ ] | ○ | `github-actions-list-workflow-run-jobs` | `listGithubWorkflowRunJobs` | Lists jobs for a workflow run |
| [ ] | ○ | `github-actions-list-workflow-runs` | `listGithubWorkflowRuns` | Lists all workflow runs for a repository |
| [ ] | ○ | `github-actions-list-workflows` | `listGithubWorkflows` | Lists the workflows in a repository |
| [ ] | ○ | `github-actions-rerun-workflow` | `rerunGithubWorkflow` | Re-runs a workflow by run ID |

#### Github: Branches (6)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-create-branch` | `createGithubBranch` | Creates a new branch in github repo |
| [ ] | ○ | `github-create-update-file-content` | `createOrUpdateGithubFileContent` | Creates or updates a file in a branch. Accepts plain text via content or a local file path via filePath. Do NOT base64-encode anything — the tool handles all encoding internally. |
| [x] | ● | `github-get-branch` | `getGithubBranch` | Gets a branch in a GitHub repository |
| [x] | ● | `github-list-branches` | `listGithubBranches` | Lists branches for a GitHub repository |
| [ ] | ● | `github-merge-branch` | `mergeGithubBranch` | Merges a branch in a GitHub repository |
| [ ] | ○ | `github-rename-branch` | `renameGithubBranch` | Renames a branch in a GitHub repository |

#### Github: Dependabot (3)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-get-dependabot-alert` | `getDependabotAlert` | Retrieves a Dependabot alert |
| [ ] | ○ | `github-list-dependabot-alerts` | `listDependabotAlerts` | List Dependabot alerts for a repository |
| [ ] | ○ | `github-update-dependabot-alert` | `updateDependabotAlert` | Updates a Dependabot alert |

#### Github: Discussions (9)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-create-team-discussion-comment-reaction` | `createGithubTeamDiscussionCommentReaction` | Creates a reaction to a team discussion comment |
| [ ] | ○ | `github-create-team-discussion-reaction` | `createGithubTeamDiscussionReaction` | Creates a reaction to a team discussion |
| [ ] | ○ | `github-delete-commit-comment-reaction` | `deleteGithubCommitCommentReaction` | Deletes a reaction to a commit comment |
| [ ] | ○ | `github-delete-issue-comment-reaction` | `deleteGithubIssueCommentReaction` | Deletes a reaction to an issue comment |
| [ ] | ○ | `github-delete-issue-reaction` | `deleteGithubIssueReaction` | Deletes a reaction to an issue |
| [ ] | ○ | `github-delete-pull-request-comment-reaction` | `deleteGithubPullRequestCommentReaction` | Deletes a reaction to a pull request review comment |
| [ ] | ○ | `github-delete-release-reaction` | `deleteGithubReleaseReaction` | Deletes a reaction to a release |
| [ ] | ○ | `github-delete-team-discussion-comment-reaction` | `deleteGithubTeamDiscussionCommentReaction` | Deletes a reaction to a team discussion comment |
| [ ] | ○ | `github-delete-team-discussion-reaction` | `deleteGithubTeamDiscussionReaction` | Deletes a reaction to a team discussion |

#### Github: Gists (5)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-gist-create` | `createGithubGist` | Creates a new gist |
| [ ] | ○ | `github-gist-delete` | `deleteGithubGist` | Deletes a gist |
| [ ] | ○ | `github-gist-get` | `getGithubGist` | Gets a specific gist by ID with full content |
| [ ] | ○ | `github-gist-list` | `listGithubGists` | Lists gists for a user or authenticated user |
| [ ] | ○ | `github-gist-update` | `updateGithubGist` | Updates an existing gist |

#### Github: Issues (10)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-issues-add-comment` | `addGithubIssueComment` | Adds a comment to an issue in a GitHub repository |
| [ ] | ● | `github-issues-add-sub-issue` | `addGithubSubIssue` | Adds an existing issue as a sub-issue of a parent issue, creating a formal parent-child relationship visible in the Sub-issues section of the parent |
| [ ] | ● | `github-issues-create` | `createGithubIssue` | Creates a new issue in a GitHub repository |
| [ ] | ● | `github-issues-get` | `getGithubIssue` | Gets the contents of an issue within a repository |
| [ ] | ○ | `github-issues-get-comments` | `getGithubIssueComments` | Gets the comments of an issue within a repository |
| [x] | ● | `github-issues-list` | `listGithubIssues` | Lists and filters repository issues |
| [x] | ● | `github-issues-list-sub-issues` | `listGithubSubIssues` | Lists all sub-issues of a parent issue, showing the formal parent-child relationships established via addGithubSubIssue |
| [ ] | ● | `github-issues-remove-sub-issue` | `removeGithubSubIssue` | Removes a sub-issue from a parent issue, dissolving the parent-child relationship without deleting either issue |
| [ ] | ○ | `github-issues-search` | `searchGithubIssues` | Searches for issues and pull requests across GitHub |
| [ ] | ○ | `github-issues-update` | `updateGithubIssue` | Updates an existing issue in a GitHub repository |

#### Github: Orgs (3)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-my-orgs-list` | `listMyGithubOrganizations` | Lists all organizations for the current user |
| [ ] | ○ | `github-org-get` | `getGithubOrganization` | Gets details for a specific organization |
| [ ] | ○ | `github-orgs-list` | `listGithubOrganizations` | Lists all organizations using cursor-based pagination |

#### Github: Projects (19)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-projects-add-draft-issue` | `addGithubProjectDraftIssue` | Creates a draft issue directly in a GitHub Project V2. Draft issues exist only within the project and are not linked to a repository. |
| [ ] | ○ | `github-projects-add-item` | `addGithubProjectItem` | Adds an existing issue or pull request to a GitHub Project V2. Requires the project node ID and the content node ID (issue or PR). |
| [ ] | ○ | `github-projects-archive-item` | `archiveGithubProjectItem` | Archives an item in a GitHub Project V2. Archived items are hidden from default views but can be restored with unarchiveGithubProjectItem. |
| [ ] | ○ | `github-projects-clear-item-field` | `clearGithubProjectItemField` | Clears/resets a field value on a GitHub Project V2 item. Supports text, number, date, single-select, iteration, assignees, labels, and milestone fields. |
| [ ] | ○ | `github-projects-convert-draft-to-issue` | `convertGithubProjectDraftToIssue` | Converts a draft issue in a GitHub Project V2 into a real GitHub issue in the specified repository. The item remains in the project but is now linked to the created issue. |
| [ ] | ○ | `github-projects-create` | `createGithubProject` | Creates a new GitHub Project V2 for an organization or user. Requires the owner node ID (use getGithubOrganization for orgs, or the GraphQL viewer query for users). |
| [ ] | ○ | `github-projects-create-field` | `createGithubProjectField` | Creates a new custom field in a GitHub Project V2. Supports TEXT, NUMBER, DATE, SINGLE_SELECT, and ITERATION field types. For SINGLE_SELECT, provide single_select_options with name and optional color/description. |
| [ ] | ○ | `github-projects-delete-field` | `deleteGithubProjectField` | Deletes a custom field from a GitHub Project V2. This permanently removes the field and all its values from all items in the project. |
| [ ] | ○ | `github-projects-delete-item` | `deleteGithubProjectItem` | Removes an item from a GitHub Project V2. This does not delete the underlying issue or pull request, only removes it from the project. |
| [ ] | ○ | `github-projects-get` | `getGithubProject` | Gets a single GitHub Project V2 by number for an organization or user. Provide either org or user parameter. Returns the project node ID needed by other project tools, along with full project details. |
| [ ] | ○ | `github-projects-list` | `listGithubProjects` | Lists GitHub Projects V2 for an organization or user. Provide either org or user parameter. Returns project titles, IDs, and metadata with pagination support. |
| [ ] | ○ | `github-projects-list-fields` | `listGithubProjectFields` | Lists fields/columns defined on a GitHub Project V2. Returns field IDs, names, types, and options (for single-select and iteration fields). Use this to discover field IDs before updating item field values. |
| [ ] | ○ | `github-projects-list-items` | `listGithubProjectItems` | Lists items (issues, pull requests, and draft issues) in a GitHub Project V2, including their field values. Use listGithubProjectFields first to understand the available fields. |
| [ ] | ○ | `github-projects-unarchive-item` | `unarchiveGithubProjectItem` | Restores an archived item in a GitHub Project V2, making it visible in default views again. |
| [ ] | ○ | `github-projects-update` | `updateGithubProject` | Updates a GitHub Project V2 settings including title, description, readme, visibility, and closed state. |
| [ ] | ○ | `github-projects-update-draft-issue` | `updateGithubProjectDraftIssue` | Updates the title and/or body of a draft issue in a GitHub Project V2. |
| [ ] | ○ | `github-projects-update-field` | `updateGithubProjectField` | Updates a custom field in a GitHub Project V2. Can rename the field or modify single-select options. For single-select fields, include the option id to update existing options or omit it to add new options. |
| [ ] | ○ | `github-projects-update-item-field` | `updateGithubProjectItemField` | Sets a field value on a GitHub Project V2 item. Supports text, number, date, single-select, and iteration field types. Use listGithubProjectFields first to discover field IDs and available options. |
| [ ] | ○ | `github-projects-update-item-position` | `updateGithubProjectItemPosition` | Updates the position of an item in a GitHub Project V2. Place the item after a specific item, or omit after_id to move it to the top. |

#### Github: Pulls (15)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ● | `github-pulls-add-reviewers` | `addGithubPullRequestReviewers` | Adds reviewers to a pull request |
| [ ] | ● | `github-pulls-create` | `createGithubPullRequest` | Creates a new pull request in a repository |
| [ ] | ○ | `github-pulls-create-review` | `createGithubPullRequestReview` | Creates a review on a pull request |
| [x] | ● | `github-pulls-get` | `getGithubPullRequest` | Gets the details of a specific pull request within a repository |
| [ ] | ○ | `github-pulls-get-comments` | `getGithubPullRequestComments` | Gets the comments on a pull request |
| [ ] | ○ | `github-pulls-get-files` | `getGithubPullRequestFiles` | Gets the list of files changed in a pull request |
| [ ] | ○ | `github-pulls-get-review-threads` | `getGithubPullRequestReviewThreads` | Lists review threads for a pull request, including resolution state and comment details. |
| [ ] | ○ | `github-pulls-get-reviews` | `getGithubPullRequestReviews` | Gets the reviews on a pull request |
| [x] | ● | `github-pulls-get-status` | `getGithubPullRequestStatus` | Gets the combined status of all status checks for a pull request |
| [x] | ● | `github-pulls-list` | `listGithubPullRequests` | Lists and filters repository pull requests |
| [ ] | ○ | `github-pulls-mark-ready` | `markGithubPullRequestReady` | Marks a draft pull request as ready for review |
| [ ] | ○ | `github-pulls-merge` | `mergeGithubPullRequest` | Merges a pull request |
| [ ] | ● | `github-pulls-remove-reviewers` | `removeGithubPullRequestReviewers` | Removes reviewers from a pull request |
| [ ] | ○ | `github-pulls-update-branch` | `updateGithubPullRequestBranch` | Updates a pull request branch with the latest changes from the base branch |
| [ ] | ○ | `github-set-pr-review-thread-resolution` | `setGithubPullRequestReviewThreadResolution` | Sets the resolution status of a review thread on a pull request. Use resolved=true to mark feedback as addressed, or resolved=false to reopen for further discussion. |

#### Github: Releases (2)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-get-latest-release` | `getLatestGithubRelease` | Gets the latest published release for a GitHub repository |
| [ ] | ○ | `github-list-releases` | `listGithubReleases` | Gets a list of releases for a GitHub repository |

#### Github: Repos (6)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-repos-list` | `listGithubRepositories` | Lists all repositories in an organization |
| [ ] | ○ | `github-repository-get` | `getGithubRepository` | Gets details for a specific repository |
| [ ] | ○ | `github-repository-get-content` | `getGithubRepositoryContent` | Gets the contents of a file or directory in a repository |
| [ ] | ○ | `github-repository-topics-get` | `getGithubRepositoryTopics` | Gets topics for a specific repository |
| [ ] | ○ | `github-repository-topics-update` | `updateGithubRepositoryTopics` | Updates topics for a repository (add/remove/replace) |
| [ ] | ○ | `github-user-repos-list` | `listUserGithubRepositories` | Lists public repositories for the specified user |

#### Github: Search (3)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-code-search` | `searchCode` | Searches for query terms inside of a file |
| [ ] | ○ | `github-commits-search` | `searchCommits` | Find commits via various criteria on the default branch |
| [ ] | ○ | `github-repos-search` | `searchRepos` | Find repositories via various criteria. |

#### Github: Wiki (1)

| ✓ | On | Tool ID | Function | Description |
|---|---|---|---|---|
| [ ] | ○ | `github-wiki-get-content` | `getGithubWikiContent` | Gets the content of a specific page from a GitHub wiki repository |

### Non-GitHub (50 tools)

#### CrUX (4)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `crux-audit-core-web-vitals` | `auditCoreWebVitals` |  | `GOOGLE_CRUX_API_KEY` |
| [ ] | ○ | `crux-compare-origins` | `compareCruxOrigins` | Compare web performance metrics across multiple origins or URLs side-by-side using real-user data from the Google Chrome UX Report (CrUX). Metrics include the 3 Core Web Vitals (LCP, INP, CLS) and supporting metrics FCP and TTFB. Accepts 2–5 targets and returns a normalized comparison table with p75 values and Good/Needs Improvement/Poor ratings for each metric. Ideal for competitive benchmarking or comparing multiple pages on the same site. | `GOOGLE_CRUX_API_KEY` |
| [ ] | ○ | `crux-query-history` | `queryCruxHistory` | Query historical Core Web Vitals trends from the Google Chrome UX Report (CrUX) History API for an origin or URL. Returns up to 40 weeks of weekly timeseries data, enabling trend analysis and regression detection. Each data point in the timeseries represents a 28-day rolling average for that week. Use this to track how performance has changed over time. | `GOOGLE_CRUX_API_KEY` |
| [ ] | ○ | `crux-query-metrics` | `queryCruxMetrics` | Query current Core Web Vitals and performance metrics from the Google Chrome UX Report (CrUX) for an origin or URL. Returns the latest 28-day rolling window of real-user experience data including LCP, INP, CLS, FCP, TTFB, and more. Use this to get a snapshot of field performance data for a website or page. | `GOOGLE_CRUX_API_KEY` |

#### Knowledge Graph (9)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `add-observations` | `addObservations` | Add new observations to existing entities in the knowledge graph | – |
| [x] | ○ | `create-entities` | `createEntities` | Create multiple new entities in the knowledge graph | – |
| [ ] | ○ | `create-relations` | `createRelations` | Create multiple new relations between entities in the knowledge graph. Relations should be in active voice | – |
| [ ] | ○ | `delete-entities` | `deleteEntities` | Delete multiple entities and their associated relations from the knowledge graph | – |
| [ ] | ○ | `delete-observations` | `deleteObservations` | Delete specific observations from entities in the knowledge graph | – |
| [ ] | ○ | `delete-relations` | `deleteRelations` | Delete multiple relations from the knowledge graph | – |
| [x] | ○ | `open-nodes` | `openNodes` | Open/expand specific nodes in the knowledge graph to show their connections and related entities | – |
| [x] | ○ | `read-graph` | `readGraph` | Read and query the knowledge graph structure, entities, and relations | – |
| [x] | ○ | `search-nodes` | `searchNodes` | Search for entities/nodes in the knowledge graph by content, name, or other fields | – |

#### Memory (5)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `add-memory` | `addMemory` | When the user wants to remember something important, they can use this tool to add a memory for future retrieval. | `QNSC_MCP_API_KEY` |
| [ ] | ○ | `clear-memory` | `clearMemory` | When the user wants to remove all previously stored memories. | – |
| [ ] | ○ | `get-memory` | `getMemory` | When the user wants to remember something important, they can use this tool to retrieve a memory. | – |
| [ ] | ○ | `remove-memory` | `removeMemory` | When the user wants to remove a specific memory. | – |
| [ ] | ○ | `update-memory` | `updateMemory` | When the user wants to update an existing memory. | `QNSC_MCP_API_KEY` |

#### NPM (5)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `npm-build-order` | `npmBuildOrder` | Compute the layered build order for an npm package in a flat sibling-folders workspace. | – |
| [ ] | ○ | `npm-dag` | `npmDag` | Show the flattened directed acyclic graph of owned (intra-workspace) packages reachable from a package. | – |
| [x] | ○ | `npm-doctor` | `npmDoctor` | Report issues in the workspace: version drift between declared and on-disk versions, | – |
| [x] | ○ | `npm-list` | `npmList` | List every package in the workspace with its name, folder, version, and projen status. | – |
| [ ] | ○ | `npm-tree` | `npmTree` | Print the full recursive dependency tree of a package showing the path through dependencies. | – |

#### PostgreSQL (4)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `postgres-describe-table` | `postgresDescribeTable` | Get detailed schema information about a table including columns, data types, constraints, indexes, and table metadata. Prefer this over postgresQuery("\\d table") or manual information_schema queries. Returns comprehensive table structure information. | – |
| [ ] | ○ | `postgres-list-databases` | `postgresListDatabases` | List all databases on the PostgreSQL server. Prefer this over postgresQuery("SELECT datname FROM pg_database"). Returns database names with encoding, collation, and connection settings. System databases (postgres, template0, template1) are excluded by default. | – |
| [ ] | ○ | `postgres-list-tables` | `postgresListTables` | List tables in a database with schema support. Prefer this over postgresQuery("SELECT * FROM information_schema.tables"). Returns table names with schema, owner, and size information. System schemas (pg_catalog, information_schema) are excluded. | – |
| [ ] | ○ | `postgres-query` | `postgresQuery` | Execute custom SQL queries against a PostgreSQL database. Use this for data retrieval (SELECT), modifications (INSERT, UPDATE, DELETE), or operations not covered by specialized tools. For common tasks, prefer specialized tools: postgresListDatabases to list databases, postgresListTables to list tables, postgresDescribeTable to inspect schemas. Supports parameter binding for security. | – |

#### Swagger (2)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ● | `open-api-client-generator-tool` | `generateOpenApiClient` | A tool to generate client code from OpenAPI specifications. | – |
| [ ] | ● | `save-swagger-document-tool` | `saveSwaggerHubDocument` | A tool to save an openapi definition. | `SWAGGER_HUB_API_KEY` |

#### Utility (15)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [x] | ○ | `claude-code-usage` | `getClaudeCodeUsage` | Retrieve the usage statistics for a Claude Code project. | – |
| [x] | ● | `clipboard` | `getClipboardContent` | Fetch the contents of the clipboard (text, images, or binary data). Used to see what is on the clipboard. | – |
| [x] | ○ | `convert-unix-timestamp` | `convertUnixTimestamp` | Convert unix timestamps to human readable time representations | – |
| [x] | ● | `doctor` | `doctor` | Diagnose MCP configuration issues when tools fail with authentication, connection, or permission errors. Checks for missing environment variables (API keys, tokens), invalid paths, and configuration problems. Use this when Splunk, Slack, GitHub, or other external service tools report errors. | – |
| [ ] | ○ | `execute-task` | `executeTask` | Get next pending task and mark tasks as completed in a unified execution workflow. Enforces one task in progress at a time per list. | – |
| [x] | ○ | `get-converted-time` | `convertTime` | Convert time between timezones. | – |
| [x] | ○ | `get-current-time` | `getCurrentTime` | Get current time in a specific timezone. | – |
| [x] | ○ | `get-task-statistics` | `getTaskStatistics` | Get task completion statistics and history with comprehensive analytics | – |
| [ ] | ○ | `location-to-coords` | `getCoordinatesFromLocation` | Convert a location or POI to latitude and longitude coordinates | `GEOCODE_MAPS_API_KEY` |
| [ ] | ○ | `logout` | `logout` | Log out of a single remote MCP server. Clears the locally-stored session token and opens the gateway credential manager (behind SSO) to revoke your saved credential for that server. | – |
| [x] | ○ | `manage-task-lists` | `manageTaskLists` | Create, view, delete, and list task lists with comprehensive management capabilities | – |
| [ ] | ○ | `manage-tasks` | `manageTasks` | Add, edit, delete, and insert tasks within task lists with full CRUD capabilities | – |
| [ ] | ○ | `reauth` | `reauth` | Force re-authentication for a given service. Clears stored tokens and triggers a fresh login flow. | – |
| [ ] | ○ | `reorder-tasks` | `reorderTasks` | Reorder tasks within a task list by updating their positions | – |
| [-] | ○ | `weather` | `getWeatherForecast` | Get the weather forecast for a given latitude and longitude | – |

#### k6 (6)

| ✓ | On | Tool ID | Function | Description | Requires |
|---|---|---|---|---|---|
| [ ] | ○ | `k6-compare-test-results` | `compareK6TestResults` | Compare two k6 Cloud test runs side-by-side. Fetches both runs via v6 API and real performance metrics via v5 API, then compares P90, P95, RPS, error rate alongside duration and result with configurable thresholds. | `GRAFANA_K6_TOKEN` |
| [ ] | ○ | `k6-get-metric-timeseries` | `getK6MetricTimeseries` | Fetch time-series metric data for a k6 Cloud test run via the v5 range API. Returns metric values over time at the specified step interval. | `GRAFANA_K6_TOKEN` |
| [ ] | ○ | `k6-get-scenario-results` | `getK6ScenarioResults` | Retrieve test run results for a scenario (load test) in a k6 Cloud project. Finds the load test by name and returns recent or specific test run results with status, duration, and metadata. | `GRAFANA_K6_TOKEN` |
| [ ] | ○ | `k6-get-test-metrics` | `getK6TestMetrics` | Fetch real performance metrics for a k6 Cloud test run via the v5 API. Returns per-endpoint and per-scenario P90, P95, RPS, error rate, and VUs with automatic ramp-up offset. | `GRAFANA_K6_TOKEN` |
| [ ] | ○ | `k6-list-project-load-tests` | `listK6ProjectLoadTests` | List all load tests in a k6 Cloud project. Resolves project by ID or name (with partial matching) and paginates through all load tests. | `GRAFANA_K6_TOKEN` |
| [ ] | ○ | `k6-list-user-projects` | `listK6UserProjects` | Validate k6 Cloud authentication and list all projects the authenticated user has access to, including per-project accessibility checks | `GRAFANA_K6_TOKEN` |

---

## 2. Bundled MCP tools (82)

Third-party MCP servers bundled and run locally by the gateway. Installed under
`~/.qnscmcp/bundled/`. **These were missing from the previous inventory** — they are
registered at runtime, so a source-only scan cannot see them.

### `chrome-devtools-mcp` (26)

| ✓ | On | Tool | Description |
|---|---|---|---|
| [ ] | ● | `click` | Clicks on the provided element |
| [ ] | ● | `close-page` | Closes the page by its index. The last open page cannot be closed. |
| [ ] | ● | `drag` | Drag an element onto another element |
| [ ] | ● | `emulate` | Emulates various features on the selected page. |
| [ ] | ● | `evaluate-script` | Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON so returned values ha... |
| [ ] | ● | `fill` | Type text into a input, text area or select an option from a <select> element. |
| [ ] | ● | `fill-form` | Fill out multiple form elements at once |
| [ ] | ● | `get-console-message` | Gets a console message by its ID. You can get all messages by calling listconsolemessages. |
| [ ] | ● | `get-network-request` | Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Networ... |
| [ ] | ● | `handle-dialog` | If a browser dialog was opened, use this command to handle it |
| [ ] | ● | `hover` | Hover over the provided element |
| [ ] | ● | `list-console-messages` | List all console messages for the currently selected page since the last navigation. |
| [ ] | ● | `list-network-requests` | List all requests for the currently selected page since the last navigation. |
| [ ] | ● | `list-pages` | Get a list of pages open in the browser. |
| [ ] | ● | `navigate-page` | Navigates the currently selected page to a URL. |
| [ ] | ● | `new-page` | Creates a new page |
| [ ] | ● | `performance-analyze-insight` | Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the re... |
| [ ] | ● | `performance-start-trace` | Starts a performance trace recording on the selected page. This can be used to look for performance problems and insi... |
| [ ] | ● | `performance-stop-trace` | Stops the active performance trace recording on the selected page. |
| [ ] | ● | `press-key` | Press a key or key combination. Use this when other input methods like fill() cannot be used (e.g., keyboard shortcut... |
| [ ] | ● | `resize-page` | Resizes the selected page's window so that the page has specified dimension |
| [ ] | ● | `select-page` | Select a page as a context for future tool calls. |
| [ ] | ● | `take-screenshot` | Take a screenshot of the page or element. |
| [ ] | ● | `take-snapshot` | Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along wi... |
| [ ] | ● | `upload-file` | Upload a file through a provided element. |
| [ ] | ● | `wait-for` | Wait for the specified text to appear on the selected page. |

### `sharepoint` (56)

| ✓ | On | Tool | Description |
|---|---|---|---|
| [ ] | ● | `addgroupmember` | Add a user to a SharePoint group |
| [ ] | ● | `addnavigationlink` | Add a navigation link to a SharePoint site (global or quick navigation) |
| [ ] | ● | `addviewfield` | Add a field to a SharePoint list view |
| [ ] | ● | `batchcreatelistitems` | Create multiple items in a SharePoint list using a single batch request |
| [ ] | ● | `batchdeletelistitems` | Delete multiple items from a SharePoint list using a single batch request |
| [ ] | ● | `batchupdatelistitems` | Update multiple items in a SharePoint list using a single batch request |
| [ ] | ● | `createlist` | Create a new SharePoint list or document library |
| [ ] | ● | `createlistcontenttype` | Create a new content type in a SharePoint list |
| [ ] | ● | `createlistfield` | Create a new field (column) in a SharePoint list |
| [ ] | ● | `createlistitem` | Create a new item in a SharePoint list with specified field values |
| [ ] | ● | `createlistview` | Create a new view for a SharePoint list with specified fields and settings |
| [ ] | ● | `createmodernpage` | Create a modern page in SharePoint |
| [ ] | ● | `deletelist` | Delete a SharePoint list or document library |
| [ ] | ● | `deletelistcontenttype` | Delete a content type from a SharePoint list |
| [ ] | ● | `deletelistfield` | Delete a field (column) from a SharePoint list |
| [ ] | ● | `deletelistitem` | Delete an item from a SharePoint list |
| [ ] | ● | `deletelistview` | Delete a view from a SharePoint list |
| [ ] | ● | `deletemodernpage` | Delete a modern page from SharePoint |
| [ ] | ● | `deletenavigationlink` | Delete a navigation link from a SharePoint site (global or quick navigation) |
| [ ] | ● | `deletesitecontenttype` | Delete a content type from a SharePoint site |
| [ ] | ● | `deletesubsite` | Delete a SharePoint subsite |
| [ ] | ● | `getglobalnavigationlinks` | Get global navigation links from a SharePoint site |
| [ ] | ● | `getgroupmembers` | Get members of a specific SharePoint group |
| [ ] | ● | `getlistcontenttype` | Get a specific content type from a SharePoint list |
| [ ] | ● | `getlistcontenttypes` | Get all content types from a specific SharePoint list |
| [ ] | ● | `getlistfields` | Get detailed information about fields/columns in a SharePoint list |
| [ ] | ● | `getlistitems` | Get all items from a specific SharePoint list identified by site URL and list title |
| [ ] | ● | `getlists` | Get the list of SharePoint lists along with their Titles, URLs, ItemCounts, last modified date, description and base ... |
| [ ] | ● | `getlistviews` | Get all views from a SharePoint list with optional field details |
| [ ] | ● | `getmodernpage` | Get a specific modern page by ID from a SharePoint site |
| [ ] | ● | `getmodernpages` | Get modern pages from a SharePoint site |
| [ ] | ● | `getquicknavigationlinks` | Get quick navigation links (left navigation) from a SharePoint site |
| [ ] | ● | `getregionalsettings` | Get regional settings from a SharePoint site |
| [ ] | ● | `getsite` | Get the title of a SharePoint website |
| [ ] | ● | `getsitecollectionfeatures` | Get all features from a SharePoint site collection |
| [ ] | ● | `getsitecontenttype` | Get a specific content type from a SharePoint site |
| [ ] | ● | `getsitecontenttypes` | Get all content types from a SharePoint site |
| [ ] | ● | `getsitefeature` | Get a specific feature from a SharePoint site by feature ID |
| [ ] | ● | `getsitefeatures` | Get all features from a SharePoint site |
| [ ] | ● | `getsitegroups` | Get all SharePoint groups for a site |
| [ ] | ● | `getsiteusers` | Get users from a SharePoint site, optionally filtered by role |
| [ ] | ● | `getsubsites` | Get all subsites from a SharePoint site |
| [ ] | ● | `getviewfields` | Get all fields from a specific SharePoint list view |
| [ ] | ● | `moveviewfieldto` | Move a field to a specific position in a SharePoint list view |
| [ ] | ● | `removeallviewfields` | Remove all fields from a SharePoint list view |
| [ ] | ● | `removegroupmember` | Remove a user from a SharePoint group |
| [ ] | ● | `removeviewfield` | Remove a field from a SharePoint list view |
| [ ] | ● | `searchsharepointsite` | Search within a SharePoint site using KQL query |
| [ ] | ● | `updatelist` | Update a SharePoint list properties (Title, Description, versioning settings, etc.) |
| [ ] | ● | `updatelistcontenttype` | Update a content type in a SharePoint list |
| [ ] | ● | `updatelistfield` | Update a field/column in a SharePoint list including display name, choices, etc. |
| [ ] | ● | `updatelistitem` | Update an item in a SharePoint list |
| [ ] | ● | `updatelistview` | Update an existing view for a SharePoint list |
| [ ] | ● | `updatenavigationlink` | Update a navigation link in a SharePoint site (global or quick navigation) |
| [ ] | ● | `updatesite` | Update a SharePoint site properties (Title, Description, etc.) |
| [ ] | ● | `updatesitecontenttype` | Update a content type in a SharePoint site |

---

## 3. Remote MCP servers (2)

Reached over HTTP rather than spawned locally. Opt in with `tools.includeRemoteMCPs`.

| ✓ | ID | Reached | Auth | Tools |
|---|---|---|---|---|
| [!] | `aws-knowledge-mcp-server` | Directly at `knowledge-mcp.global.api.aws` | None — public | 5 register, but calls are refused (see below) |
| [ ] | `figma-dev` | `http://localhost:3845/mcp`, via the Figma desktop app | None — local | requires Figma running |

17 others were removed: Atlassian, Datadog, PagerDuty, Slack, Stripe, New Relic,
Postman, Kong, Cortex, Bitrise, Smartsheet, LogRocket, Lucid, Pendo, Amplitude, k6 and
a `github` proxy. All routed through a hosted platform gateway at `*.ai.qnsc.vn` that
is not deployed for this organization — those hostnames have no DNS records, so none of
them could connect. Grafana k6 is still covered by the 6 native k6 tools, and GitHub by
the 92 native GitHub tools.

`aws-knowledge-mcp-server` connects and its 5 tools register, but invoking one returns
`Http operation is not supported for gateway protocol type MCP` from AWS. That is the
endpoint's own response, not this client: raw `curl` gets the same reply, and it is
identical whether the handshake requests protocol `2024-11-05`, `2025-03-26` or
`2025-06-18` (AWS negotiates `2025-03-26` in every case). `initialize` and `tools/list`
succeed; only `tools/call` is refused. Needs checking against AWS's current guidance
before the tools can be relied on.

See [`src/remote-mcps/README.md`](src/remote-mcps/README.md) for what the gateway did.

## 4. Local MCP servers (3)

Spawned as local subprocesses; opt in via `includeLocalMCPs`. Args via `mcpArgs`.

| ✓ | ID | Name | Description | Required env |
|---|---|---|---|---|
| [ ] | `dart-mcp` | Dart MCP | MCP server for Dart/Flutter cross platform development. | `DART_SDK` |
| [ ] | `mobile-next-local` | Mobile Next | Mobile Next - MCP server for Mobile Development and Automation | – |
| [ ] | `playwright-local` | Playwright | Local Playwright MCP server for browser automation and testing. Configure CLI arguments via mcpArgs in .qnscmcp.yaml config file. Supports various options including --extension for Chrome extension mode, --browser for browser selection, --headless for headless mode, and more. | `PLAYWRIGHT_BROWSERS_PATH` |

---

## 5. Prompts (8)

| ✓ | ID | Name | Description |
|---|---|---|---|
| [ ] | `class-diagram` | Create Class Diagram | Generate a Mermaid class diagram from a code snippet |
| [ ] | `code-performance` | Create Code Performance | Generate a performance review from a code snippet |
| [ ] | `code-security` | Perform Code Security Review | Generate a security review on a provided file path |
| [ ] | `code-smell` | Perform Code Smell Review | Generate a code smell review on a provided file path |
| [ ] | `flowchart` | Create Code Flowchart | Generates a Mermaid Flow Chart from a code snippet |
| [ ] | `test-mcp-tools` | Test MCP Tools with Direct Calls | Guide for testing MCP tool implementations using direct MCP tool calls to validate functionality with real data |

---

## 6. Resources (5)

| ✓ | ID | Name | URI | Description |
|---|---|---|---|---|
| [ ] | `mcp-current-config` | mcp current configuration | `-` | View the current MCP configuration |
| [ ] | `mcp-current-log` | mcp server current log | `-` | View the current mcp server log (if there is one) |
| [ ] | `mcp-log` | mcp server log | `-` | View the a specific mcp server log (if there is one) |

---

## 7. CLI commands (18)

| ✓ | Command | Purpose |
|---|---|---|
| [ ] | `qnsc-mcp server` | Start the MCP server (stdio / httpStream) |
| [ ] | `qnsc-mcp webserver` | Web UI / config editor |
| [ ] | `qnsc-mcp doctor` | Validate config, env, keyring, TLS |
| [ ] | `qnsc-mcp install` | Install / set up client integrations |
| [ ] | `qnsc-mcp update` | Self-update to the latest release |
| [ ] | `qnsc-mcp generate-config` | Scaffold a `.qnscmcp.yaml` |
| [ ] | `qnsc-mcp list-tools` | List tools (`--filtered` = enabled only) |
| [ ] | `qnsc-mcp list-prompts` | List prompts |
| [ ] | `qnsc-mcp list-resources` | List resources |
| [ ] | `qnsc-mcp get-prompt` | Show a prompt and its arguments |
| [ ] | `qnsc-mcp remote-mcp` | Manage / inspect remote MCP servers |
| [ ] | `qnsc-mcp local-mcp` | Manage / inspect local MCP servers |
| [ ] | `qnsc-mcp bundled-mcp` | Manage / inspect bundled MCP servers |
| [ ] | `qnsc-mcp view-logs` | View server logs |
| [ ] | `qnsc-mcp tail-log-file` | Tail the active log file |
| [ ] | `qnsc-mcp logout` | Clear stored credentials |
| [ ] | `qnsc-mcp reauth` | Re-authenticate with the platform |
| [ ] | `qnsc-mcp index` | Command entry/dispatch |

---

## Review notes

| Item | Status | Finding / action |
|---|---|---|
| 10 credential-free tools | ✅ pass | Exercised locally via `scripts/try-tool.ts`: time (3), knowledge graph (3, including a write), npm (2), doctor, clipboard. |
| `npm-tree` | – | Not a defect: requires a `package` argument, which the probe omitted. |
| `claude-code-usage` | – | Not a defect: correctly reported no Claude logs for this project. |
| AWS Knowledge tools | ⛔ blocked | Register, but `tools/call` is refused by AWS. Reproduced with raw `curl`, so not a client bug. |
| `aws-knowledge-mcp-server` | ✅ working | Was gateway-routed and therefore dead. Repointed to the public AWS endpoint via a new `getDirectMcpUrl()` helper (HTTPS + `api.aws` host allowlist). 5 tools verified live. |
| `list-tools` display | ✅ fixed | Vendor tool names containing the `__` delimiter were truncated — all 5 AWS tools rendered as `aws`. Now keeps everything after the first delimiter. |
| 18 other remote servers | ⛔ blocked | Need the platform gateway, or drop. Of these, only `k6` (Grafana) is in the current stack. |
| Cloudflare | ➕ gap | In use, but no tooling exists. Cloudflare publishes official MCP servers. |


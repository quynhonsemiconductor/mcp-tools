# GitHub

## Description

The GitHub tool provides comprehensive access to QNSC's repositories on github.com. This tool enables interaction with repositories, issues, pull requests, commits, workflows, and other GitHub resources through GitHub's REST API.

## Prerequisites

- A GitHub account with access to the `quynhonsemiconductor` organization
- Permissions to the repositories you wish to access

## Secrets

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `GITHUB_TOKEN` | Personal Access Token for GitHub API authentication | 1. Navigate to https://github.com/settings/tokens<br>2. Click "Generate new token (classic)"<br>3. Give it a descriptive name (e.g., "MCP Tools Access")<br>4. Set expiration (recommend 90 days for security)<br>5. Select required scopes (see below)<br>6. Click "Generate token"<br>7. **Important:** Copy the token immediately - you won't see it again! |

### Required Token Scopes

For full functionality, select these scopes when creating your token:

**Repository Access:**
- `repo` - Full control of private repositories (includes all sub-scopes)
  - `repo:status` - Access commit status
  - `repo_deployment` - Access deployment status
  - `public_repo` - Access public repositories

**Organization Access:**
- `read:org` - Read org and team membership, read org projects

**Workflow Access:**
- `workflow` - Update GitHub Action workflows

**Projects Access:**
- `project` - Full control of Projects V2 (read + write)

**User Access:**
- `read:user` - Read all user profile data
- `user:email` - Access user email addresses (read-only)

## Troubleshooting

### Common Issues

**Issue: 401 Unauthorized**
- **Cause:** Invalid, expired, or missing GitHub token
- **Solution:** 
  1. Verify `GITHUB_TOKEN` environment variable is set
  2. Check if token has expired and regenerate if necessary
  3. Ensure token has correct scopes for the operation

## Additional Resources

- [quynhonsemiconductor on GitHub](https://github.com/quynhonsemiconductor)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [GitHub Token Scopes Reference](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)

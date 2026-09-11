# GitHub Wiki Tools Setup

Tools for accessing and reading GitHub wiki repositories.

## Prerequisites

- GitHub account with access to repositories
- Git installed on your system
- Network access to `github.com`

## Required Environment Variables

### `GITHUB_TOKEN`

A GitHub Personal Access Token (classic) with appropriate permissions.

**Steps to create:**

1. Navigate to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give your token a descriptive name (e.g., "QNSC MCP Wiki Access")
4. Select the following scopes:
   - ✅ `repo` - Full control of private repositories (required for wiki access)
5. Set an appropriate expiration date
6. Click **Generate token**
7. Copy the token immediately (you won't see it again!)

**Configuration:**

Add to your `.env` file:
```bash
GITHUB_TOKEN=ghp_your_token_here
```

Or set as environment variable:
```bash
export GITHUB_TOKEN=ghp_your_token_here
```

## How It Works

### Caching Strategy

Wiki repositories are cloned to `~/.qnscmcp/wikis/{org}/{repo}.wiki/` using shallow clones (--depth 1) for efficiency:

- **First access:** Clones the wiki repository
- **Subsequent access:** Fetches latest changes
- **Storage:** ~220KB per wiki (git database) + ~344KB (working files) = ~564KB total

### Supported Operations

1. **Get Wiki Page Content** - Read individual wiki pages
2. **List Wiki Pages** - Coming soon

## Usage Examples

### Get Wiki Page

```typescript
// Get the Home page
await getGithubWikiContent({
  org: 'Robby-Ranshous',
  repo: 'principle_notes',
  page: 'Home.md'
});

// Get a specific page
await getGithubWikiContent({
  org: 'YourOrg',
  repo: 'your-repo',
  page: 'Installation-Guide.md'
});
```

## Troubleshooting

### "Wiki page not found"

- Verify the page filename is correct (case-sensitive)
- Ensure the repository has a wiki enabled
- Check that the wiki has been initialized with at least one page
- Confirm your GitHub token has access to the repository

### "GITHUB_TOKEN is not set"

- Verify the environment variable is set correctly
- Restart your terminal/IDE after setting the variable
- Check `.env` file is in the correct location

### "Failed to clone repository"

- Verify you have git installed: `git --version`
- Check network connectivity to `github.com`
- Ensure your GitHub token hasn't expired
- Verify the repository exists and has a wiki

### "Permission denied"

- Your GitHub token may lack necessary permissions
- Regenerate token with `repo` scope
- Verify you have at least read access to the repository

## Cache Management

### Clear all wiki caches:
```bash
rm -rf ~/.qnscmcp/wikis
```

### Clear specific wiki:
```bash
rm -rf ~/.qnscmcp/wikis/{org}/{repo}.wiki
```

The cache will automatically regenerate on next access.

## Notes

- Wiki repositories use the `.wiki.git` suffix on GitHub
- Wikis are separate git repositories from the main code repository
- Page names in wikis use hyphens for spaces (e.g., "Getting-Started.md")
- All wikis use the `master` branch by default

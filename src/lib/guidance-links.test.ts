import { describe, expect, it } from 'bun:test';
import { DOCUMENTATION_URLS, GUIDANCE, SUPPORT } from './guidance-links';

describe('guidance-links', () => {
  describe('DOCUMENTATION_URLS', () => {
    it('should have valid GHE base URL structure', () => {
      const GHE_BASE = 'https://github.com/quynhonsemiconductor/mcp-tools';

      expect(DOCUMENTATION_URLS.REPOSITORY).toBe(GHE_BASE);
      expect(DOCUMENTATION_URLS.CONFIGURATION).toContain(GHE_BASE);
      expect(DOCUMENTATION_URLS.TROUBLESHOOTING).toContain(GHE_BASE);
      expect(DOCUMENTATION_URLS.GITHUB_ISSUES).toBe(`${GHE_BASE}/issues`);
      expect(DOCUMENTATION_URLS.RELEASES).toBe(`${GHE_BASE}/releases/latest`);
    });

    it('should have all required URL keys', () => {
      expect(DOCUMENTATION_URLS).toHaveProperty('REPOSITORY');
      expect(DOCUMENTATION_URLS).toHaveProperty('CONFIGURATION');
      expect(DOCUMENTATION_URLS).toHaveProperty('TROUBLESHOOTING');
      expect(DOCUMENTATION_URLS).toHaveProperty('GITHUB_ISSUES');
      expect(DOCUMENTATION_URLS).toHaveProperty('RELEASES');
    });

    it('should have valid URL format for all entries', () => {
      for (const [_key, url] of Object.entries(DOCUMENTATION_URLS)) {
        expect(url).toMatch(/^https?:\/\//);
      }
    });
  });

  describe('SUPPORT', () => {
    it('should point at reachable GitHub channels, not the upstream Slack', () => {
      // The previous channel was '#ai-mcp' on qnsc.slack.com, a workspace this org does
      // not own — its URL was a literal TODO placeholder, so error output sent people
      // nowhere. Both of these resolve on the repository itself.
      expect(SUPPORT.ISSUES).toBe('https://github.com/quynhonsemiconductor/mcp-tools/issues');
      expect(SUPPORT.DISCUSSIONS).toBe(
        'https://github.com/quynhonsemiconductor/mcp-tools/discussions',
      );
      expect(JSON.stringify(SUPPORT)).not.toContain('slack');
    });
  });

  describe('GUIDANCE', () => {
    it('should have short RESTART_IDE text for flexible composition', () => {
      expect(GUIDANCE.RESTART_IDE).toBe('Restart your IDE');
      // Verify it's short enough to allow appending context
      expect(GUIDANCE.RESTART_IDE.length).toBeLessThan(25);
    });

    it('should compose naturally with various suffixes', () => {
      // These are the actual usage patterns in server.ts
      const usages = [
        `${GUIDANCE.RESTART_IDE} to reload the MCP server`,
        `${GUIDANCE.RESTART_IDE} to reload with fixed/default config`,
        `${GUIDANCE.RESTART_IDE} after fixing your environment`,
        `${GUIDANCE.RESTART_IDE} after fixing the config`,
      ];

      for (const usage of usages) {
        // Should read as a grammatically correct sentence
        expect(usage).toMatch(/^Restart your IDE (to|after)/);
      }
    });
  });
});

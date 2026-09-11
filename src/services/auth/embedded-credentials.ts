/**
 * Embedded OAuth Credentials (Multi-Provider)
 *
 * This file contains placeholder values that are replaced during the build process
 * with actual credentials from CI/CD secrets, so a released binary can complete an OAuth
 * flow without each user registering their own app or pasting a token.
 *
 * This matters most for GitHub: with a client id embedded, a teammate signs in through
 * the browser on first use and their own token is stored in their keyring, instead of
 * everyone sharing one PAT. See src/tools/github/auth/.
 *
 * Build-time injection:
 * - We use bun --define to inject the obfuscation key and obfuscated credentials at build time
 *
 * Security model:
 * - Source code contains only placeholder strings (safe to commit)
 * - Actual credentials are injected during release builds from GitHub Actions secrets
 * - Credentials are XOR-obfuscated to prevent casual extraction from binaries
 * - Environment variables can still override embedded credentials if needed
 *
 * IMPORTANT - Credential Rotation:
 * If OAuth credentials need to be rotated (e.g., due to compromise):
 * 1. Generate new credentials in the provider's OAuth app dashboard
 * 2. Update the corresponding secrets in GitHub Actions (GITHUB_CLIENT_ID/SECRET)
 * 3. Create a new release to rebuild binaries with new credentials
 * 4. All users must update to the new binary version
 * 5. Old binaries will continue to use compromised credentials until updated
 *
 * This is an inherent limitation of embedded credentials - consider implementing
 * a credential validation endpoint if immediate revocation is required.
 *
 * Providers are looked up by name through getEmbeddedCredentials(provider), so any can be
 * added. Two are wired today: GitHub (client id + secret, read by
 * src/tools/github/auth/oauth-config.ts) and Entra (read by
 * src/services/auth/entra-id/config.ts). Slack was removed with the gateway-routed
 * servers, along with the three Slack-only wrappers that used to sit at the end of this
 * file — nothing called them.
 *
 * @internal This module is for internal use by oauth-config.ts and provider auth services
 */

import { logDebug } from '../../services/logger';

export type OAuthCredential = {
  clientId?: string;
  clientSecret?: string;
};

/**
 * Type definition for the embedded credential context injected at build time.
 */
export type EmbeddedCredentialContextType = {
  obfuscationKey?: string;
  oAuthCredentials?: {
    [provider: string]: OAuthCredential;
  };
  genericSecrets?: {
    [key: string]: string;
  };
};

/**
 * The embedded credential context injected at build time. During test runs, this
 * will be an empty object and is defined in the bunfig.toml.
 * @internal
 */
declare const EMBEDDED_CREDENTIAL_CONTEXT: EmbeddedCredentialContextType;

/**
 * Deobfuscate a XOR-encoded string using the embedded key
 * @param encoded - Base64-encoded XOR-obfuscated string
 * @returns The original plaintext string
 * @internal
 */
export function deobfuscate(encoded: string): string {
  // If it's a placeholder, return as-is
  if (!encoded) {
    return encoded;
  }
  const obfuscationKey = EMBEDDED_CREDENTIAL_CONTEXT?.obfuscationKey;
  if (!obfuscationKey) {
    return encoded;
  }

  try {
    const data = Buffer.from(encoded, 'base64');
    const key = Buffer.from(obfuscationKey, 'base64');
    const result = Buffer.alloc(data.length);

    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ key[i % key.length];
    }

    return result.toString('utf-8');
  } catch {
    // If deobfuscation fails, return original (may be plaintext in dev)
    // This can happen if the encoded string is malformed or key is invalid
    if (process.env.DEBUG) {
      logDebug('[embedded-credentials] Deobfuscation failed, returning original value');
    }
    return encoded;
  }
}

/**
 * Get embedded credentials for a provider.
 * @param provider - OAuth provider key (e.g., 'slack', 'github')
 * @returns Deobfuscated credentials or placeholders when not injected
 */
export function getEmbeddedCredentials(provider: string): OAuthCredential {
  const credentials = EMBEDDED_CREDENTIAL_CONTEXT?.oAuthCredentials;
  if (!credentials || !(provider in credentials)) {
    return {
      clientId: undefined,
      clientSecret: undefined,
    };
  }

  const spec = credentials[provider];
  return {
    clientId: spec.clientId ? deobfuscate(spec.clientId) : undefined,
    clientSecret: spec.clientSecret ? deobfuscate(spec.clientSecret) : undefined,
  };
}

export function hasEmbeddedGenericSecret(key: string): boolean {
  const secrets = EMBEDDED_CREDENTIAL_CONTEXT?.genericSecrets;
  return !!secrets && key in secrets;
}

export function getEmbeddedGenericSecret(key: string): string | undefined {
  const secrets = EMBEDDED_CREDENTIAL_CONTEXT?.genericSecrets;
  if (!secrets || !(key in secrets)) {
    return undefined;
  }
  return deobfuscate(secrets[key]);
}

/**
 * Check if embedded credentials exist for a provider.
 * @param provider - OAuth provider key
 * @returns True if placeholders have been replaced with actual values
 */
export function hasEmbeddedCredentials(provider: string): boolean {
  const creds = getEmbeddedCredentials(provider);
  const idOk = !!creds.clientId;
  const secret = creds.clientSecret;
  const secretOk = !!secret;
  return idOk && secretOk;
}


/**
 * Generic token store for OAuth tokens using OS-level credential storage.
 *
 * Uses @napi-rs/keyring to store tokens in the operating system's native credential manager:
 * - macOS: Keychain
 * - Windows: Credential Vault
 * - Linux: Secret Service (libsecret)
 *
 * This approach delegates encryption to the OS rather than implementing custom crypto,
 * providing better security guarantees and following industry best practices.
 */

import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { logDebug, logError, logInfo, logWarn } from '../logger';
import {
  getKeyringEntry,
  getRecoveryInstructions,
  isKeyringAvailable,
  isKeyringCorrupted,
  resetKeyringLoaderForTesting,
} from './keyring-loader';
import type { StoredToken } from './types';

/**
 * Special key used to store the index of all user IDs with stored tokens.
 * This allows enumeration of tokens without knowing user IDs in advance.
 */
const TOKEN_INDEX_KEY = '__token_index__';

/**
/**
 * Maximum characters per credential entry.
 *
 * Windows Credential Manager limits passwords to 2560 UTF-16 code units.
 * We use 1200 characters per chunk to stay safely within this limit,
 * matching the same strategy used in remote-mcp-oauth-provider.ts.
 */
const MAX_CHUNK_SIZE = 1200;

/**
 * Maximum number of retry attempts for keyring operations before considering it corrupted.
 */
const MAX_KEYRING_RETRIES = 2;

/**
 * Metadata stored for a token that was split across multiple credential entries
 * because it exceeded {@link MAX_CHUNK_SIZE}.
 */
interface ChunkedTokenMeta {
  chunked?: boolean;
  chunkCount?: number;
  totalLength?: number;
}

/**
 * Format an unknown caught value as a human-readable string for logging.
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Error indicating keyring corruption that requires auto-recovery.
 */
export class KeyringCorruptionError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'KeyringCorruptionError';
  }
}

/**
 * Generic token store for OAuth tokens using OS credential storage.
 */
export class TokenStore {
  private tokens: Map<string, StoredToken> = new Map();
  private initialized = false;
  private serviceName: string;
  private keyringFailureCount = 0;
  private lastKeyringError: Error | null = null;
  private keyringAvailable: boolean | null = null;

  /**
   * Promise-based lock to ensure initialization runs only once.
   *
   * If multiple callers invoke initialize() concurrently before it completes,
   * they all receive the same promise rather than each triggering separate
   * credential reads. This is a standard "lazy singleton" async pattern.
   */
  private initPromise: Promise<void> | null = null;

  /**
   * Create a new TokenStore.
   *
   * @param serviceName - Service name for credential storage (e.g., "qnsc-mcp-github")
   */
  constructor(serviceName: string) {
    // Defense-in-depth: reject service names with shell-unsafe characters
    // since serviceName is interpolated into execSync commands for macOS recovery
    if (!/^[a-zA-Z0-9._-]+$/.test(serviceName)) {
      throw new Error(`Invalid service name: "${serviceName}" contains disallowed characters`);
    }
    this.serviceName = serviceName;
  }

  /**
   * Initialize the token store by loading tokens from OS credential storage.
   * Uses a promise-based lock to prevent concurrent initialization.
   *
   * @param options - Optional settings
   * @param options.readOnly - If true, skip auto-recovery on corruption (for diagnostics)
   */
  async initialize(options?: { readOnly?: boolean }): Promise<void> {
    if (this.initialized) return;

    // If initialization is already in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    const readOnly = options?.readOnly ?? false;

    // Create and store the initialization promise
    this.initPromise = (async () => {
      try {
        await this.loadTokens(readOnly);
        this.initialized = true;
        logDebug(`${this.serviceName} token store initialized`);
      } catch (error) {
        if (error instanceof KeyringCorruptionError) {
          // Corruption detected - log detailed error but continue with empty store
          logError(
            `Keyring corruption detected during ${this.serviceName} initialization.\n` +
              `Auto-recovery was attempted. ${error.message}\n` +
              `Continuing with empty token store - you will need to re-authenticate.`,
          );
        } else {
          logError(`Failed to initialize token store for ${this.serviceName}: ${formatError(error)}`);
        }
        this.tokens = new Map();
        this.initialized = true;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Store a token for a user in OS credential storage.
   *
   * On Windows, if the serialized token exceeds {@link MAX_CHUNK_SIZE} characters,
   * the data is split across multiple credential entries to stay within the
   * Windows Credential Manager limit (2560 UTF-16 code units).
   *
   * @param userId - The user ID to associate with this token
   * @param tokenData - The token data to store
   */
  async storeToken(userId: string, tokenData: StoredToken): Promise<void> {
    await this.initialize();

    // Check if keyring is available
    if (!this.checkKeyringAvailability()) {
      logWarn(`Keyring not available for ${this.serviceName}, token will not be persisted`);
      // Store in memory only
      this.tokens.set(userId, tokenData);
      return;
    }

    try {
      const EntryClass = getKeyringEntry();
      const tokenString = JSON.stringify(tokenData);

      if (tokenString.length > MAX_CHUNK_SIZE && process.platform === 'win32') {
        // Split into chunks
        const chunks: string[] = [];
        for (let i = 0; i < tokenString.length; i += MAX_CHUNK_SIZE) {
          chunks.push(tokenString.slice(i, i + MAX_CHUNK_SIZE));
        }

        // Clean up stale chunks from a previous store that had more chunks
        this.cleanupStaleChunks(EntryClass, userId, chunks.length);

        // Store metadata in the main entry
        const metadata = {
          chunked: true,
          chunkCount: chunks.length,
          totalLength: tokenString.length,
        };
        const entry = new EntryClass(this.serviceName, userId);
        entry.setPassword(JSON.stringify(metadata));

        // Store each chunk in a separate credential entry
        for (let i = 0; i < chunks.length; i++) {
          const chunkEntry = new EntryClass(this.serviceName, `${userId}-chunk-${i}`);
          chunkEntry.setPassword(chunks[i]);
        }

        logDebug(`Stored ${this.serviceName} token for user ${userId} in ${chunks.length} chunks`);
      } else {
        // Store directly — fits in a single credential entry
        const entry = new EntryClass(this.serviceName, userId);

        await this.executeWithRetry(() => entry.setPassword(tokenString), `storeToken:${userId}`);
      }

      this.tokens.set(userId, tokenData);

      // Update the token index
      await this.updateTokenIndex();

      // Re-set token if recovery during index update cleared the map
      if (!this.tokens.has(userId)) {
        this.tokens.set(userId, tokenData);
      }

      logInfo(`Stored ${this.serviceName} token for user ${userId}`);
    } catch (error) {
      if (error instanceof KeyringCorruptionError) {
        logError(
          `Keyring corruption prevented storing token: ${error.message}\n` +
            `Token stored in memory only (will be lost on restart)`,
        );
        // Store in memory as fallback
        this.tokens.set(userId, tokenData);
        return;
      }
      logError(`Failed to store token for user ${userId} in ${this.serviceName}: ${formatError(error)}`);
      throw error;
    }
  }

  /**
   * Get a token, optionally filtered by user ID.
   *
   * @param userId - Optional user ID to retrieve token for. If not provided, returns first available token.
   * @returns The stored token or null if not found
   */
  async getToken(userId?: string): Promise<StoredToken | null> {
    await this.initialize();

    if (userId) {
      return this.tokens.get(userId) || null;
    }

    // Return first available token
    const first = this.tokens.values().next();
    return first.done ? null : first.value;
  }

  /**
   * Get access token string for API calls.
   *
   * Returns null if the token is expired.
   *
   * @param userId - Optional user ID to retrieve token for
   * @returns The access token string or null if not found or expired
   *
   * @remarks
   * Proactive token refresh is handled at a higher level in TokenManager, which
   * coordinates between the token store and OAuth handler to refresh tokens
   * before they expire.
   */
  async getAccessToken(userId?: string): Promise<string | null> {
    const token = await this.getToken(userId);
    if (!token) return null;

    // Check expiration
    if (token.expiresAt && Date.now() > token.expiresAt) {
      logDebug(`${this.serviceName} token expired`);
      return null;
    }

    return token.accessToken;
  }

  /**
   * Remove a token for a specific user from OS credential storage.
   *
   * Also removes any associated chunk entries if the token was stored in chunked format.
   *
   * @param userId - The user ID whose token should be removed
   * @returns True if a token was removed, false if no token existed
   */
  async removeToken(userId: string): Promise<boolean> {
    await this.initialize();

    // Check if keyring is available
    if (!this.checkKeyringAvailability()) {
      // Just remove from memory
      const existed = this.tokens.has(userId);
      this.tokens.delete(userId);
      return existed;
    }

    try {
      const EntryClass = getKeyringEntry();
      const entry = new EntryClass(this.serviceName, userId);

      // Check if the stored data is chunked metadata so we can clean up chunk entries
      try {
        const storedData = entry.getPassword();
        if (storedData) {
          const parsed = JSON.parse(storedData) as ChunkedTokenMeta;
          if (parsed?.chunked === true) {
            const chunkCount = parsed.chunkCount ?? 0;
            for (let i = 0; i < chunkCount; i++) {
              try {
                const chunkEntry = new EntryClass(this.serviceName, `${userId}-chunk-${i}`);
                chunkEntry.deletePassword();
              } catch {
                /* ignore individual chunk cleanup errors */
              }
            }
          }
        }
      } catch {
        /* ignore parse errors during cleanup */
      }

      const result = await this.executeWithRetry(() => {
        entry.deletePassword();
        return true as const;
      }, `removeToken:${userId}`);

      if (result === null) {
        logWarn(`Failed to remove ${this.serviceName} token for ${userId} from keyring`);
        return false;
      }

      this.tokens.delete(userId);
      await this.updateTokenIndex();
      logInfo(`Removed ${this.serviceName} token for user ${userId}`);
      return true;
    } catch (error) {
      if (error instanceof KeyringCorruptionError) {
        // Just remove from memory on corruption
        logWarn(`Keyring corruption during token removal, removed from memory only`);
        this.tokens.delete(userId);
        return true;
      }
      // @napi-rs/keyring throws if credential doesn't exist
      const message = formatError(error);
      if (message.includes('not found') || message.includes('No matching entry')) {
        this.tokens.delete(userId);
        return false;
      }
      logError(`Failed to remove token for user ${userId} from ${this.serviceName}: ${message}`);
      return false;
    }
  }

  /**
   * Clear all tokens from OS credential storage.
   */
  async clearAll(): Promise<void> {
    await this.initialize();
    try {
      const EntryClass = getKeyringEntry();
      // Delete all stored tokens (including any chunk entries)
      for (const userId of this.tokens.keys()) {
        try {
          const entry = new EntryClass(this.serviceName, userId);
          // Clean up chunks if the token was stored in chunked format
          try {
            const storedData = entry.getPassword();
            if (storedData) {
              const parsed = JSON.parse(storedData) as ChunkedTokenMeta;
              if (parsed?.chunked === true) {
                const chunkCount = parsed.chunkCount ?? 0;
                for (let i = 0; i < chunkCount; i++) {
                  try {
                    const chunkEntry = new EntryClass(this.serviceName, `${userId}-chunk-${i}`);
                    chunkEntry.deletePassword();
                  } catch {
                    /* ignore */
                  }
                }
              }
            }
          } catch {
            /* ignore parse errors */
          }
          entry.deletePassword();
        } catch {
          // Ignore errors for individual deletions
        }
      }
      // Delete the token index
      try {
        const indexEntry = new EntryClass(this.serviceName, TOKEN_INDEX_KEY);
        indexEntry.deletePassword();
      } catch {
        // Ignore if index doesn't exist
      }

      this.tokens.clear();
      logInfo(`Cleared all ${this.serviceName} tokens`);
    } catch (error) {
      logError(`Failed to clear all tokens for ${this.serviceName}: ${formatError(error)}`);
      throw error;
    }
  }

  /**
   * Check if any tokens exist in the store.
   *
   * @returns True if at least one token is stored
   */
  async hasTokens(): Promise<boolean> {
    await this.initialize();
    return this.tokens.size > 0;
  }

  /**
   * Check if keyring is available and healthy.
   * Caches the result to avoid repeated checks.
   *
   * @returns True if keyring is available and working
   */
  private checkKeyringAvailability(): boolean {
    if (this.keyringAvailable !== null) {
      return this.keyringAvailable;
    }
    this.keyringAvailable = isKeyringAvailable();
    return this.keyringAvailable;
  }

  // Corruption detection delegated to shared isKeyringCorrupted() in keyring-loader.ts

  /**
   * Attempt to recover from keyring corruption by deleting all entries for this service.
   * This removes stale/corrupted credentials that may be causing password prompt loops.
   *
   * @returns True if recovery was attempted (doesn't guarantee success)
   */
  private attemptKeyringRecovery(): boolean {
    try {
      logWarn(`Attempting to recover from ${this.serviceName} keyring corruption...`);
      const EntryClass = getKeyringEntry();

      // Try to delete all known user tokens via keyring API
      for (const userId of this.tokens.keys()) {
        try {
          const entry = new EntryClass(this.serviceName, userId);
          entry.deletePassword();
          logInfo(`Deleted corrupted ${this.serviceName} entry for user ${userId}`);
        } catch (deleteError) {
          logDebug(`Failed to delete entry for ${userId}: ${formatError(deleteError)}`);
          // Continue trying other entries
        }
      }

      // Try to delete the index
      try {
        const indexEntry = new EntryClass(this.serviceName, TOKEN_INDEX_KEY);
        indexEntry.deletePassword();
        logInfo(`Deleted corrupted ${this.serviceName} index entry`);
      } catch (deleteError) {
        logDebug(`Failed to delete index entry: ${formatError(deleteError)}`);
      }

      // On macOS, the keyring API deletions above may have been no-ops if this.tokens
      // was empty (e.g., corruption on first access after upgrade, before any tokens loaded).
      // Fall back to the `security` CLI which can delete by service name without knowing
      // the account/userId, matching exactly what the manual recovery instructions suggest.
      if (process.platform === 'darwin') {
        this.attemptMacOSKeyringRecovery();
      }

      // Clear in-memory cache and reset availability so it's rechecked
      this.tokens.clear();
      this.keyringAvailable = null;

      logInfo(`${this.serviceName} keyring recovery completed. You may need to re-authenticate.`);
      return true;
    } catch (error) {
      logError(`Failed to recover ${this.serviceName} keyring: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * macOS-specific recovery: use the `security` CLI to delete all keychain entries
   * matching this service name. This works even when we don't know the account/userId,
   * which is the case when corruption prevents loading the token index on first access.
   *
   * Runs in a loop because `security delete-generic-password -s` deletes one matching
   * entry at a time and exits 0; it returns non-zero when no more matches exist.
   */
  private attemptMacOSKeyringRecovery(): void {
    const home = process.env.HOME || homedir();

    const keychainPath = `${home}/Library/Keychains/login.keychain-db`;
    let deleted = 0;
    const maxDeletions = 20;

    // Each invocation deletes one matching entry; loop until none remain
    for (let i = 0; i < maxDeletions; i++) {
      try {
        execFileSync(
          'security',
          ['delete-generic-password', '-s', this.serviceName, keychainPath],
          { stdio: 'pipe', timeout: 5000 },
        );
        deleted++;
      } catch {
        // Non-zero exit = no more matching entries
        break;
      }
    }

    if (deleted >= maxDeletions) {
      logWarn(
        `Reached maximum deletion limit (${maxDeletions}) for ${this.serviceName} keychain entries. ` +
          `Some entries may remain — consider opening Keychain Access to inspect manually.`,
      );
    } else if (deleted > 0) {
      logInfo(`Deleted ${deleted} stale macOS keychain entry(s) for ${this.serviceName}`);
    }
  }

  /**
   * Execute a keyring operation with retry logic and corruption detection.
   * If corruption is detected after retries, attempts auto-recovery.
   *
   * @param operation - The keyring operation to execute
   * @param operationName - Name of the operation for logging
   * @param options - Optional settings
   * @param options.skipRecovery - If true, return null on corruption instead of attempting recovery
   * @returns The operation result, or null if operation failed
   * @throws KeyringCorruptionError if corruption is detected and recovery fails (unless skipRecovery)
   */
  private async executeWithRetry<T>(
    operation: () => T,
    operationName: string,
    options?: { skipRecovery?: boolean },
  ): Promise<T | null> {
    // Check if keyring is available at all
    if (!this.checkKeyringAvailability()) {
      logDebug(`Keyring not available, skipping ${operationName}`);
      return null;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_KEYRING_RETRIES; attempt++) {
      try {
        const result = operation();
        // Success - reset failure count
        this.keyringFailureCount = 0;
        this.lastKeyringError = null;
        return result;
      } catch (error) {
        lastError = error;
        this.keyringFailureCount++;
        this.lastKeyringError = error instanceof Error ? error : new Error(String(error));

        logDebug(
          `${operationName} attempt ${attempt + 1}/${MAX_KEYRING_RETRIES} failed: ${formatError(error)}`,
        );

        // Check if this looks like corruption
        if (isKeyringCorrupted(error)) {
          logWarn(`Detected potential keyring corruption during ${operationName}`);
          break; // Don't retry corruption errors
        }

        // If not corruption, retry
        if (attempt < MAX_KEYRING_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Brief delay before retry
        }
      }
    }

    // Only trigger destructive recovery for actual corruption signals
    if (isKeyringCorrupted(lastError)) {
      if (options?.skipRecovery) {
        // In read-only/diagnostic mode, don't attempt destructive recovery
        logDebug(
          `Corruption detected during ${operationName} but recovery skipped (read-only mode)`,
        );
        return null;
      }

      // Attempt recovery
      const recovered = this.attemptKeyringRecovery();

      if (!recovered) {
        throw new KeyringCorruptionError(
          `${this.serviceName} keyring is corrupted and auto-recovery failed. ` +
            `Please manually delete keyring entries:\n` +
            this.getManualRecoveryInstructions(),
          lastError,
        );
      }

      // Recovery succeeded - reset state
      this.keyringFailureCount = 0;
      this.lastKeyringError = null;
      this.keyringAvailable = null; // Re-evaluate on next access
      return null; // Operation didn't complete, but recovery did
    }

    // Failed but not corrupted - just log and return null
    logWarn(`${operationName} failed after retries: ${formatError(lastError)}`);
    return null;
  }

  /**
   * Get platform-specific instructions for manually recovering from keyring corruption.
   *
   * @returns Instructions string with commands to run
   */
  private getManualRecoveryInstructions(): string {
    return getRecoveryInstructions(this.serviceName);
  }

  /**
   * Load tokens from OS credential storage.
   * Uses a token index to track which user IDs have stored tokens.
   * Includes retry logic and auto-recovery for corrupted keyring entries.
   *
   * @param readOnly - If true, skip auto-recovery on corruption (for diagnostics)
   */
  private async loadTokens(readOnly = false): Promise<void> {
    this.tokens = new Map();

    // Check if keyring is available
    if (!this.checkKeyringAvailability()) {
      logDebug(`Keyring not available for ${this.serviceName}, skipping token load`);
      return;
    }

    try {
      const EntryClass = getKeyringEntry();
      // First, try to get the token index which lists all stored user IDs
      const indexEntry = new EntryClass(this.serviceName, TOKEN_INDEX_KEY);
      let userIds: string[] = [];

      const retryOpts = readOnly ? { skipRecovery: true } : undefined;

      try {
        const indexData = await this.executeWithRetry(
          () => indexEntry.getPassword(),
          'loadTokenIndex',
          retryOpts,
        );
        if (indexData) {
          try {
            userIds = JSON.parse(indexData) as string[];
          } catch (parseError) {
            logWarn(
              `Corrupted token index for ${this.serviceName}, starting fresh: ${formatError(parseError)}`,
            );
            return;
          }
        }
      } catch (error) {
        if (error instanceof KeyringCorruptionError) {
          // Corruption detected and recovery failed
          throw error;
        }
        // No index exists yet - this is fine for first run
        logDebug(`No token index found for ${this.serviceName}, starting fresh`);
        return;
      }

      // Load each token by user ID
      for (const userId of userIds) {
        try {
          const entry = new EntryClass(this.serviceName, userId);
          const password = await this.executeWithRetry(
            () => entry.getPassword(),
            `loadToken:${userId}`,
            retryOpts,
          );
          if (password) {
            const parsed = JSON.parse(password) as ChunkedTokenMeta | StoredToken;

            if (
              parsed &&
              typeof parsed === 'object' &&
              (parsed as ChunkedTokenMeta).chunked === true
            ) {
              // Reconstruct from chunks
              const chunkCount = (parsed as ChunkedTokenMeta).chunkCount ?? 0;
              const chunks: string[] = new Array<string>(chunkCount);

              for (let i = 0; i < chunkCount; i++) {
                const chunkEntry = new EntryClass(this.serviceName, `${userId}-chunk-${i}`);
                const chunk = chunkEntry.getPassword();
                if (!chunk) {
                  logWarn(`Missing chunk ${i} for ${this.serviceName} user ${userId}, skipping`);
                  break;
                }
                chunks[i] = chunk;
              }

              if (chunks.every(Boolean)) {
                const reconstructed = chunks.join('');
                const tokenData = JSON.parse(reconstructed) as StoredToken;
                this.tokens.set(userId, tokenData);
                logDebug(
                  `Loaded ${this.serviceName} token from ${chunkCount} chunks for user ${userId}`,
                );
              }
            } else {
              // Regular (non-chunked) token
              this.tokens.set(userId, parsed as StoredToken);
            }
          }
        } catch (error) {
          if (error instanceof KeyringCorruptionError) {
            // Corruption for a specific user - log but continue
            logWarn(`Keyring corruption detected for user ${userId}, skipped: ${error.message}`);
          } else {
            logWarn(`Failed to load token for user ${userId} from ${this.serviceName}, skipping`);
          }
        }
      }

      logDebug(`Loaded ${this.tokens.size} ${this.serviceName} token(s)`);
    } catch (error) {
      if (error instanceof KeyringCorruptionError) {
        // Re-throw corruption errors so they can be handled by callers
        throw error;
      }
      logWarn(
        `Failed to load tokens from credential store for ${this.serviceName}: ${formatError(error)}`,
      );
      this.tokens = new Map();
    }
  }

  /**
   * Update the token index in credential storage.
   * This allows us to enumerate tokens without needing to know user IDs.
   */
  private async updateTokenIndex(): Promise<void> {
    // Check if keyring is available
    if (!this.checkKeyringAvailability()) {
      return;
    }

    try {
      const userIds = Array.from(this.tokens.keys());
      const EntryClass = getKeyringEntry();
      const indexEntry = new EntryClass(this.serviceName, TOKEN_INDEX_KEY);

      await this.executeWithRetry(
        () => indexEntry.setPassword(JSON.stringify(userIds)),
        'updateTokenIndex',
      );
    } catch (error) {
      if (error instanceof KeyringCorruptionError) {
        logWarn(`Keyring corruption prevented index update: ${error.message}`);
        return;
      }
      // Non-critical - log but don't fail
      logDebug(`Failed to update token index: ${formatError(error)}`);
    }
  }

  /**
   * Get keyring health status for diagnostic purposes.
   * Used by the doctor command to check credential storage health.
   *
   * @returns Health status object
   */
  async getKeyringHealth(): Promise<{
    available: boolean;
    failureCount: number;
    lastError: string | null;
    recommendations: string[];
  }> {
    // Preserves the async interface (relied on by callers such as the keyring-health
    // validation check) even though the current implementation is fully synchronous.
    await Promise.resolve();
    const recommendations: string[] = [];
    const available = this.checkKeyringAvailability();

    if (!available) {
      recommendations.push(
        'Keyring is not available on this system. Tokens will only be stored in memory.',
      );
      recommendations.push(
        'Consider setting tokens via environment variables for persistent authentication.',
      );
    } else if (this.keyringFailureCount > 0) {
      recommendations.push(
        `Keyring has experienced ${this.keyringFailureCount} failure(s). This may indicate corruption.`,
      );
      if (this.lastKeyringError) {
        recommendations.push(`Last error: ${this.lastKeyringError.message}`);
      }
      recommendations.push(
        'If you experience repeated authentication issues, try the manual recovery instructions above.',
      );
    }

    return {
      available,
      failureCount: this.keyringFailureCount,
      lastError: this.lastKeyringError?.message || null,
      recommendations,
    };
  }

  /**
   * Remove stale chunk entries left over from a previous store
   * if the old chunk count was higher than the new one.
   */
  private cleanupStaleChunks(
    EntryClass: ReturnType<typeof getKeyringEntry>,
    userId: string,
    newChunkCount: number,
  ): void {
    try {
      const entry = new EntryClass(this.serviceName, userId);
      const existingData = entry.getPassword();
      if (existingData) {
        const meta = JSON.parse(existingData) as ChunkedTokenMeta;
        const existingChunkCount = meta.chunkCount ?? 0;
        if (meta?.chunked === true && existingChunkCount > newChunkCount) {
          for (let i = newChunkCount; i < existingChunkCount; i++) {
            try {
              const stale = new EntryClass(this.serviceName, `${userId}-chunk-${i}`);
              stale.deletePassword();
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Reset helper for testing purposes.
 * @internal Should only be used in test files
 */
export function resetTokenStoreForTesting(): void {
  // Also reset the cached Entry class so mock gets re-evaluated
  resetKeyringLoaderForTesting();
}

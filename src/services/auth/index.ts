/**
 * Shared OAuth authentication services.
 *
 * This module provides reusable OAuth infrastructure for multiple providers.
 * It includes:
 * - Generic token storage using OS keyring
 * - OAuth 2.1 flow with PKCE support
 * - Token lifecycle management with proactive refresh
 * - Provider-agnostic interfaces for easy extension
 * - Embedded credentials system for build-time credential injection
 */

export * from './types';
export * from './token-store';
export * from './oauth-handler';
export * from './token-manager';
export * from './oauth-config';
export * from './keyring-loader';
export * from './embedded-credentials';

/**
 * Entra ID SSO authentication module.
 *
 * Provides browser-based Entra ID login using Authorization Code + PKCE flow,
 * extending the shared OAuth infrastructure in src/services/auth/.
 */

export * from './config';
export {
  EntraIdOAuthHandler,
  getEntraIdOAuthHandler,
  resetEntraIdOAuthHandlerForTesting,
} from './oauth-handler';
export * from './oidc-discovery';
export {
  getEntraIdTokenManager,
  reauthenticate,
  resetEntraIdTokenManagerForTesting,
} from './token-manager';
export * from './types';

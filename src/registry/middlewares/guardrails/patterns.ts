export type SecretPattern = {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  minEntropy?: number;
  replacement: string;
};

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  {
    id: '1password-service-account-token',
    name: '1Password Service Account Token',
    description:
      'Uncovered a possible 1Password service account token, potentially compromising access to secrets in vaults.',
    pattern: /ops_eyJ[a-zA-Z0-9+/]{250,}={0,3}/,
    minEntropy: 4,
    replacement: '[REDACTED-1PASSWORD-TOKEN]',
  },
  {
    id: '1password-secret-key',
    name: '1Password secret key',
    description:
      'Uncovered a possible 1Password secret key, potentially compromising access to secrets in vaults.',
    pattern:
      /\bA3-[A-Z0-9]{6}-(?:[A-Z0-9]{11}|[A-Z0-9]{6}-[A-Z0-9]{5})-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/,
    minEntropy: 3.8,
    replacement: '[REDACTED-1PASSWORD-KEY]',
  },
  {
    id: 'aws-access-token',
    name: 'AWS Access Token',
    description:
      'Identified a pattern that may indicate AWS credentials, risking unauthorized cloud resource access and data breaches on AWS platforms.',
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16})\b/,
    minEntropy: 3,
    replacement: '[REDACTED-AWS-TOKEN]',
  },
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Key',
    description:
      'Identified a pattern that may indicate AWS credentials, risking unauthorized cloud resource access and data breaches on AWS platforms.',
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16})\b/,
    minEntropy: 3,
    replacement: '[REDACTED-AWS-SECRET-KEY]',
  },
  {
    id: 'aws-session-token',
    name: 'AWS Session Token',
    description:
      'Identified a pattern that may indicate AWS credentials, risking unauthorized cloud resource access and data breaches on AWS platforms.',
    // Context-aware pattern requiring semantic context (variable name/assignment) to reduce false positives
    // Matches patterns like: AWS_SESSION_TOKEN="...", aws_session_token: "...", etc.
    // This approach dramatically reduces false positives on legitimate base64 content while still catching
    // real session tokens in configuration files. Pattern inspired by detect-secrets (Yelp).
    pattern: /(aws.{0,20}session.{0,20}token.{0,20})['"`]?\s*[:=]\s*['"`]?([A-Za-z0-9/+=]{200,})/i,
    minEntropy: 3.5,
    replacement: '[REDACTED-AWS-SESSION-TOKEN]',
  },
  {
    id: 'azure-ad-client-secret',
    name: 'Azure AD Client Secret',
    description:
      'Identified a pattern that may indicate Azure AD client secrets, risking unauthorized access to Azure resources and data breaches on Azure platforms.',
    pattern:
      /(?:^|[\\'"\x60\s>=:(,)])([a-zA-Z0-9_~.]{3}\dQ~[a-zA-Z0-9_~.-]{31,34})(?:$|[\\'"\x60\s<),])/,
    minEntropy: 3,
    replacement: '[REDACTED-AZURE-CLIENT-SECRET]',
  },
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    description:
      'Uncovered a GitHub Personal Access Token, potentially leading to unauthorized repository access and sensitive content exposure.',
    pattern: /ghp_[0-9a-zA-Z]{36}/,
    minEntropy: 3,
    replacement: '[REDACTED-GITHUB-PAT]',
  },
  {
    id: 'github-fine-grained-pat',
    name: 'GitHub Fine-Grained Personal Access Token',
    description:
      'Found a GitHub Fine-Grained Personal Access Token, risking unauthorized repository access and code manipulation.',
    pattern: /github_pat_\w{82}/,
    minEntropy: 3,
    replacement: '[REDACTED-GITHUB-FINE-GRAINED-PAT]',
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth Access Token',
    description:
      'Discovered a GitHub OAuth Access Token, posing a risk of compromised GitHub account integrations and data leaks.',
    pattern: /gho_[0-9a-zA-Z]{36}/,
    minEntropy: 3,
    replacement: '[REDACTED-GITHUB-OAUTH]',
  },
  {
    id: 'github-app-token',
    name: 'GitHub App Token',
    description:
      'Identified a GitHub App Token, which may compromise GitHub application integrations and source code security.',
    pattern: /(?:ghu|ghs)_[0-9a-zA-Z]{36}/,
    minEntropy: 3,
    replacement: '[REDACTED-GITHUB-APP-TOKEN]',
  },
  {
    id: 'github-refresh-token',
    name: 'GitHub Refresh Token',
    description:
      'Detected a GitHub Refresh Token, which could allow prolonged unauthorized access to GitHub services.',
    pattern: /ghr_[0-9a-zA-Z]{36}/,
    minEntropy: 3,
    replacement: '[REDACTED-GITHUB-REFRESH-TOKEN]',
  },
  {
    id: 'jwt-token',
    name: 'JWT Token',
    description:
      'Detected a JSON Web Token (JWT), which may contain sensitive authentication or session data.',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    minEntropy: 3,
    replacement: '[REDACTED-JWT-TOKEN]',
  },
  {
    id: 'slack-bot-token',
    name: 'Slack Bot Token',
    description:
      'Discovered a Slack Bot Token, which could allow unauthorized access to Slack workspaces and channels.',
    pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/,
    minEntropy: 3,
    replacement: '[REDACTED-SLACK-BOT-TOKEN]',
  },
  {
    id: 'slack-user-token',
    name: 'Slack User Token',
    description:
      'Found a Slack User Token, which could allow impersonation of users in Slack workspaces.',
    pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{32}/,
    minEntropy: 3,
    replacement: '[REDACTED-SLACK-USER-TOKEN]',
  },
  {
    id: 'slack-webhook',
    name: 'Slack Webhook URL',
    description:
      'Identified a Slack Webhook URL, which could allow posting messages to Slack channels.',
    pattern:
      /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8,10}\/B[a-zA-Z0-9_]{8,10}\/[a-zA-Z0-9_]{24}/,
    minEntropy: 3,
    replacement: '[REDACTED-SLACK-WEBHOOK]',
  },
  {
    id: 'google-api-key',
    name: 'Google API Key',
    description:
      'Detected a Google API Key, which could allow unauthorized access to Google services and APIs.',
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    minEntropy: 3,
    replacement: '[REDACTED-GOOGLE-API-KEY]',
  },
  {
    id: 'npm-token',
    name: 'NPM Token',
    description:
      'Found an NPM access token, which could allow unauthorized publishing of packages to the NPM registry.',
    pattern: /npm_[a-zA-Z0-9]{36}/,
    minEntropy: 3,
    replacement: '[REDACTED-NPM-TOKEN]',
  },
  {
    id: 'mongodb-connection-string',
    name: 'MongoDB Connection String',
    description:
      'Identified a MongoDB connection string with credentials, risking database access and data exposure.',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+(?:\/[^?]+)?/,
    minEntropy: 3,
    replacement: '[REDACTED-MONGODB-CONNECTION]',
  },
  {
    id: 'mysql-connection-string',
    name: 'MySQL Connection String',
    description:
      'Detected a MySQL connection string with credentials, risking database access and data exposure.',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+(?:\/[^?]+)?/,
    minEntropy: 3,
    replacement: '[REDACTED-MYSQL-CONNECTION]',
  },
  {
    id: 'postgres-connection-string',
    name: 'PostgreSQL Connection String',
    description:
      'Found a PostgreSQL connection string with credentials, risking database access and data exposure.',
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+(?:\/[^?]+)?/,
    minEntropy: 3,
    replacement: '[REDACTED-POSTGRES-CONNECTION]',
  },
  {
    id: 'pypi-token',
    name: 'PyPI API Token',
    description:
      'Discovered a PyPI API token, which could allow unauthorized publishing of packages to the Python Package Index.',
    pattern: /pypi-[A-Za-z0-9_]{50,}/,
    minEntropy: 3,
    replacement: '[REDACTED-PYPI-TOKEN]',
  },
  {
    id: 'cargo-token',
    name: 'Cargo Registry Token',
    description:
      'Detected a Cargo registry token, which could allow unauthorized publishing of packages to the Rust crates registry.',
    pattern: /cargo[_-]token[_-][A-Za-z0-9_]{20,}/,
    minEntropy: 3,
    replacement: '[REDACTED-CARGO-TOKEN]',
  },
  {
    id: 'nuget-api-key',
    name: 'NuGet API Key',
    description:
      'Found a NuGet API key, which could allow unauthorized publishing of packages to the NuGet registry.',
    pattern: /nuget[_-]api[_-]key[_-][A-Za-z0-9_\\-]{40,}/,
    minEntropy: 3,
    replacement: '[REDACTED-NUGET-API-KEY]',
  },
];

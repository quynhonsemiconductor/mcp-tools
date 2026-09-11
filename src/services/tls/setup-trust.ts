/**
 * Enable OS trust store for TLS verification at process startup.
 *
 * Setting NODE_USE_SYSTEM_CA=1 causes Node/Bun to merge the OS trust store
 * into the TLS root set at init time, so TLS-inspection roots (Zscaler,
 * Netskope, etc.) that corp IT distributes via group policy verify without
 * a manual NODE_EXTRA_CA_CERTS bundle.
 *
 * Must be called before any module that initializes TLS — see src/bin/mcp.ts.
 * Issue: https://github.com/quynhonsemiconductor/mcp-tools/issues/1101
 */
export function setupTrustStore(): void {
  if (process.platform === 'linux') return;
  if (process.env.NODE_USE_SYSTEM_CA || process.env.NODE_EXTRA_CA_CERTS) return;
  process.env.NODE_USE_SYSTEM_CA = '1';
}

/**
 * Collect TLS-trust env vars to forward to BUN_BE_BUN subprocesses.
 *
 * Bundled MCPs spawned with the qnsc-mcp binary as their Bun runtime need the
 * same corp-CA trust as the parent — otherwise axios/fetch calls from the
 * subprocess fail with "unable to get local issuer certificate" even when
 * the parent is healthy. Scoped to BUN_BE_BUN only so we don't override
 * system bun/node runtimes that have their own corp setup.
 */
export function selectBunBeBunTlsEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.NODE_USE_SYSTEM_CA) env.NODE_USE_SYSTEM_CA = process.env.NODE_USE_SYSTEM_CA;
  if (process.env.NODE_EXTRA_CA_CERTS) env.NODE_EXTRA_CA_CERTS = process.env.NODE_EXTRA_CA_CERTS;
  if (process.env.SSL_CERT_FILE) env.SSL_CERT_FILE = process.env.SSL_CERT_FILE;
  return env;
}

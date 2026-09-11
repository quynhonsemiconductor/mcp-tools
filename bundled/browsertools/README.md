# browsertools

**Version:** 0.0.0

<a href="https://glama.ai/mcp/servers/AgentDeskAI/browser-tools-mcp">View on Glama.ai</a>

**Source:** [https://github.com/AgentDeskAI/browser-tools-mcp](https://github.com/AgentDeskAI/browser-tools-mcp}) (v1.2.0)

## Tools

### getConsoleLogs

Check our browser logs

### getConsoleErrors

Check our browsers console errors

### getNetworkErrors

Check our network ERROR logs

### getNetworkLogs

Check ALL our network logs

### takeScreenshot

Take a screenshot of the current browser tab

### getSelectedElement

Get the selected element from the browser

### wipeLogs

Wipe all browser logs from memory

### runAccessibilityAudit

Run an accessibility audit on the current page

### runPerformanceAudit

Run a performance audit on the current page

### runSEOAudit

Run an SEO audit on the current page

### runNextJSAudit

Tool from bundled MCP

### runDebuggerMode

Run debugger mode to debug an issue in our application

### runAuditMode

Run audit mode to optimize our application for SEO, accessibility and performance

### runBestPracticesAudit

Run a best practices audit on the current page

---

## Security Scan Results

**Security Risk Score:** 65/100 ([View Security Scan](./security-scan.json))

### Summary of Findings

The Browser Tools MCP server has several significant security issues, primarily related to network security, access control, and injection vulnerabilities. The most critical issue is the use of unencrypted HTTP for all communications, which exposes sensitive data to interception. The server also lacks proper authentication mechanisms, allowing anyone who can connect to the server port to access all functionality. Additionally, there are potential command injection vulnerabilities in the AppleScript execution code. The application handles large amounts of sensitive data including network requests, console logs, and screenshots, but lacks proper access controls and data protection mechanisms. While the application is designed to run locally, these security issues could still pose risks, especially if the server is exposed to untrusted networks or if malicious code is executed in the browser being monitored.

### All Security Findings

| Category | Risk Level | Description | Recommendation |
| -------- | ---------- | ----------- | -------------- |
| Network Security Issues | CRITICAL | The application uses unencrypted HTTP connections for all communication between the browser extension and the server, exposing sensitive data to potential interception. | Use HTTPS for all communications between the browser extension and the server. This requires setting up proper TLS certificates and updating all fetch/request URLs to use the https:// protocol. |
| Access Control Issues | HIGH | The server lacks proper authentication mechanisms. Any client that can connect to the server port can access all functionality without authentication. | Implement proper authentication for all API endpoints. Consider using API keys, OAuth, or another authentication mechanism appropriate for the application's context. |
| Injection Vulnerabilities | HIGH | The application executes AppleScript on macOS systems with user-provided input without proper sanitization, potentially allowing command injection. | Sanitize user input before including it in shell commands. Consider using a library designed for safe command execution or implement proper escaping of special characters. |
| Insecure Data Handling | MEDIUM | The application accepts and processes large JSON payloads (up to 50MB) without proper validation, which could lead to denial of service or memory exhaustion attacks. | Implement stricter size limits for JSON payloads and add validation for request bodies to ensure they match expected schemas before processing. |
| Security Misconfigurations | MEDIUM | The server binds to all network interfaces (0.0.0.0) by default, potentially exposing it to external networks when it should only be accessible locally. | Change the default binding to localhost (127.0.0.1) to restrict access to the local machine only, unless external access is specifically required. |
| Access Control Issues | MEDIUM | The server allows unrestricted CORS access, which could enable malicious websites to make requests to the server if a user visits them while the server is running. | Configure CORS to only allow requests from trusted origins, especially if the server is intended to be accessed only by the local browser extension. |
| Data Leakage Risks | MEDIUM | The application captures and stores screenshots without proper access controls, potentially exposing sensitive information visible in the browser. | Implement proper access controls for stored screenshots and consider adding options for users to control what content can be captured. |
| Malicious Code Patterns | LOW | The browser extension has capabilities to monitor all network requests, console logs, and capture screenshots, which could be misused if the extension is compromised. | Ensure users are clearly informed about the extension's capabilities and implement additional safeguards to prevent misuse of sensitive data collection features. |
| Prompt Injection Vectors | LOW | The runNextJSAudit tool contains a large amount of hardcoded text that could potentially be used for prompt injection if the MCP server is compromised. | Review and minimize hardcoded instructions in tool definitions. Consider moving complex instructions to a separate, validated configuration file. |

### Security Categories Assessment

| Category | Risk Level | Score |
| -------- | ---------- | ----- |
| Network Security Issues | CRITICAL | 90/100 |
| Access Control Issues | HIGH | 80/100 |
| Injection Vulnerabilities | HIGH | 70/100 |
| Insecure Data Handling | MEDIUM | 60/100 |
| Security Misconfigurations | MEDIUM | 60/100 |
| Data Leakage Risks | MEDIUM | 60/100 |
| Malicious Code Patterns | LOW | 30/100 |
| Prompt Injection Vectors | LOW | 30/100 |
| Supply Chain Risks | LOW | 20/100 |
| Model Extraction Risks | NONE | 0/100 |

### Key Security Findings

| Risk Category | Risk Level | Score |
| ------------- | ---------- | ----- |
| Network Security Issues | CRITICAL | 90/100 |
| Access Control Issues | HIGH | 80/100 |
| Injection Vulnerabilities | HIGH | 70/100 |

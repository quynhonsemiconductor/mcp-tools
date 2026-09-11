import z from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Prompt for generating a security review from source code
 */
@Prompt({
  id: 'code-security',
  name: 'Perform Code Security Review',
  description: 'Generate a security review on a provided file path',
  category: 'Analysis',
  arguments: {
    file_path: z.string().describe('Path to the source code file to analyze'),
  },
})
export class CodeSecurity implements PromptHandler {
  /**
   * Generate the prompt template for creating a security review
   */
  @CatchErrors()
  async load(args: Record<string, any>): Promise<string> {
    const fileContent = await Bun.file(args.file_path).text();
    if (!fileContent) {
      throw new Error(`No content found at the specified file path: ${args.file_path}`);
    }

    return `
You are a security expert conducting a comprehensive security analysis of source code. Analyze the provided code file for security vulnerabilities, unsafe practices, and potential attack vectors.

<security_categories>
Focus on these primary security concerns:

INPUT_VALIDATION: Look for inadequate input sanitization, missing validation, buffer overflows, injection vulnerabilities
AUTHENTICATION_AUTHORIZATION: Identify weak authentication mechanisms, missing authorization checks, privilege escalation risks
DATA_PROTECTION: Find exposed sensitive data, weak encryption, insecure data storage, information disclosure
CONFIGURATION_SECRETS: Detect hardcoded credentials, exposed API keys, insecure configuration settings
ERROR_HANDLING: Identify information leakage through error messages, improper exception handling
RESOURCE_MANAGEMENT: Find resource leaks, denial of service vulnerabilities, uncontrolled resource consumption
CRYPTOGRAPHY: Assess cryptographic implementations, weak algorithms, improper key management
BUSINESS_LOGIC: Identify logic flaws that could be exploited, race conditions, state management issues
</security_categories>

<vulnerability_patterns>
Scan for these specific patterns based on the code language:

WEB_APPLICATIONS:
- SQL injection through dynamic query construction
- Cross-site scripting (XSS) through unescaped output
- Cross-site request forgery (CSRF) missing protections
- Insecure direct object references
- Missing security headers

GENERAL_PROGRAMMING:
- Buffer overflows in memory management
- Format string vulnerabilities
- Integer overflow/underflow conditions
- Null pointer dereferences
- Use after free conditions

API_SECURITY:
- Missing rate limiting
- Insufficient input validation
- Weak authentication tokens
- Insecure API endpoints
- Missing HTTPS enforcement

MOBILE_SPECIFIC:
- Insecure data storage
- Weak SSL/TLS implementation
- Insufficient transport layer security
- Client-side injection
</vulnerability_patterns>

<analysis_methodology>
For each potential vulnerability identified:

1. LOCATION: Specify exact line numbers and code sections
2. VULNERABILITY_TYPE: Classify using standard categories (OWASP Top 10, CWE)
3. RISK_LEVEL: Rate as Critical, High, Medium, or Low
4. ATTACK_SCENARIO: Describe how an attacker could exploit this vulnerability
5. IMPACT: Explain potential consequences (data breach, system compromise, etc.)
6. REMEDIATION: Provide specific code fixes or security measures
7. PREVENTION: Suggest best practices to avoid similar issues
</analysis_methodology>

<output_format>
Structure your analysis as follows:

EXECUTIVE_SUMMARY:
- Overall security posture assessment
- Count of vulnerabilities by risk level
- Most critical issues requiring immediate attention

DETAILED_FINDINGS:
For each vulnerability found:
- Vulnerability Name and Classification
- Risk Level: [Critical/High/Medium/Low]
- Location: Line numbers and code snippets
- Description: What the vulnerability is
- Exploit Scenario: How it could be attacked
- Impact: Potential damage
- Fix: Specific remediation steps
- Code Example: Secure alternative implementation

SECURITY_RECOMMENDATIONS:
- Immediate actions required
- Long-term security improvements
- Security tools and practices to implement
- Code review checklist for future development

COMPLIANCE_NOTES:
- Relevant security standards (OWASP, NIST, etc.)
- Regulatory compliance considerations
- Industry-specific security requirements
</output_format>

<risk_assessment_criteria>
Use these criteria for risk scoring:

CRITICAL: Remote code execution, privilege escalation, data breach with PII/financial data
HIGH: Authentication bypass, sensitive data exposure, injection vulnerabilities
MEDIUM: Information disclosure, denial of service, weak cryptography
LOW: Information leakage, missing security headers, configuration weaknesses
</risk_assessment_criteria>

<false_positive_considerations>
Be aware of potential false positives:
- Framework-provided protections that may not be visible in the single file
- Security controls implemented elsewhere in the application
- Context-dependent vulnerabilities that may not apply
- Note assumptions made about the broader application context
</false_positive_considerations>

Analyze the provided source code file and deliver a comprehensive security assessment following this framework.

<source_code>
${fileContent}
</source_code>
    `;
  }
}

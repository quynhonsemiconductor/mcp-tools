# sharepoint

**Version:** 1.0.14

<a href="https://glama.ai/mcp/servers/Zerg00s/server-sharepoint">View on Glama.ai</a>

**Source:** [https://github.com/Zerg00s/server-sharepoint](https://github.com/Zerg00s/server-sharepoint) (ab88045)

## Environment Variables

| Name | Description | Required | Default |
| ---- | ----------- | -------- | ------- |
| `AZURE_APPLICATION_ID` | The Azure Application ID. | ✅ |  |
| `AZURE_APPLICATION_CERTIFICATE_THUMBPRINT` | The Azure Application Certificate Thumbprint. | ✅ |  |
| `AZURE_APPLICATION_CERTIFICATE_PASSWORD` | The Azure Application Certificate Password. | ✅ |  |
| `M365_TENANT_ID` | The Azure Microsoft 365 tenant ID. | ✅ |  |

## Tools

### getLists

Get the list of SharePoint lists along with their Titles, URLs, ItemCounts, last modified date, description and base templateID

### getListItems

Get all items from a specific SharePoint list identified by site URL and list title

### getListFields

Get detailed information about fields/columns in a SharePoint list

### createListItem

Create a new item in a SharePoint list with specified field values

### updateListItem

Update an item in a SharePoint list

### deleteListItem

Delete an item from a SharePoint list

### createList

Create a new SharePoint list or document library

### deleteList

Delete a SharePoint list or document library

### updateList

Update a SharePoint list properties (Title, Description, versioning settings, etc.)

### getSite

Get the title of a SharePoint website

### updateSite

Update a SharePoint site properties (Title, Description, etc.)

### getSiteUsers

Get users from a SharePoint site, optionally filtered by role

### getSiteGroups

Get all SharePoint groups for a site

### getGroupMembers

Get members of a specific SharePoint group

### addGroupMember

Add a user to a SharePoint group

### removeGroupMember

Remove a user from a SharePoint group

### getGlobalNavigationLinks

Get global navigation links from a SharePoint site

### getQuickNavigationLinks

Get quick navigation links (left navigation) from a SharePoint site

### getSubsites

Get all subsites from a SharePoint site

### deleteSubsite

Delete a SharePoint subsite

### addNavigationLink

Add a navigation link to a SharePoint site (global or quick navigation)

### updateNavigationLink

Update a navigation link in a SharePoint site (global or quick navigation)

### deleteNavigationLink

Delete a navigation link from a SharePoint site (global or quick navigation)

### getListViews

Get all views from a SharePoint list with optional field details

### createListView

Create a new view for a SharePoint list with specified fields and settings

### updateListView

Update an existing view for a SharePoint list

### deleteListView

Delete a view from a SharePoint list

### getViewFields

Get all fields from a specific SharePoint list view

### addViewField

Add a field to a SharePoint list view

### removeViewField

Remove a field from a SharePoint list view

### removeAllViewFields

Remove all fields from a SharePoint list view

### moveViewFieldTo

Move a field to a specific position in a SharePoint list view

### createModernPage

Create a modern page in SharePoint

### getModernPages

Get modern pages from a SharePoint site

### getModernPage

Get a specific modern page by ID from a SharePoint site

### deleteModernPage

Delete a modern page from SharePoint

### createListField

Create a new field (column) in a SharePoint list

### updateListField

Update a field/column in a SharePoint list including display name, choices, etc.

### deleteListField

Delete a field (column) from a SharePoint list

### batchCreateListItems

Create multiple items in a SharePoint list using a single batch request

### batchUpdateListItems

Update multiple items in a SharePoint list using a single batch request

### batchDeleteListItems

Delete multiple items from a SharePoint list using a single batch request

### getListContentTypes

Get all content types from a specific SharePoint list

### getListContentType

Get a specific content type from a SharePoint list

### createListContentType

Create a new content type in a SharePoint list

### updateListContentType

Update a content type in a SharePoint list

### deleteListContentType

Delete a content type from a SharePoint list

### getSiteContentTypes

Get all content types from a SharePoint site

### getSiteContentType

Get a specific content type from a SharePoint site

### updateSiteContentType

Update a content type in a SharePoint site

### deleteSiteContentType

Delete a content type from a SharePoint site

### getRegionalSettings

Get regional settings from a SharePoint site

### getSiteCollectionFeatures

Get all features from a SharePoint site collection

### getSiteFeatures

Get all features from a SharePoint site

### getSiteFeature

Get a specific feature from a SharePoint site by feature ID

### searchSharePointSite

Search within a SharePoint site using KQL query

---

## Security Scan Results

**Security Risk Score:** 25/100 ([View Security Scan](./security-scan.json))

### Summary of Findings

The SharePoint MCP server implementation has a moderate security posture with a few areas of concern. The most significant issue is a potential command injection vulnerability in the certificate handling code, where user-provided inputs are directly incorporated into PowerShell commands. There are also minor concerns around URL construction, temporary file handling, and certificate password exposure. The code generally follows secure practices for authentication and API interactions, with proper use of request digests and tokens for SharePoint operations. No evidence of malicious code, backdoors, or data exfiltration attempts was found. The server appears to be a legitimate SharePoint integration tool with some security improvements needed in specific areas.

### All Security Findings

| Category | Risk Level | Description | Recommendation |
| -------- | ---------- | ----------- | -------------- |
| Injection Vulnerabilities | MEDIUM | Potential command injection vulnerability in azure_cert_auth.ts when executing PowerShell commands with user-provided certificate thumbprint and password | Use parameter validation to ensure thumbprint only contains valid hexadecimal characters and implement proper escaping of special characters in PowerShell commands. Consider using a dedicated PowerShell module or library instead of direct command execution. |
| Injection Vulnerabilities | LOW | Potential template injection in multiple SharePoint API URL construction where user input is directly concatenated into URLs | While encodeURIComponent is used for list titles, ensure all user inputs are properly validated and sanitized before being used in URL construction. Consider using a URL builder library that handles proper escaping. |
| Insecure Data Handling | LOW | Temporary certificate files are created on disk during certificate authentication but may not be properly cleaned up in all error scenarios | Implement proper cleanup in a finally block to ensure temporary files are always removed, even when errors occur. Consider using secure temporary file handling libraries. |
| Security Misconfigurations | LOW | Certificate password is passed as plain text in PowerShell command which could be visible in process listings or logs | Consider alternative approaches for certificate handling that don't require exposing the password in command line arguments. If possible, use Windows credential store or other secure methods for handling certificate passwords. |
| Network Security Issues | LOW | The code doesn't explicitly verify that SharePoint URLs use HTTPS, potentially allowing HTTP connections | Add validation to ensure that all SharePoint URLs use HTTPS. Modify the URL schema validation to require HTTPS protocol. |

### Security Categories Assessment

| Category | Risk Level | Score |
| -------- | ---------- | ----- |
| Injection Vulnerabilities | MEDIUM | 50/100 |
| Insecure Data Handling | LOW | 25/100 |
| Security Misconfigurations | LOW | 20/100 |
| Network Security Issues | LOW | 15/100 |
| Access Control Issues | NONE | 0/100 |
| Malicious Code Patterns | NONE | 0/100 |
| Supply Chain Risks | NONE | 0/100 |
| Prompt Injection Vectors | NONE | 0/100 |
| Model Extraction Risks | NONE | 0/100 |
| Data Leakage Risks | NONE | 0/100 |

### Key Security Findings

| Risk Category | Risk Level | Score |
| ------------- | ---------- | ----- |
| Injection Vulnerabilities | MEDIUM | 50/100 |

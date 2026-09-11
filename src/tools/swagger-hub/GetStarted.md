# 🚀 SwaggerHub Tools - Guide to Getting Started

## 🎯 Overview

The SwaggerHub tools provide an initial toolkit based on the Registry API for managing OpenAPI specifications within QNSC's development ecosystem.

> **Searching and uploading moved to the connector.** `searchSwaggerHub` and
> `uploadSwaggerDocument` are no longer local tools — they run on the
> platform-hosted `swagger` server, reached through the **SwaggerHub** Claude
> connector. That gateway is not deployed here, so the connector route is unavailable.
> The tools documented below stay local because they touch your filesystem.

## 🔧 **Configuration**


### Gain access to SwaggerHub
1. Join the #dcm-swaggerhub-implementation slack channel.
2. Fill out the request form to get access.

### Getting Your API Key:
1. Login to SwaggerHub at `https://app.swaggerhub.com`
2. Go to Account Settings → API Key -> Copy API Key
3. Add it to your environment variables.

```bash
# Your SwaggerHub API key - get this from your SwaggerHub account settings
SWAGGER_HUB_API_KEY=your-api-key-here
```

`SWAGGER_HUB_API_KEY` is still required for the local tools below. The connector
path uses the key you registered with the platform instead, so it needs nothing
in your environment.

## ✨ Available Tools

### 💾 **1. `saveSwaggerHubDocument` - Local Management**

**Purpose:** Download and organize OpenAPI specifications on your local filesystem.

**Best for:**
- Creating local API documentation libraries
- Preparing specs for code generation tools
- Working offline with API specifications

**Parameters:**
- `url` (required): SwaggerHub API URL (from search results or direct links)
- `docType` (optional): File format ("json" or "yaml", defaults to "json")
- `destination` (optional): Local directory path (defaults to home directory)

### ⚙️ **2. `generateOpenApiClient` - Client Generation**

**Purpose:** Generate client code from an OpenAPI specification, using the local
`openapi-generator` CLI and writing the result to disk.

**Best for:**
- Scaffolding a typed client for an API you consume
- Working from a spec you have already saved locally

## 🛠️ **Usage Tips**

### Search and Save
- Search through the connector, then save locally with `saveSwaggerHubDocument`.
  - NOTE - The API search response is heavily reduced as it can lead to context window exhaustion.
- Saved definitions can be useful in generating API clients for your application.

### Suggested File Organization:
```bash
# Recommended directory structure
./api-definitions/
├── core-services/          # Essential business APIs
├── integration-apis/       # Third-party integrations  
├── internal-tools/         # Internal tooling APIs
└── deprecated/            # Legacy APIs for reference
```

## ⚠️ **Troubleshooting**

### Common Issues:

**Errors:**
```
Error: NotFound (404)
```
- Check your `SWAGGER_HUB_API_KEY` environment variable
- Verify API key has proper permissions in SwaggerHub


**File Save Issues:**
```
Error: Permission denied
```
- Verify destination directory exists and is writable
- Check disk space availability
- Ensure proper file path formatting

### Getting Help:
- Review MCP Tools logs for detailed error messages

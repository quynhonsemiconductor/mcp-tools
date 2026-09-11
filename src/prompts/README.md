# Available Prompts

MCP Tools provides a built-in collection of prompt templates across multiple categories to enhance LLMs capabilities and supports integration of other prompt repositories hosted on github.com/quynhonsemiconductor.

## Built-In Prompts

### Categories

<!-- BEGIN PROMPT CATEGORIES -->
The prompts are organized into the following categories:

- **Analysis** - Prompts for analysis related operations
- **Documentation** - Prompts for documentation related operations

<!-- END PROMPT CATEGORIES -->

### List

<!-- BEGIN PROMPT LIST -->
| Prompt Name | Category | Description |
|-------------|----------|-------------|
| `Create Code Performance` | Analysis | Generate a performance review from a code snippet. |
| `Perform Code Security Review` | Analysis | Generate a security review on a provided file path. |
| `Perform Code Smell Review` | Analysis | Generate a code smell review on a provided file path. |
| `Create Class Diagram` | Documentation | Generate a Mermaid class diagram from a code snippet. |
| `Create Code Flowchart` | Documentation | Generates a Mermaid Flow Chart from a code snippet. |
| `create defect` | Documentation | Creates a k6 defect linked to a test case with detailed information. |
| `Prepare Test Plan for the feature` | Documentation | Creates a comprehensive test plan based on k6 Feature information including acceptance criteri... |

<!-- END PROMPT LIST -->

## Prompt Repositories

Prompts can be loaded from any git repository hosted on github.com/quynhonsemiconductor by adding an entry to config.yaml. To be loaded, prompts must be provided in a .md file and provide frontmatter properties:

```markdown
---
- title: Friendly title of the prompt
- description: Brief description of the prompt
- category: Category of the prompt (e.g., 'Analysis', 'documentation')
- author: Author of the prompt (optional)
- created: Creation date of the prompt (yyyy-mm-dd, optional)
- updated: Last updated date of the prompt (yyyy-mm-dd, optional)
- mcp_compatible: Whether this prompt should be loaded by mcp tools, true or false, defaults to true
- mcp_tools: Array of mcp tools this prompt requires to be enabled (e.g., [getRemoteItem, getGithubRepository], optional)
- arguments: Yaml array of arguments required by the prompt, each with:
  - name: Name of the argument in snake-case
    description: Description of the argument
    required: true or false
---

You are an expert...
```

Specify prompt repositories in the config.yaml:

```yaml
prompts:
  repositories:
    - repo: my-org/my-repo
    - repo: other-org/other-repo
      branch: v1
      include: ['prompts/**/*.md']
```

By default, all .md files will be checked for valid frontmatter and loaded. You may specify a branch or tag if desired, otherwise the default of the repository is used. Any number of glob-style include patterns may be provided to narrow the directories scanned.

Repositories are cloned and cached into ~/.qnsc-mcp/prompt-repositories. This requires your local git configuration and keys to have access to the target repository. If you encounter issues, first try clearing the cache directory. If issues persist, check the logs in ~/.qnscmcp/logs.

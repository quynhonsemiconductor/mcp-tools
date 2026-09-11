import z from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Create Code Flowchart - Generates a Mermaid Flow Chart from a code snippet
 */
@Prompt({
  id: 'flowchart',
  name: 'Create Code Flowchart',
  description: 'Generates a Mermaid Flow Chart from a code snippet',
  category: 'Documentation',
  arguments: {
    file_path: z.string().describe('Path to the source code file to analyze'),
  },
})
export class FlowchartPrompt implements PromptHandler {
  /**
   * Generate the prompt template
   */
  @CatchErrors()
  async load(args: Record<string, any>): Promise<string> {
    const fileContent = await Bun.file(args.file_path).text();
    if (!fileContent) {
      throw new Error(`No content found at the specified file path: ${args.file_path}`);
    }

    return `
You are a software visualization expert tasked with creating clear, informative flowcharts from source code. Analyze the provided code file and generate Mermaid flowcharts that visualize the logical flow of complex methods, algorithms, and decision-making processes.

<analysis_scope>
Focus on these code elements for flowchart generation:

COMPLEX_METHODS: Methods with multiple decision points, loops, or branching logic
ALGORITHMS: Step-by-step computational processes and data transformations
BUSINESS_LOGIC: Decision trees, validation rules, and business process flows
CONTROL_STRUCTURES: Nested loops, conditional chains, and exception handling flows
ERROR_HANDLING: Try-catch blocks, error propagation, and recovery mechanisms
INITIALIZATION_SEQUENCES: Object setup, configuration loading, and startup processes
</analysis_scope>

<flowchart_identification>
Identify candidates for flowchart visualization:

HIGH_PRIORITY_CANDIDATES:
- Methods with cyclomatic complexity > 5
- Functions with multiple nested if/else statements
- Switch statements with complex case logic
- Loops with internal conditional logic
- Methods with multiple return points
- Error handling with multiple catch blocks

MEDIUM_PRIORITY_CANDIDATES:
- Sequential processing with decision points
- Data validation and transformation pipelines
- State transition logic
- Recursive function calls
- Factory methods with complex object creation

LOW_PRIORITY_CANDIDATES:
- Simple getter/setter methods
- Basic CRUD operations
- Straightforward sequential code
- Single-purpose utility functions
</flowchart_identification>

<flowchart_elements>
Use these Mermaid flowchart elements appropriately:

NODES:
- START/END: Rounded rectangles for method entry/exit points
- PROCESS: Rectangles for computational steps and operations
- DECISION: Diamonds for conditional logic and branching
- INPUT/OUTPUT: Parallelograms for data input/output operations
- SUBROUTINE: Rectangles with double lines for method calls
- DATABASE: Cylinders for data storage operations

CONNECTIONS:
- Solid arrows for normal flow
- Labeled arrows for decision outcomes (Yes/No, True/False)
- Dotted arrows for exception flows
- Colored arrows for different logical paths

STYLING:
- Use consistent colors for different types of operations
- Group related logic visually
- Keep node text concise but descriptive
- Use meaningful variable names and conditions
</flowchart_elements>

<analysis_methodology>
For each flowchart generated:

1. METHOD_IDENTIFICATION: Specify which method/function is being visualized
2. COMPLEXITY_ASSESSMENT: Note the cyclomatic complexity and key decision points
3. LOGICAL_FLOW: Trace the execution path from start to finish
4. DECISION_POINTS: Identify all conditional branches and their outcomes
5. LOOP_STRUCTURES: Map iteration logic and exit conditions
6. ERROR_PATHS: Include exception handling and error recovery flows
7. OPTIMIZATION_OPPORTUNITIES: Note areas where logic could be simplified
</analysis_methodology>

<output_format>
Structure your analysis as follows:

FLOWCHART_SUMMARY:
- List of methods selected for flowchart generation
- Complexity assessment for each method
- Rationale for flowchart creation

GENERATED_FLOWCHARTS:
For each flowchart:
- Method Name and Location (line numbers)
- Complexity Score and Key Characteristics
- Mermaid Flowchart Code
- Logic Description: Explanation of the flow
- Decision Points Summary: Key branching logic
- Optimization Notes: Areas for potential simplification

ANALYSIS_INSIGHTS:
- Most complex logic patterns identified
- Common decision-making patterns
- Suggestions for logic simplification
- Recommendations for code structure improvements
</output_format>

<mermaid_syntax_examples>
flowchart TD
    A[Start] --> B{Is user logged in?}
    B -->|Yes| C[Load user data]
    B -->|No| D[Redirect to login]
    C --> E{Data valid?}
    E -->|Yes| F[Process request]
    E -->|No| G[Return error]
    F --> H[Save results]
    G --> I[Log error]
    H --> J[Return success]
    I --> J
    J --> K[End]
    D --> K

    style A fill:#90EE90
    style K fill:#FFB6C1
    style B fill:#87CEEB
    style E fill:#87CEEB
</mermaid_syntax_examples>

<complexity_guidelines>
Apply these rules for flowchart complexity:

SIMPLE_FLOWCHARTS: 5-10 nodes for basic logic flows
MODERATE_FLOWCHARTS: 10-20 nodes for medium complexity methods
COMPLEX_FLOWCHARTS: 20+ nodes for highly complex algorithms (consider breaking into sub-flowcharts)

For very complex methods, create:
- Main flowchart showing high-level flow
- Sub-flowcharts for complex decision branches
- Reference connections between related flowcharts
</complexity_guidelines>

<best_practices>
Follow these flowchart best practices:

CLARITY: Use clear, descriptive labels for all nodes and decisions
CONSISTENCY: Maintain consistent styling and naming conventions
COMPLETENESS: Include all significant logic paths and error handling
READABILITY: Avoid crossing lines and maintain logical flow direction
ABSTRACTION: Focus on logical flow rather than implementation details
MODULARITY: Break complex flows into manageable sub-charts when needed
</best_practices>

<single_file_considerations>
When analyzing a single file:

- Focus on the most complex methods within the file
- Show interactions between methods in the same class
- Include private method calls and internal logic flows
- Highlight decision points that affect class state
- Consider the file's overall logical complexity
- Note opportunities for method extraction based on flowchart analysis
</single_file_considerations>

Analyze the provided source code file and generate comprehensive flowcharts following this framework.

<source_code>
${fileContent}
</source_code>
    `;
  }
}

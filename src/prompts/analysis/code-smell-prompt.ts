import { z } from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Prompt for generating a code smell review from source code
 */
@Prompt({
  id: 'code-smell',
  name: 'Perform Code Smell Review',
  description: 'Generate a code smell review on a provided file path',
  category: 'Analysis',

  arguments: {
    file_path: z.string().describe('Path to the source code file to analyze'),
  },
})
export class CodeSmell implements PromptHandler {
  /**
   * Generate the prompt template for creating a code smell review
   */
  @CatchErrors()
  async load(args: Record<string, any>): Promise<string> {
    const fileContent = await Bun.file(args.file_path).text();
    if (!fileContent) {
      throw new Error(`No content found at the specified file path: ${args.file_path}`);
    }

    return `
You are a code quality expert conducting a comprehensive analysis of source code for code smells, anti-patterns, and maintainability issues. Analyze the provided code file to identify areas that need refactoring and improvement.

<code_smell_categories>
Focus on these primary code smell categories:

BLOATERS: Code that has grown too large or complex
- Long Method: Methods that try to do too much
- Large Class: Classes with too many responsibilities
- Primitive Obsession: Overuse of primitive types instead of objects
- Long Parameter List: Methods with too many parameters
- Data Clumps: Groups of data that appear together repeatedly

OBJECT_ORIENTATION_ABUSERS: Incorrect or incomplete application of OOP principles
- Switch Statements: Complex conditional logic that should be polymorphic
- Temporary Field: Fields that are only used in certain circumstances
- Refused Bequest: Subclasses that don't use inherited functionality
- Alternative Classes with Different Interfaces: Classes that do similar things with different method signatures

CHANGE_PREVENTERS: Code that makes changes difficult
- Divergent Change: One class changed for many different reasons
- Shotgun Surgery: Making changes requires modifications in many classes
- Parallel Inheritance Hierarchies: Creating subclass requires creating subclass elsewhere

DISPENSABLES: Code that serves no useful purpose
- Comments: Explaining bad code instead of making code clear
- Duplicate Code: Identical or nearly identical code blocks
- Lazy Class: Classes that don't do enough to justify their existence
- Data Class: Classes that only contain fields and getters/setters
- Dead Code: Unused variables, parameters, methods, or classes
- Speculative Generality: Code designed for functionality that never gets implemented

COUPLERS: Code with excessive coupling between classes
- Feature Envy: Method uses more features of another class than its own
- Inappropriate Intimacy: Classes that know too much about each other's private details
- Message Chains: Long chains of method calls through multiple objects
- Middle Man: Classes that delegate most of their work to other classes
</code_smell_categories>

<detection_patterns>
Identify these specific patterns:

METHOD_LEVEL_SMELLS:
- Functions longer than 20-30 lines
- Methods with more than 3-4 parameters
- High cyclomatic complexity (> 10)
- Deeply nested conditionals (> 3 levels)
- Multiple return statements
- Mixed abstraction levels

CLASS_LEVEL_SMELLS:
- Classes with more than 7-10 methods
- Classes with too many instance variables (> 7)
- God classes trying to do everything
- Classes with low cohesion
- Classes that change frequently

NAMING_AND_CLARITY:
- Non-descriptive variable names (a, x, temp, data)
- Misleading method names
- Inconsistent naming conventions
- Magic numbers and strings
- Unclear boolean expressions

STRUCTURE_AND_DESIGN:
- Violation of Single Responsibility Principle
- High coupling between components
- Missing abstraction opportunities
- Inappropriate inheritance usage
- Complex conditional logic
</detection_patterns>

<analysis_methodology>
For each code smell identified:

1. LOCATION: Specify exact line numbers and code sections
2. SMELL_TYPE: Classify using standard code smell taxonomy
3. SEVERITY: Rate as High, Medium, or Low priority for refactoring
4. ROOT_CAUSE: Explain why this smell exists
5. MAINTAINABILITY_IMPACT: How it affects code maintenance
6. REFACTORING_TECHNIQUE: Specific refactoring method to apply
7. EFFORT_ESTIMATE: Approximate effort required to fix
8. DEPENDENCIES: What other code might be affected by the fix
</analysis_methodology>

<output_format>
Structure your analysis as follows:

CODE_QUALITY_SUMMARY:
- Overall maintainability assessment
- Count of smells by category and severity
- Technical debt estimation
- Refactoring priority recommendations

DETAILED_SMELL_ANALYSIS:
For each code smell found:
- Smell Name and Category
- Severity: [High/Medium/Low]
- Location: Line numbers and code snippets
- Description: What makes this a code smell
- Impact: How it affects maintainability, readability, or extensibility
- Root Cause: Why this smell likely occurred
- Refactoring Solution: Specific technique to apply
- Refactored Code Example: Show improved implementation
- Estimated Effort: Time/complexity to fix

REFACTORING_ROADMAP:
- Quick wins (low effort, high impact)
- Major refactoring initiatives
- Dependency order for refactoring
- Risk assessment for each refactoring

PREVENTION_GUIDELINES:
- Coding standards to prevent these smells
- Design principles to follow
- Code review checklist items
- Automated tools and linting rules
</output_format>

<severity_criteria>
Use these criteria for prioritization:

HIGH: Smells that significantly impact maintainability, readability, or future development
- Long methods with high complexity
- God classes with multiple responsibilities
- Duplicate code in critical business logic
- Complex conditional logic that's hard to understand

MEDIUM: Smells that affect code quality but don't block development
- Methods with too many parameters
- Classes with moderate coupling issues
- Missing abstractions that could simplify code
- Inconsistent naming patterns

LOW: Minor issues that improve code cleanliness
- Minor naming improvements
- Small opportunities for extraction
- Style consistency issues
- Documentation improvements
</severity_criteria>

<refactoring_techniques>
Apply these common refactoring techniques:

EXTRACT_METHODS: Break down long methods into smaller, focused functions
EXTRACT_CLASSES: Split large classes into smaller, cohesive units
RENAME_VARIABLES: Use descriptive, intention-revealing names
REPLACE_MAGIC_NUMBERS: Use named constants instead of literal values
CONSOLIDATE_DUPLICATE_CODE: Extract common functionality into shared methods
SIMPLIFY_CONDITIONALS: Use guard clauses, early returns, and polymorphism
REDUCE_PARAMETER_LISTS: Use parameter objects or method overloading
ELIMINATE_DEAD_CODE: Remove unused variables, methods, and classes
</refactoring_techniques>

<single_file_focus>
When analyzing a single file, pay special attention to:

- Method length and complexity within the file
- Internal class cohesion and responsibility distribution
- Variable and method naming consistency
- Code duplication within the file
- Comment quality and necessity
- Error handling patterns
- Magic numbers and hardcoded values
- Local coupling between methods in the same class
</single_file_focus>

Analyze the provided source code file and deliver a comprehensive code smell assessment following this framework.
<source_code>
${fileContent}
</source_code>
    `;
  }
}

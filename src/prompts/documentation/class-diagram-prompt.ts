import z from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Prompt for generating a class diagram from source code
 */
@Prompt({
  id: 'class-diagram',
  name: 'Create Class Diagram',
  description: 'Generate a Mermaid class diagram from a code snippet',
  category: 'Documentation',
  arguments: {
    file_path: z.string().describe('Path to the source code file to analyze'),
  },
})
export class ClassDiagram implements PromptHandler {
  /**
   * Generate the prompt template for creating a class diagram
   */
  @CatchErrors()
  async load(args: Record<string, any>): Promise<string> {
    const fileContent = await Bun.file(args.file_path).text();
    if (!fileContent) {
      throw new Error(`No content found at the specified file path: ${args.file_path}`);
    }

    return `
You are an expert software architect tasked with analyzing source code and generating a clean, well-structured class diagram. Given source code in any programming language, create a Mermaid class diagram that accurately represents the codebase structure.

<analysis_instructions>
Parse the provided source code and identify all classes, interfaces, abstract classes, and enums. For each class, extract:
- Attributes (fields/properties) with their types and visibility
- Methods (functions) with parameters, return types, and visibility
- Static members vs instance members
- Relationships between classes including inheritance, interface implementation, composition, aggregation, association, and dependencies
</analysis_instructions>

<code_analysis_guidelines>
Follow these language-agnostic mapping rules:
- Convert language-specific access modifiers to UML visibility symbols (+ public, - private, # protected, ~ package)
- Map language-specific concepts like properties, getters/setters to appropriate UML representations
- Handle inheritance keywords (extends, inherits, derives) as inheritance relationships
- Identify interface implementation through implements keywords or similar patterns
- Detect composition through private fields with strong lifecycle dependency
- Detect aggregation through shared references or injected dependencies
- Identify associations through method parameters, return types, and public fields
- Find dependencies through import statements and temporary usage patterns
</code_analysis_guidelines>

<filtering_priorities>
Focus on the most architecturally significant classes:
- Include primary business logic classes
- Show important utility classes that are central to the design
- Include data models that have meaningful relationships
- Exclude simple data transfer objects unless architecturally significant
- Limit to 8-15 classes for optimal readability
- Group related classes logically in the diagram
</filtering_priorities>

<relationship_detection_rules>
Use these patterns to identify relationships:
- Inheritance: extends/inherits keywords, base classes → use --|>
- Implementation: implements keywords, interface adherence → use ..|>
- Composition: private fields, strong ownership, lifecycle dependency → use --*
- Aggregation: shared references, injected dependencies, weaker ownership → use --o
- Association: method parameters, return types, public fields → use --
- Dependency: import statements, temporary method usage → use ..>
</relationship_detection_rules>

<output_format>
Generate a complete Mermaid class diagram using this structure. Mark abstract classes with <<abstract>> and interfaces with <<interface>>. Include key attributes and methods while avoiding trivial getters/setters unless they're architecturally important.

Example format:
classDiagram
    class <<interface>> InterfaceName {
        +methodSignature() ReturnType
    }

    class <<abstract>> AbstractClass {
        #protectedField: Type
        +abstractMethod()* void
    }

    class ConcreteClass {
        -privateField: Type
        +publicMethod(param: Type) ReturnType
    }

    ConcreteClass --|> AbstractClass : extends
    ConcreteClass ..|> InterfaceName : implements
    ConcreteClass --* OtherClass : composition
</output_format>

<analysis_output>
Provide your analysis in this structure:
1. List the main classes identified in the codebase
2. Summarize the key relationships discovered
3. Present the complete Mermaid class diagram
4. Note any important architectural observations or simplifications made
</analysis_output>

Analyze the provided source code and generate the class diagram following these specifications.

<source_code>
${fileContent}
</source_code>
    `;
  }
}

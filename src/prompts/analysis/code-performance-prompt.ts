import { z } from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Prompt for generating a code performance review from source code
 */
@Prompt({
  id: 'code-performance',
  name: 'Create Code Performance',
  description: 'Generate a performance review from a code snippet',
  category: 'Analysis',
  arguments: {
    file_path: z.string().describe('Path to the source code file to analyze'),
  },
})
export class CodePerformance implements PromptHandler {
  /**
   * Generate the prompt template for creating a performance review
   */
  @CatchErrors()
  async load(args: Record<string, any>): Promise<string> {
    const fileContent = await Bun.file(args.file_path).text();
    if (!fileContent) {
      throw new Error(`No content found at the specified file path: ${args.file_path}`);
    }

    return `
You are a performance optimization expert conducting a comprehensive analysis of source code for performance bottlenecks and inefficiencies. Analyze the provided code file to identify performance issues, resource waste, and optimization opportunities.

<performance_categories>
Focus on these primary performance concerns:

ALGORITHMIC_COMPLEXITY: Identify inefficient algorithms, nested loops, unnecessary iterations, poor time/space complexity
MEMORY_MANAGEMENT: Find memory leaks, excessive allocations, inefficient data structures, garbage collection pressure
DATABASE_OPERATIONS: Detect N+1 queries, missing indexes, inefficient queries, excessive database calls
I_O_OPERATIONS: Identify blocking I/O, unnecessary file operations, inefficient network calls, missing caching
COMPUTATIONAL_WASTE: Find redundant calculations, expensive operations in loops, unnecessary processing
RESOURCE_CONTENTION: Detect synchronization bottlenecks, lock contention, thread pool exhaustion
DATA_STRUCTURES: Assess inappropriate data structure choices, inefficient collections usage
CACHING_OPPORTUNITIES: Identify missing caching, cache invalidation issues, over-caching problems
</performance_categories>

<bottleneck_patterns>
Scan for these specific performance anti-patterns:

LOOPS_AND_ITERATIONS:
- O(n²) or worse complexity algorithms
- Expensive operations inside loops
- Nested loops that could be optimized
- Inefficient loop constructs
- Missing break/continue optimizations

MEMORY_INEFFICIENCIES:
- Large object creation in hot paths
- String concatenation in loops
- Unnecessary object copying
- Memory fragmentation patterns
- Premature or excessive memory allocation

DATABASE_ANTI_PATTERNS:
- SELECT * queries
- Missing WHERE clause optimizations
- Queries inside loops
- Lack of connection pooling
- Missing prepared statements

I_O_BOTTLENECKS:
- Synchronous I/O in performance-critical paths
- Unnecessary file system operations
- Inefficient serialization/deserialization
- Missing compression or batching
- Redundant network calls

CONCURRENCY_ISSUES:
- Excessive locking granularity
- Thread creation overhead
- Missing parallelization opportunities
- Inefficient synchronization primitives
</bottleneck_patterns>

<analysis_methodology>
For each performance issue identified:

1. LOCATION: Specify exact line numbers and code sections
2. ISSUE_TYPE: Classify the type of performance problem
3. SEVERITY: Rate as Critical, High, Medium, or Low impact
4. COMPLEXITY_ANALYSIS: Provide Big O notation where applicable
5. PERFORMANCE_IMPACT: Quantify expected impact (CPU, memory, latency)
6. OPTIMIZATION: Provide specific improvement recommendations
7. TRADE_OFFS: Explain any trade-offs in the proposed solutions
8. MEASUREMENT: Suggest how to measure improvement
</analysis_methodology>

<output_format>
Structure your analysis as follows:

PERFORMANCE_SUMMARY:
- Overall performance assessment
- Count of issues by severity level
- Estimated performance impact
- Quick wins vs complex optimizations

CRITICAL_BOTTLENECKS:
For each high-impact performance issue:
- Issue Name and Classification
- Severity: [Critical/High/Medium/Low]
- Location: Line numbers and code snippets
- Problem Description: What causes the bottleneck
- Performance Impact: CPU/Memory/Latency implications
- Current Complexity: Big O analysis where applicable
- Optimization Strategy: Specific improvement approach
- Optimized Code Example: Show improved implementation
- Expected Improvement: Quantified performance gain

OPTIMIZATION_RECOMMENDATIONS:
- Immediate optimizations (quick wins)
- Algorithmic improvements
- Data structure optimizations
- Caching strategies
- Resource management improvements
- Concurrency enhancements

MEASUREMENT_STRATEGY:
- Key performance metrics to track
- Profiling recommendations
- Benchmarking approach
- Performance testing suggestions
</output_format>

<severity_criteria>
Use these criteria for impact assessment:

CRITICAL: Operations causing exponential complexity, major memory leaks, blocking operations in critical paths
HIGH: O(n²) algorithms on large datasets, excessive memory allocation, database query inefficiencies
MEDIUM: Redundant calculations, suboptimal data structures, minor memory waste
LOW: Micro-optimizations, style improvements with minimal performance impact
</severity_criteria>

<optimization_principles>
Apply these performance optimization principles:

ALGORITHMIC_EFFICIENCY: Choose optimal algorithms and data structures for the use case
LAZY_EVALUATION: Defer expensive operations until absolutely necessary
CACHING_STRATEGY: Cache frequently accessed data and expensive computations
BATCH_OPERATIONS: Combine multiple operations to reduce overhead
RESOURCE_POOLING: Reuse expensive resources like database connections
ASYNCHRONOUS_PROCESSING: Use non-blocking operations where appropriate
MEMORY_LOCALITY: Optimize for CPU cache efficiency
EARLY_TERMINATION: Exit loops and operations as soon as possible
</optimization_principles>

<context_considerations>
Consider these factors when analyzing single file performance:

- Function call frequency and usage patterns
- Data size expectations and scaling characteristics
- Runtime environment constraints
- Framework overhead that may not be visible
- Dependencies on external systems
- Note assumptions about broader application architecture
</context_considerations>

Analyze the provided source code file and deliver a comprehensive performance assessment following this framework.

<source_code>
${fileContent}
</source_code>
    `;
  }
}

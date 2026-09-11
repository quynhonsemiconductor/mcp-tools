import { z } from 'zod';
import { Prompt } from '../../registry/prompts';
import { PromptHandler } from '../../registry/prompts/types';
import { CatchErrors } from '../../utils';

/**
 * Prompt for testing MCP tools using direct MCP calls
 */
@Prompt({
  id: 'test-mcp-tools',
  name: 'Test MCP Tools with Direct Calls',
  description:
    'Guide for testing MCP tool implementations using direct MCP tool calls to validate functionality with real data',
  category: 'Analysis',

  arguments: {
    tool_name: z
      .string()
      .describe('Name of the MCP tool to test (e.g., getWeatherForecast, searchCode)'),
    feature_description: z
      .string()
      .describe(
        'Description of the feature or enhancement being tested (e.g., "includeMilestones parameter for epics")',
      ),
    test_data_ids: z
      .string()
      .describe('Comma-separated list of test data IDs to use (e.g., "E45109,F208282,US501397")')
      .optional(),
  },
})
export class TestMcpTools implements PromptHandler {
  /**
   * Generate the prompt template for testing MCP tools
   */
  @CatchErrors()
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  async load(args: Record<string, any>): Promise<string> {
    const toolName = args.tool_name;
    const featureDescription = args.feature_description;
    const testDataIds = args.test_data_ids || 'Discover appropriate test data';

    return `
You are a quality assurance expert specializing in testing Model Context Protocol (MCP) tools. Your task is to validate the functionality of MCP tools by making direct MCP tool calls (not by writing code or scripts).

<testing_objective>
Tool to Test: ${toolName}
Feature Description: ${featureDescription}
Test Data: ${testDataIds}
</testing_objective>

<testing_methodology>
Follow this systematic approach to test MCP tools:

PHASE 1: DISCOVERY
- Identify what MCP tools are available to you
- Understand the tool's parameters and expected behavior
- Review tool descriptions and parameter documentation
- Identify related tools that may be needed for comprehensive testing

PHASE 2: BASELINE TESTING
- Make initial tool calls WITHOUT the new feature/parameter
- Document the baseline behavior and response structure
- Establish what "normal" responses look like
- Identify all fields present in baseline responses

PHASE 3: FEATURE TESTING
- Make tool calls WITH the new feature/parameter enabled
- Document the enhanced behavior and response structure
- Compare with baseline to identify changes
- Verify new fields/data are present and correctly formatted

PHASE 4: EDGE CASE TESTING
- Test with empty or missing data (graceful handling)
- Test with multiple data points (arrays, collections)
- Test with incompatible object types (error handling)
- Test combined with other parameters (integration)

PHASE 5: VALIDATION
- Verify data accuracy by cross-referencing with direct queries
- Compare embedded data with standalone object queries
- Check for consistency across different object types
- Validate backward compatibility (no breaking changes)
</testing_methodology>

<mcp_call_guidelines>
When making MCP tool calls:

DO:
✅ Make ACTUAL tool calls using the MCP tools available to you
✅ Use REAL data IDs and object identifiers
✅ Document EXACT responses (copy actual JSON/data)
✅ Test multiple scenarios (success, empty, error cases)
✅ Compare before/after responses side-by-side
✅ Verify field presence, structure, and values
✅ Test backward compatibility explicitly

DO NOT:
❌ Write code or scripts to test
❌ Use hypothetical or mock data
❌ Assume responses without testing
❌ Skip edge cases or error scenarios
❌ Forget to test without the new feature (baseline)
</mcp_call_guidelines>

<test_scenarios>
Design comprehensive test scenarios:

SCENARIO 1: POSITIVE CASE
- Description: Feature works as expected with valid input
- Test Data: Valid object IDs that should have the requested data
- Expected: New fields/data present, correctly formatted
- Validation: Compare with direct object query

SCENARIO 2: EMPTY DATA CASE
- Description: Feature handles missing data gracefully
- Test Data: Valid object IDs that don't have the requested data
- Expected: Empty arrays or null values (not errors)
- Validation: No errors, graceful degradation

SCENARIO 3: UNSUPPORTED TYPE CASE
- Description: Feature handles incompatible object types
- Test Data: Object types that don't support the feature
- Expected: Empty data or helpful warning (not crash)
- Validation: System remains stable

SCENARIO 4: MULTIPLE DATA CASE
- Description: Feature handles multiple related items
- Test Data: Objects with multiple related items (arrays)
- Expected: All items returned, correct count
- Validation: All expected items present

SCENARIO 5: BACKWARD COMPATIBILITY
- Description: Existing functionality unchanged
- Test Data: Same objects as Scenario 1, but without new feature
- Expected: Response identical to before feature was added
- Validation: No new fields when feature not requested

SCENARIO 6: COMBINED PARAMETERS
- Description: Feature works with other parameters
- Test Data: Same objects with multiple enhancement options
- Expected: All requested enhancements present
- Validation: No conflicts or missing data

SCENARIO 7: DATA ACCURACY
- Description: Enhanced data matches source of truth
- Test Data: Query related objects directly and compare
- Expected: Embedded data matches standalone queries
- Validation: Field-by-field comparison
</test_scenarios>

<documentation_format>
Document each test in this format:

### Test N: [Test Scenario Name]

**Objective:** [What this test validates]

**Tool Call:**
\`\`\`json
{
  "tool": "${toolName}",
  "parameters": {
    "objectId": "...",
    "newParameter": true
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "FieldName": "...",
  "NewData": [...]
}
\`\`\`

**Observations:**
- ✅ Expected behavior observed: [Details]
- 📊 Data count: [Number of items returned]
- 🔍 Fields present: [List new fields]
- ⚠️ Issues found: [Any problems or concerns]

**Pass/Fail:** ✅ PASS / ❌ FAIL

**Notes:** [Additional context or findings]
</documentation_format>

<comparison_analysis>
For before/after testing, use this format:

| Aspect | Before Feature | After Feature | Status |
|--------|---------------|---------------|---------|
| Field Name | [Value or "Not present"] | [Value or structure] | ✅/❌ |
| Response Time | [Time] | [Time] | ✅/❌ |
| Data Count | [Count] | [Count] | ✅/❌ |
| Error Rate | [Rate] | [Rate] | ✅/❌ |

**Analysis:**
- What changed: [List changes]
- Backward compatible: [Yes/No with explanation]
- Breaking changes: [None/List if any]
</comparison_analysis>

<validation_checklist>
After testing, verify:

FUNCTIONALITY:
□ Feature works as documented
□ Parameters accepted correctly
□ Response structure matches specification
□ All expected fields present
□ Field values accurate and formatted correctly

EDGE CASES:
□ Empty data handled gracefully
□ Missing fields handled appropriately
□ Unsupported types don't cause errors
□ Multiple items handled correctly
□ Null/undefined values handled safely

INTEGRATION:
□ Works with other parameters
□ No conflicts with existing features
□ Related tools still work correctly
□ Cross-references validate correctly

COMPATIBILITY:
□ No breaking changes introduced
□ Existing queries unchanged
□ Default behavior preserved
□ Optional parameters truly optional

QUALITY:
□ Data accuracy verified
□ Performance acceptable
□ Error messages helpful
□ Documentation matches behavior
</validation_checklist>

<test_report_format>
Provide a comprehensive test report:

## Test Report: ${toolName} - ${featureDescription}

### Executive Summary
- **Tests Performed:** [Number]
- **Pass Rate:** [Percentage]
- **Critical Issues:** [Count]
- **Overall Status:** ✅ PASS / ⚠️ PARTIAL / ❌ FAIL

### Test Environment
- **Tool Name:** ${toolName}
- **Feature Tested:** ${featureDescription}
- **Test Date:** [Date]
- **Test Method:** Direct MCP tool calls

### Test Results Summary

#### Test 1: [Name]
[Details]

#### Test 2: [Name]
[Details]

[...continue for all tests...]

### Findings

**What Works:**
- ✅ [List successful aspects]

**Issues Found:**
- ❌ [List problems discovered]

**Edge Cases:**
- ⚠️ [List edge case behaviors]

### Data Accuracy Validation
[Comparison with source data]

### Performance Observations
- Response time: [Average time]
- Data volume: [Size of responses]
- Resource usage: [Any concerns]

### Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]

### Conclusion
[Final assessment of feature readiness]
</test_report_format>

<best_practices>
Follow these testing best practices:

SYSTEMATIC APPROACH:
- Test incrementally (simple to complex)
- Document every test call and response
- Compare actual vs expected behavior
- Validate data accuracy against source

REAL DATA USAGE:
- Use production or production-like data
- Test with diverse data sets
- Include edge cases in test data
- Verify data across different scenarios

COMPREHENSIVE COVERAGE:
- Test all parameters and combinations
- Include positive and negative cases
- Verify error handling and edge cases
- Check backward compatibility explicitly

CLEAR DOCUMENTATION:
- Record exact tool calls made
- Copy actual responses (not summaries)
- Document unexpected behavior
- Provide context for failures

VALIDATION RIGOR:
- Cross-reference data with direct queries
- Verify field presence and accuracy
- Check data types and formats
- Validate business logic correctness
</best_practices>

<common_issues>
Watch for these common issues:

DATA ISSUES:
- Fields filtered out unintentionally
- Data transformations losing information
- Inconsistent field naming
- Missing fields in some scenarios

PARAMETER ISSUES:
- Parameters not recognized
- Default values not working
- Parameter combinations conflicting
- Required vs optional confusion

RESPONSE ISSUES:
- Response structure inconsistent
- Error messages unclear
- Empty vs null vs missing handling
- Array vs single object confusion

COMPATIBILITY ISSUES:
- Breaking changes to existing behavior
- New fields appearing when not requested
- Changed default behavior
- Removed or renamed fields
</common_issues>

Now, proceed to test the ${toolName} tool focusing on the ${featureDescription} feature. Make direct MCP tool calls, document your findings, and provide a comprehensive test report.

Remember: Make ACTUAL tool calls - do not write code or scripts. Use the MCP tools available to you directly.
    `;
  }
}

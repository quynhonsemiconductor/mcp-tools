/**
 * Status of a registry item call (tool or prompt)
 */
export type CallStatus = 'success' | 'failure';

/**
 * Type of registry item
 */
export type ItemType = 'tool' | 'prompt';

/**
 * Interface for registry call records (tools and prompts)
 */
export interface RegistryCall {
  id?: number;
  itemId: string;
  itemType: ItemType;
  payload: string;
  runTimeMs: number;
  status?: CallStatus;
  result?: string;
  source?: string;
  timestamp?: number;
  appVersion?: string;
  /**
   * Tool/prompt category for analytics segmentation.
   * @example 'Utility', 'Web', 'Slack'
   */
  category?: string;
  /**
   * Tool provider type indicating how the tool is loaded/hosted.
   * @example 'native' (built-in), 'bundled' (packaged MCP), 'remote' (external MCP server), 'local' (user-configured MCP)
   */
  provider?: string;
  /**
   * Transport session ID for scoping client info in multi-session scenarios (httpStream).
   * Not persisted to the database; used only for telemetry span attribution.
   */
  sessionId?: string;
}

/**
 * Status of a tool call
 * @deprecated Use CallStatus instead
 */
export type ToolCallStatus = CallStatus;

/**
 * Interface for tool call records
 * @deprecated Use RegistryCall instead
 */
export interface ToolCall {
  id?: number;
  toolId: string;
  payload: string;
  runTimeMs: number;
  status?: ToolCallStatus;
  result?: string;
  source?: string;
  timestamp?: number;
  appVersion?: string;
}

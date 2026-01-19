/**
 * Get the appropriate chat endpoint based on environment configuration
 * @returns The chat endpoint URL
 */
export function getChatEndpoint(): string {
  // Streaming removed: always use REST endpoint
  return '/chat/query';
}

/**
 * Get the test agent endpoint for our enhanced agent testing
 * @returns The test agent endpoint URL
 */
export function getTestAgentEndpoint(): string {
  // Streaming removed: test agent uses REST endpoint
  return '/chat/query';
}

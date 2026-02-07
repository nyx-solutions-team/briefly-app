// Environment variables for agent configuration
export const AGENT_CONFIG = {
  // Use the new enhanced agent routes
  USE_ENHANCED_AGENT: process.env.NEXT_PUBLIC_USE_ENHANCED_AGENT === 'true',
  
  // Default to server-side agent
  USE_SERVER_AGENT: process.env.NEXT_PUBLIC_USE_SERVER_AGENT !== '0',
  
  // API endpoints
  CHAT_ENDPOINT: process.env.NEXT_PUBLIC_USE_ENHANCED_AGENT === 'true' 
    ? '/chat/ask-v2' 
    : '/chat/ask'
};
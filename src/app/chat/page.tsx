'use client';

import React, { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/layout/app-layout';
import { useAuth } from '@/hooks/use-auth';
import { AccessDenied } from '@/components/access-denied';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
// import removed old PromptInput UI
import { Loader } from '@/components/ai-elements/loader';
import { InlineCitation, InlineCitationCard, InlineCitationCardTrigger, InlineCitationCardBody, InlineCitationCarousel, InlineCitationCarouselContent, InlineCitationCarouselItem, InlineCitationSource } from '@/components/ai-elements/inline-citation';
import { ssePost } from '@/lib/api';
import { useSettings } from '@/hooks/use-settings';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ChatContext } from '@/components/chat-context-selector';
import { createFolderChatEndpoint } from '@/lib/folder-utils';
import BrieflyChatBox from '@/components/ai-elements/briefly-chat-box';
import { useDocuments } from '@/hooks/use-documents';

// Helper functions to improve citation display
function getCitationDisplayTitle(citation: any): string {
  const rawTitle = citation?.title || citation?.name || citation?.docName;
  if (rawTitle) {
    const cleaned = rawTitle.includes(': ') ? rawTitle.split(': ').slice(1).join(': ') : rawTitle;
    if (cleaned.trim().length > 0 && cleaned !== `Document ${citation?.docId?.slice(0, 8)}...`) {
      return cleaned;
    }
  }

  const fields = citation?.fields || {};
  const titleField = fields.title || fields.subject || fields.name;
  if (titleField) return titleField;

  return 'Referenced Document';
}

function getCitationDisplayDescription(citation: any): string {
  const snippet = citation?.snippet || citation?.description || citation?.summary;
  if (snippet && !/^referenced in/i.test(snippet)) {
    return snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet;
  }

  const fields = citation?.fields || {};
  const usefulFields = ['description', 'excerpt', 'sender', 'receiver', 'date', 'category'];
  const parts: string[] = [];
  usefulFields.forEach(field => {
    if (fields[field]) {
      parts.push(`${field}: ${fields[field]}`);
    }
  });

  return parts.slice(0, 2).join(' • ') || 'Click to view document details';
}

// Function to process content and reorder citations inline  
function processContentWithCitations(content: string, citations: any[] = []) {
  if (!content || typeof content !== 'string') return content;
  
  // Pattern to match citation markdown like [^1], [^2], etc.
  const citationMDPattern = /\[\^(\d+)\]/g;
  // Pattern to match raw document IDs like [03bb980a-5e3c-4aac-b631-1cd9b158b763]
  const uuidPattern = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;
  
  const mdMatches = Array.from(content.matchAll(citationMDPattern));
  const uuidMatches = Array.from(content.matchAll(uuidPattern));
  
  // Combine both patterns and sort by index
  const allMatches = [...uuidMatches, ...mdMatches].sort((a, b) => a.index - b.index);
  
  if (allMatches.length === 0) {
    // No citations, just return content normal
    return <Response className="inline">{content}</Response>;
  }
  
  // Process the text, capturing each cite section and non-cite text
  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  
  allMatches.forEach((match, index) => {
    const citationNum = match[1]; // Could be "1" for markdown or UUID string for doc ID
    const matchIdx = match.index!;
    const matchLength = match[0].length;
    
    // Add text before the citation
    if (matchIdx > lastIdx) {
      const textBefore = content.slice(lastIdx, matchIdx);
      if (textBefore) {
        elements.push(
          <Response key={`text-${index}`} className="inline">
            {textBefore}
          </Response>
        );
      }
    }
    
    // Find the citation (handle both markdown [^N] format and UUID format)
    let citation;
    if (citationMDPattern.test(match[0])) {
      // This is markdown [^1], [^2], etc.
      const num = parseInt(citationNum);
      citation = citations && citations[num - 1];
    } else {
      // This is a UUID document ID
      citation = citations && citations.find(cit => cit.docId === citationNum);
    }
    
    if (citation) {
      elements.push(
        <InlineCitation key={`cite-${citationNum}`}>
          <InlineCitationCard>
            <InlineCitationCardTrigger 
              sources={citation.docId ? [`/documents/${citation.docId}`] : []}
              className="inline-flex ml-1"
            >
              <Badge variant="secondary" className="text-xs">
                [^{
                  citationMDPattern.test(match[0]) 
                    ? citationNum 
                    : (citations.findIndex(cit => cit.docId === citationNum) + 1) || '?'
                }]
              </Badge>
            </InlineCitationCardTrigger>
            <InlineCitationCardBody className="w-80">
              <InlineCitationCarousel>
                <InlineCitationCarouselContent>
                  <InlineCitationCarouselItem>
                    <InlineCitationSource
                      title={getCitationDisplayTitle(citation)}
                      description={getCitationDisplayDescription(citation)}
                      url={`/documents/${citation.docId}`}
                    />
                  </InlineCitationCarouselItem>
                </InlineCitationCarouselContent>
              </InlineCitationCarousel>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>
      );
    } else {
      // Fallback for missing citation
      elements.push(
        <span key={`missing-${index}`} className="text-blue-600 font-semibold inline ml-1 text-xs">
          [^{
            citationMDPattern.test(match[0]) 
              ? citationNum 
              : (citations.findIndex(cit => cit.docId === citationNum) + 1) || '?'
          }]
        </span>
      );
    }
    
    lastIdx = matchIdx + matchLength;
  });
  
  // Add any remaining text after the last citation
  if (lastIdx < content.length) {
    const remainingText = content.slice(lastIdx);
    if (remainingText) {
      elements.push(
        <Response key="text-end" className="inline">
          {remainingText}
        </Response>
      );
    }
  }
  
  return <span className="inline">{elements}</span>;
}

function getThemeColors(accentColor: string) {
  const colorMap: Record<string, {
    primary: string;
    secondary: string;
    gradient: string;
    iconBg: string;
    buttonBg: string;
    buttonHover: string;
  }> = {
    default: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-purple-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    red: {
      primary: 'text-red-600 dark:text-red-400',
      secondary: 'text-red-700 dark:text-red-300',
      gradient: 'from-red-600 to-pink-600',
      iconBg: 'bg-red-100 dark:bg-red-800/40',
      buttonBg: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
      buttonHover: 'hover:bg-red-50 dark:hover:bg-red-900/20'
    },
    rose: {
      primary: 'text-rose-600 dark:text-rose-400',
      secondary: 'text-rose-700 dark:text-rose-300',
      gradient: 'from-rose-600 to-pink-600',
      iconBg: 'bg-rose-100 dark:bg-rose-800/40',
      buttonBg: 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700',
      buttonHover: 'hover:bg-rose-50 dark:hover:bg-rose-900/20'
    },
    orange: {
      primary: 'text-orange-600 dark:text-orange-400',
      secondary: 'text-orange-700 dark:text-orange-300',
      gradient: 'from-orange-600 to-red-600',
      iconBg: 'bg-orange-100 dark:bg-orange-800/40',
      buttonBg: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-700',
      buttonHover: 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
    },
    amber: {
      primary: 'text-amber-600 dark:text-amber-400',
      secondary: 'text-amber-700 dark:text-amber-300',
      gradient: 'from-amber-600 to-orange-600',
      iconBg: 'bg-amber-100 dark:bg-amber-800/40',
      buttonBg: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700',
      buttonHover: 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
    },
    yellow: {
      primary: 'text-yellow-600 dark:text-yellow-400',
      secondary: 'text-yellow-700 dark:text-yellow-300',
      gradient: 'from-yellow-600 to-amber-600',
      iconBg: 'bg-yellow-100 dark:bg-yellow-800/40',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700',
      buttonHover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
    },
    lime: {
      primary: 'text-lime-600 dark:text-lime-400',
      secondary: 'text-lime-700 dark:text-lime-300',
      gradient: 'from-lime-600 to-green-600',
      iconBg: 'bg-lime-100 dark:bg-lime-800/40',
      buttonBg: 'bg-lime-600 hover:bg-lime-700 dark:bg-lime-600 dark:hover:bg-lime-700',
      buttonHover: 'hover:bg-lime-50 dark:hover:bg-lime-900/20'
    },
    green: {
      primary: 'text-green-600 dark:text-green-400',
      secondary: 'text-green-700 dark:text-green-300',
      gradient: 'from-green-600 to-emerald-600',
      iconBg: 'bg-green-100 dark:bg-green-800/40',
      buttonBg: 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700',
      buttonHover: 'hover:bg-green-50 dark:hover:bg-green-900/20'
    },
    emerald: {
      primary: 'text-emerald-600 dark:text-emerald-400',
      secondary: 'text-emerald-700 dark:text-emerald-300',
      gradient: 'from-emerald-600 to-teal-600',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800/40',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700',
      buttonHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
    },
    teal: {
      primary: 'text-teal-600 dark:text-teal-400',
      secondary: 'text-teal-700 dark:text-teal-300',
      gradient: 'from-teal-600 to-cyan-600',
      iconBg: 'bg-teal-100 dark:bg-teal-800/40',
      buttonBg: 'bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700',
      buttonHover: 'hover:bg-teal-50 dark:hover:bg-teal-900/20'
    },
    cyan: {
      primary: 'text-cyan-600 dark:text-cyan-400',
      secondary: 'text-cyan-700 dark:text-cyan-300',
      gradient: 'from-cyan-600 to-blue-600',
      iconBg: 'bg-cyan-100 dark:bg-cyan-800/40',
      buttonBg: 'bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-700',
      buttonHover: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/20'
    },
    sky: {
      primary: 'text-sky-600 dark:text-sky-400',
      secondary: 'text-sky-700 dark:text-sky-300',
      gradient: 'from-sky-600 to-blue-600',
      iconBg: 'bg-sky-100 dark:bg-sky-800/40',
      buttonBg: 'bg-sky-600 hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-700',
      buttonHover: 'hover:bg-sky-50 dark:hover:bg-sky-900/20'
    },
    blue: {
      primary: 'text-blue-600 dark:text-blue-400',
      secondary: 'text-blue-700 dark:text-blue-300',
      gradient: 'from-blue-600 to-indigo-600',
      iconBg: 'bg-blue-100 dark:bg-blue-800/40',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
      buttonHover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
    },
    indigo: {
      primary: 'text-indigo-600 dark:text-indigo-400',
      secondary: 'text-indigo-700 dark:text-indigo-300',
      gradient: 'from-indigo-600 to-purple-600',
      iconBg: 'bg-indigo-100 dark:bg-indigo-800/40',
      buttonBg: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700',
      buttonHover: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
    },
    violet: {
      primary: 'text-violet-600 dark:text-violet-400',
      secondary: 'text-violet-700 dark:text-violet-300',
      gradient: 'from-violet-600 to-purple-600',
      iconBg: 'bg-violet-100 dark:bg-violet-800/40',
      buttonBg: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700',
      buttonHover: 'hover:bg-violet-50 dark:hover:bg-violet-900/20'
    },
    purple: {
      primary: 'text-purple-600 dark:text-purple-400',
      secondary: 'text-purple-700 dark:text-purple-300',
      gradient: 'from-purple-600 to-violet-600',
      iconBg: 'bg-purple-100 dark:bg-purple-800/40',
      buttonBg: 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700',
      buttonHover: 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
    },
    fuchsia: {
      primary: 'text-fuchsia-600 dark:text-fuchsia-400',
      secondary: 'text-fuchsia-700 dark:text-fuchsia-300',
      gradient: 'from-fuchsia-600 to-pink-600',
      iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40',
      buttonBg: 'bg-fuchsia-600 hover:bg-fuchsia-700 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-700',
      buttonHover: 'hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20'
    },
    pink: {
      primary: 'text-pink-600 dark:text-pink-400',
      secondary: 'text-pink-700 dark:text-pink-300',
      gradient: 'from-pink-600 to-rose-600',
      iconBg: 'bg-pink-100 dark:bg-pink-800/40',
      buttonBg: 'bg-pink-600 hover:bg-pink-700 dark:bg-pink-600 dark:hover:bg-pink-700',
      buttonHover: 'hover:bg-pink-50 dark:hover:bg-pink-900/20'
    },
  };
  return colorMap[accentColor] || colorMap.default;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ docId: string; docName?: string }>;
  isStreaming?: boolean;
}

export default function TestAgentEnhancedPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial_msg',
      role: 'assistant',
      content: "Hello! I'm your Briefly Agent with enhanced AI-powered capabilities! 🚀"
    }
  ]);
  
  const [currentTaskSteps, setCurrentTaskSteps] = useState<any[]>([]);
  const [currentTools, setCurrentTools] = useState<any[]>([]);
  const taskStepsRef = useRef<any[]>(currentTaskSteps);
  const toolsRef = useRef<any[]>(currentTools);
  useEffect(() => {
    taskStepsRef.current = currentTaskSteps;
  }, [currentTaskSteps]);
  useEffect(() => {
    toolsRef.current = currentTools;
  }, [currentTools]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [lastListDocIds, setLastListDocIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [chatContext, setChatContext] = useState<ChatContext>({ type: 'org' });
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const hasUserMessage = messages.some(m => m.role === 'user');
  const { documents: allDocs, folders: allFolders, getFolderMetadata } = useDocuments();
  const { bootstrapData } = useAuth();
  
  // Check page permission with fallback for backward compatibility
  const permissions = bootstrapData?.permissions || {};
  const canAccessChat = permissions['pages.chat'] !== false; // Default true if not set
  
  // Show access denied if no permission
  if (!canAccessChat && bootstrapData) {
    return (
      <AppLayout>
        <AccessDenied message="You don't have permission to access the chat page." />
      </AppLayout>
    );
  }
  const folderOptions = allFolders
    .filter(p => p.length > 0)
    .map(p => {
      const id = p.join('/');
      const meta = getFolderMetadata(p);
      return { id, name: meta?.title || p[p.length - 1] || id, path: p };
    });
  const documentOptions = allDocs.map(d => ({ id: d.id, name: d.title || d.name || 'Untitled' }));
  const selectedFolderId =
    chatContext.type === 'folder'
      ? chatContext.folderPath?.join('/') || chatContext.path?.join('/') || null
      : null;
  const selectedDocumentId =
    chatContext.type === 'document'
      ? chatContext.id || null
      : null;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Ensure a fresh sessionId per page load
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  const handleSubmit = async (input: string, overrideContext?: ChatContext) => {
    if (!input.trim() || isLoading) return;

    const effectiveContext = overrideContext || chatContext;
    console.log('Submitting message:', input, 'Context:', effectiveContext);
    console.log('🔍 ChatContext details:', {
      type: effectiveContext.type,
      id: effectiveContext.id,
      name: effectiveContext.name,
      folderPath: effectiveContext.folderPath,
      path: effectiveContext.path
    });
    
    try {
      // Determine endpoint based on context using the new folder resolution system
      const endpoint = await createFolderChatEndpoint(effectiveContext);
      console.log('✅ Using endpoint:', endpoint);
      
      // Add user message
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: input
      };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Add assistant message placeholder
    const assistantId = `assistant_${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    console.log('Added assistant message placeholder');

    try {
      let streamingContent = '';
      
      // Reset task steps and tools for new query
      setCurrentTaskSteps([]);
      setCurrentTools([]);
      taskStepsRef.current = [];
      toolsRef.current = [];
      
      // Ensure a stable session id for this page session
      const ensuredSessionId = sessionId || (typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2));
      if (!sessionId) setSessionId(ensuredSessionId);

      await ssePost(endpoint, {
        session_id: ensuredSessionId,
        question: input,
        conversation: messages.map(m => ({
          role: m.role,
          content: m.content,
          citations: m.citations
        })),
        memory: {
          lastListDocIds: lastListDocIds,
          focusDocIds: [],
          lastCitedDocIds: [],
          sessionId: ensuredSessionId
        },
        context: {
          scope: chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'org',
          includeSubfolders: true,
          includeLinked: false,
          includeVersions: false
        },
        filters: {},
        strictCitations: false,
        webSearchEnabled: webSearchEnabled
      }, (event) => {
        if (event.event === 'message' && event.data) {
          try {
            // Ensure we have a proper data object
            let data;
            if (typeof event.data === 'string') {
              // Try to parse as JSON
              try {
                data = JSON.parse(event.data);
              } catch (jsonError) {
                console.warn('Failed to parse JSON data:', event.data);
                return; // Skip this event
              }
            } else if (typeof event.data === 'object' && event.data !== null) {
              data = event.data;
            } else {
              console.warn('Invalid event data type:', typeof event.data, event.data);
              return; // Skip this event
            }

            // Ensure data has a type property
            if (!data || typeof data !== 'object' || !data.type) {
              console.warn('Invalid data object:', data);
              return; // Skip this event
            }

            console.log('Processing streaming data:', data.type, data);
            console.log('Current streamingContent:', streamingContent);
            
            if (data.type === 'task_step') {
              // Update task steps
              setCurrentTaskSteps(prev => {
                const next = (() => {
                  const existing = prev.find(step => step.step === data.step);
                  if (existing) {
                    return prev.map(step =>
                      step.step === data.step ? { ...step, ...data } : step
                    );
                  }
                  return [...prev, data];
                })();
                taskStepsRef.current = next;
                return next;
              });
            } else if (data.type === 'tool_usage') {
              // Update tools used
              setCurrentTools(prev => {
                const next = (() => {
                  const existing = prev.find(tool => tool.name === data.name);
                  if (existing) {
                    return prev.map(tool =>
                      tool.name === data.name ? { ...tool, ...data } : tool
                    );
                  }
                  return [...prev, data];
                })();
                toolsRef.current = next;
                return next;
              });
            } else if (data.type === 'content' && data.chunk) {
              streamingContent += data.chunk;
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { ...m, content: streamingContent }
                  : m
              ));
            } else if (data.type === 'tool_call' && data.message) {
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { ...m, content: streamingContent + `\n\n🔍 ${data.message}` }
                  : m
              ));
            } else if (data.type === 'complete') {
              const finalContent = data.full_content || streamingContent;
              const citations = data.citations || [];
              
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { 
                      ...m, 
                      content: finalContent,
                      citations: citations,
                      isStreaming: false,
                      tools: (Array.isArray(data.tools) && data.tools.length > 0) ? data.tools : toolsRef.current,
                      reasoning: data.reasoning || data.agentInsights?.join('\n'),
                      agent: data.agent || 'Smart Assistant',
                      processingSteps: (Array.isArray(data.processingSteps) && data.processingSteps.length > 0)
                        ? data.processingSteps
                        : taskStepsRef.current
                    }
                  : m
              ));
              
              // Keep the processing steps and tools visible in the message
              // Don't clear them - they should remain visible
              
              // Update lastListDocIds for follow-up questions
              if (citations.length > 0) {
                setLastListDocIds(citations.map((c: any) => c.docId).slice(0, 5));
              }

              // Persist session id for continuity
              if (data.sessionId || data.session_id) {
                setSessionId(data.sessionId || data.session_id);
              }
            } else if (data.type === 'error') {
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { 
                      ...m, 
                      content: streamingContent + `\n\n❌ **Error**: ${data.error}`,
                      isStreaming: false,
                      processingSteps: taskStepsRef.current,
                      tools: toolsRef.current
                    }
                  : m
              ));
              
              // Keep processing steps visible even on error
              // Don't clear them - they show what was attempted
            } else {
              // Handle any other data types - don't add to content
              console.log('Unhandled data type:', data.type, data);
            }
          } catch (error) {
            console.error('Error processing streaming data:', error, event.data);
            // Don't add unparsed data to content
          }
        }
      });
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { 
              ...m, 
              content: `❌ **Error**: ${error instanceof Error ? error.message : 'Something went wrong'}`,
              isStreaming: false
            }
          : m
      ));
    } finally {
      setIsLoading(false);
      setInputValue(''); // Clear input after submission
      // Don't clear task steps and tools - they should remain visible in the message
    }
    } catch (error) {
      console.error('Error in endpoint resolution:', error);
      setIsLoading(false);
      setInputValue('');
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-6xl mx-auto px-4">
        {/* Minimal Header */}
        <div className="flex items-center justify-center py-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${themeColors.iconBg} flex items-center justify-center`}>
              <Bot className={`h-4 w-4 ${themeColors.primary}`} />
            </div>
      <div className="text-center">
              <h1 className="text-lg font-semibold text-foreground">Briefly Agent</h1>
              <p className="text-xs text-muted-foreground">AI-powered document assistant</p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        {hasUserMessage ? (
          <div className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1 px-4 [scrollbar-gutter:stable]" ref={scrollAreaRef}>
              <div className="max-w-5xl mx-auto py-6 space-y-6 pb-40">
                {messages.map((message) => {
                console.log('Rendering message:', message);
                return (
                  <Message
                    key={message.id}
                    from={message.role}
                    className="w-full"
                  >
                    <MessageContent variant="flat">
                      {message.role === 'user' ? (
                        <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                          {message.content}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Agent activity timeline (steps + tools + reasoning) */}
                          {(() => {
                            const activitySteps = message.isStreaming ? currentTaskSteps : (message as any).processingSteps || [];
                            const timelineItems = activitySteps.map((step: any, index: number) => ({ type: 'step' as const, data: step, index }));
                            if (timelineItems.length === 0) return null;

                            const statusBadge = (status?: string) => {
                              if (status === 'completed') return 'Done';
                              if (status === 'error') return 'Failed';
                              return 'In progress';
                            };

                            const indicatorClass = (status?: string) => cn(
                              'inline-flex h-2.5 w-2.5 rounded-full',
                              status === 'completed'
                                ? 'bg-emerald-500'
                                : status === 'error'
                                ? 'bg-red-500'
                                : 'bg-amber-500'
                            );

                            return (
                              <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium text-muted-foreground">
                                    Agent Activity
                                  </div>
                                  <Badge variant="outline" className="text-[11px]">
                                    {message.isStreaming ? 'Live' : 'Complete'}
                                  </Badge>
                                </div>

                                <div className="space-y-3">
                                  {timelineItems.map((item: any) => {
                                    if (item.type === 'step') {
                                      const step = item.data;
                                      return (
                                        <div key={`step-${step.step}-${item.index}`} className="flex gap-3">
                                          <div className="mt-1">
                                            <span className={indicatorClass(step.status)} />
                                          </div>
                                          <div className="flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="text-sm font-medium text-foreground">{step.title}</span>
                                              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                                                {statusBadge(step.status)}
                                              </span>
                                            </div>
                                            {/* Subtext intentionally omitted per UX request */}
      </div>
    </div>
                                      );
                                    }

                                    return null;
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Main Response Content */}
                          {message.content && (
                            <div className="space-y-3">
                              <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                                {processContentWithCitations(message.content, message.citations)}
                              </div>

                            </div>
                          )}

                          {/* Loading State - Only show for complex queries with task steps */}
                          {message.isStreaming && !message.content && currentTaskSteps.some(step => step.step === 'search_documents') && (
                            <Loader className={themeColors.primary} />
                          )}

                          {/* Tool Usage - Show only while streaming */}
                          {/* Tools hidden in streamlined UI */}

                          {/* Sources and Citations */}
                          {message.citations && message.citations.length > 0 && (
                            <details className="group rounded-lg border border-border/40 bg-background/60 p-4">
                              <summary className="flex items-center justify-between cursor-pointer list-none">
                                <div>
                                  <p className="text-sm font-semibold text-muted-foreground">Sources</p>
                                  <p className="text-xs text-muted-foreground">
                                    Used {message.citations.length} source{message.citations.length > 1 ? 's' : ''}
                                  </p>
                                </div>
                                <Badge variant="outline" className="text-[11px]">
                                  View
                                </Badge>
                              </summary>
                              <div className="mt-4 grid gap-3">
                                {message.citations.map((citation, index) => {
                                  const title = getCitationDisplayTitle(citation);
                                  const description = getCitationDisplayDescription(citation);
                                  return (
                                    <div
                                      key={`${citation.docId}-${index}`}
                                      className="rounded-md border border-border/40 bg-card/60 px-3 py-2 flex items-center justify-between gap-3"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{title}</p>
                                        {description && (
                                          <p className="text-xs text-muted-foreground truncate">{description}</p>
                                        )}
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                          ID: {citation.docId?.slice(0, 12)}{citation.docId && citation.docId.length > 12 ? '…' : ''}
                                        </p>
                                      </div>
                                      {citation.docId && (
                                        <Button variant="secondary" size="sm" asChild>
                                          <a href={`/documents/${citation.docId}`} target="_blank" rel="noopener noreferrer">
                                            Open
                                          </a>
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                );
                })}

              </div>
            </ScrollArea>

            {/* Input Area - Sticky after conversation starts */}
            <div className="sticky bottom-0 border-t border-border/40 bg-background/50 backdrop-blur-sm transition-all duration-300">
              <div className="w-full max-w-5xl mx-auto p-4">
                <BrieflyChatBox
                  folders={folderOptions}
                  documents={documentOptions}
                  defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                  defaultWebSearch={webSearchEnabled}
                  defaultFolderId={selectedFolderId}
                  defaultDocumentId={selectedDocumentId}
                  placeholder={
                    chatContext.type === 'document'
                      ? `Ask about "${chatContext.name || 'this document'}"...`
                      : chatContext.type === 'folder'
                      ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                      : 'Ask me about your documents or anything else...'
                  }
                  sending={isLoading}
                  onSend={({ text, mode, folderId, documentId, webSearch }) => {
                    let nextContext: ChatContext = { type: 'org' };
                    if (mode === 'folder' && folderId) {
                      const path = folderId.split('/').filter(Boolean);
                      const meta = getFolderMetadata(path);
                      nextContext = { type: 'folder', id: meta?.id, name: meta?.title || folderId, folderPath: path };
                    } else if (mode === 'document' && documentId) {
                      const doc = allDocs.find(d => d.id === documentId);
                      nextContext = { type: 'document', id: documentId, name: doc?.title || doc?.name };
                    }
                    setChatContext(nextContext);
                    setWebSearchEnabled(webSearch);
                    handleSubmit(text, nextContext);
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          // Centered input before the first user message, like ChatGPT
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center">
              <div className="w-full max-w-5xl mx-auto px-4">
                <div className="transition-all duration-300">
                  <BrieflyChatBox
                    folders={folderOptions}
                    documents={documentOptions}
                    defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                    defaultWebSearch={webSearchEnabled}
                    defaultFolderId={selectedFolderId}
                    defaultDocumentId={selectedDocumentId}
                    placeholder={
                      chatContext.type === 'document'
                        ? `Ask about "${chatContext.name || 'this document'}"...`
                        : chatContext.type === 'folder'
                        ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                        : 'Ask me about your documents or anything else...'
                    }
                    sending={isLoading}
                    onSend={({ text, mode, folderId, documentId, webSearch }) => {
                      let nextContext: ChatContext = { type: 'org' };
                      if (mode === 'folder' && folderId) {
                        const path = folderId.split('/').filter(Boolean);
                        const meta = getFolderMetadata(path);
                        nextContext = { type: 'folder', id: meta?.id, name: meta?.title || folderId, folderPath: path };
                      } else if (mode === 'document' && documentId) {
                        const doc = allDocs.find(d => d.id === documentId);
                        nextContext = { type: 'document', id: documentId, name: doc?.title || doc?.name };
                      }
                      setChatContext(nextContext);
                      setWebSearchEnabled(webSearch);
                      handleSubmit(text, nextContext);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

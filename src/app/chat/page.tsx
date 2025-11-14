'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselPrev,
  InlineCitationCarouselNext,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { ssePost } from '@/lib/api';
import { useSettings } from '@/hooks/use-settings';
import { Bot, FileText, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ChatContext } from '@/components/chat-context-selector';
import { createFolderChatEndpoint } from '@/lib/folder-utils';
import BrieflyChatBox from '@/components/ai-elements/briefly-chat-box';
import { useDocuments } from '@/hooks/use-documents';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

// Helper functions to improve citation display
function getHostname(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function getCitationDisplayTitle(citation: any): string {
  const rawTitle = citation?.title || citation?.name || citation?.docName;
  if (rawTitle) {
    const cleaned = rawTitle.includes(': ') ? rawTitle.split(': ').slice(1).join(': ') : rawTitle;
    if (cleaned.trim().length > 0 && cleaned !== `Document ${citation?.docId?.slice(0, 8)}...`) {
      return cleaned;
    }
  }

  const hostname = getHostname(citation?.url);
  if (hostname) {
    return hostname;
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

  if (citation?.url) {
    return citation.url;
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

function dedupeCitations(citations: CitationMeta[] = []): CitationMeta[] {
  const seen = new Set<string>();
  const result: CitationMeta[] = [];

  for (const citation of citations) {
    if (!citation) continue;
    const key = citation.docId
      ? `doc:${citation.docId}`
      : citation.url
      ? `url:${citation.url}`
      : `text:${citation.docName || citation.title || citation.snippet || JSON.stringify(citation)}`;

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(citation);
  }

  return result;
}

type ProcessingStep = {
  step?: string;
  title?: string;
  status?: string;
  description?: string;
  task?: string;
  category?: string;
};

type ToolUsage = {
  name?: string;
  status?: string;
  description?: string;
};

function dedupeSteps(steps: ProcessingStep[] = []): ProcessingStep[] {
  const seen = new Set<string>();
  const result: ProcessingStep[] = [];

  steps.forEach((step, idx) => {
    if (!step) return;
    const key = (step.step || step.title || `step-${idx}`).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      status: step.status || 'completed',
      ...step
    });
  });

  return result;
}

function dedupeTools(tools: ToolUsage[] = []): ToolUsage[] {
  const seen = new Set<string>();
  const result: ToolUsage[] = [];

  tools.forEach((tool, idx) => {
    if (!tool) return;
    const key = (tool.name || `tool-${idx}`).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      status: tool.status || 'completed',
      ...tool
    });
  });

  return result;
}

function buildActivityInsights(
  message: Message,
  streamingSteps: ProcessingStep[],
  streamingTools: ToolUsage[]
) {
  if (message.isStreaming) {
    return {
      steps: dedupeSteps(streamingSteps),
      tools: dedupeTools(streamingTools)
    };
  }

  const citations = dedupeCitations(message.citations || []);
  const hasDocs = citations.some(cit => cit.docId);
  const hasWeb = citations.some(cit => cit.sourceType === 'web' || (!cit.docId && !!cit.url));

  const backendSteps = dedupeSteps((message as any).processingSteps || []);
  const backendTools = dedupeTools((message as any).tools || []);

  const steps: ProcessingStep[] = [];
  const tools: ToolUsage[] = [];

  const addStep = (step: ProcessingStep) => {
    const key = (step.step || step.title || '').toLowerCase();
    if (!key) return;
    if (steps.some(existing => (existing.step || existing.title || '').toLowerCase() === key)) return;
    steps.push(step);
  };

  const addTool = (tool: ToolUsage) => {
    const key = (tool.name || '').toLowerCase();
    if (!key) return;
    if (tools.some(existing => (existing.name || '').toLowerCase() === key)) return;
    tools.push(tool);
  };

  if (hasDocs || hasWeb) {
    backendSteps.forEach(addStep);
    backendTools.forEach(addTool);
  }

  if (hasDocs) {
    addStep({
      step: 'document_analysis',
      title: 'Document analysis',
      description: 'Read and summarized relevant internal documents',
      status: 'completed'
    });
    addTool({
      name: 'document_retriever',
      status: 'completed',
      description: 'Vector search across organization documents'
    });
    addTool({
      name: 'document_analyzer',
      status: 'completed',
      description: 'Summarized and reasoned over retrieved docs'
    });
  }

  if (hasWeb) {
    addStep({
      step: 'web_search',
      title: 'Web search',
      description: 'Pulled current articles from trusted news sources',
      status: 'completed'
    });
    addTool({
      name: 'web_search',
      status: 'completed',
      description: 'DuckDuckGo recent-news lookup'
    });
  }

  return { steps, tools };
}

// Function to render assistant content with inline citation components
function processContentWithCitations(content: string, citations: any[] = []) {
  if (!content || typeof content !== 'string') return content;
  const normalizedCitations = dedupeCitations(citations);

  const collapseSingleTrailingNewline = (text: string) => {
    if (/\n\s*$/.test(text) && !/\n\s*\n\s*$/.test(text)) {
      return text.replace(/\n\s*$/, ' ');
    }
    return text;
  };

  // Create a map of citation numbers to citation objects (1-based indexing)
  const citationMap = new Map<number, any>();
  normalizedCitations.forEach((citation, index) => {
    citationMap.set(index + 1, citation);
  });

  // Collect all citation positions and components
  const citationData: Array<{ index: number; component: JSX.Element; length: number }> = [];
  const citationPattern = /\[\^(\d+(?:\s*,\s*\^?\d+)*)\]/g;
  let match;

  while ((match = citationPattern.exec(content)) !== null) {
    // Parse citation numbers from the match
    const citationNumbers = match[1]
      .split(',')
      .map(num => parseInt(num.replace(/\^/g, '').trim(), 10))
      .filter(num => !isNaN(num));

    // Get citations for these numbers
    const matchedCitations = citationNumbers
      .map(num => citationMap.get(num))
      .filter(Boolean);

      if (matchedCitations.length > 0) {
        // Create URLs and titles for the citations
        const sourceData = matchedCitations.map((cit: any) => ({
          url: cit.docId ? `/documents/${cit.docId}` : (cit.url || ''),
          title: getCitationDisplayTitle(cit),
          citation: cit
        })).filter(item => item.url);

      if (sourceData.length > 0) {
        const sourceUrls = sourceData.map(item => item.url);
        const firstTitle = sourceData[0].title;
        const extraCount = sourceData.length > 1 ? sourceData.length - 1 : 0;
        
        citationData.push({
          index: match.index,
          length: match[0].length,
          component: (
            <InlineCitation key={`citation-${match.index}`} className="inline">
              <InlineCitationCard>
                <InlineCitationCardTrigger 
                  sources={sourceUrls}
                  title={firstTitle}
                  extraCount={extraCount}
                />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselHeader>
                      <InlineCitationCarouselPrev />
                      <InlineCitationCarouselNext />
                      <InlineCitationCarouselIndex />
                    </InlineCitationCarouselHeader>
                    <InlineCitationCarouselContent>
                      {matchedCitations.map((cit: any, idx: number) => (
                        <InlineCitationCarouselItem key={`${cit.docId || cit.url || 'citation'}-${idx}`}>
                          <InlineCitationSource
                            title={getCitationDisplayTitle(cit)}
                            url={cit.docId ? `/documents/${cit.docId}` : cit.url}
                            description={getCitationDisplayDescription(cit)}
                          />
                        </InlineCitationCarouselItem>
                      ))}
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </InlineCitation>
          )
        });
      }
    }
  }

  // If no citations found, clean and return
  if (citationData.length === 0) {
    const cleaned = content
      .replace(/\s*\[\^\d+\]/g, '')
      .replace(/\s*\[\^\d+(?:\s*,\s*\d+)*\]/g, '')
      .replace(/\s*\[\^\?\]/g, '')
      .replace(/\s*\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/gi, '')
      .replace(/^\[\^\d+\]:.*$/gm, '')
      .trim();
    return <Response className="inline">{cleaned}</Response>;
  }

  // Sort citations by index (forward order)
  citationData.sort((a, b) => a.index - b.index);

  // Build parts array by splitting at citation positions
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  for (const citation of citationData) {
    // Add text before citation
    if (citation.index > lastIndex) {
      let textBefore = content.slice(lastIndex, citation.index);
      textBefore = collapseSingleTrailingNewline(textBefore);
      if (textBefore) {
        parts.push(textBefore);
      }
    }
    
    // Add citation component
    parts.push(citation.component);
    
    lastIndex = citation.index + citation.length;
  }

  // Add remaining text after last citation
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    if (textAfter) {
      parts.push(textAfter);
    }
  }

  // Render: combine consecutive strings, render markdown blocks together
  // Keep everything inline to prevent line breaks
  const renderedParts: JSX.Element[] = [];
  let currentText = '';

  for (const part of parts) {
    if (typeof part === 'string') {
      currentText += part;
    } else {
      // Render accumulated text as markdown
      if (currentText) {
        renderedParts.push(
          <Response
            key={`text-${renderedParts.length}`}
            className="inline w-auto h-auto align-baseline [&_p]:inline [&_p]:m-0"
          >
            {currentText}
          </Response>
        );
        currentText = '';
      }
      // Add citation component (already inline)
      renderedParts.push(part);
    }
  }

  // Render any remaining text
  if (currentText) {
    renderedParts.push(
      <Response
        key={`text-${renderedParts.length}`}
        className="inline w-auto h-auto align-baseline [&_p]:inline [&_p]:m-0"
      >
        {currentText}
      </Response>
    );
  }

  return <span className="inline">{renderedParts}</span>;
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

interface CitationMeta {
  docId?: string | null;
  docName?: string;
  title?: string;
  snippet?: string;
  url?: string;
  sourceType?: 'document' | 'web' | string;
  fields?: Record<string, any>;
  folderPath?: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: CitationMeta[];
  isStreaming?: boolean;
}

const INITIAL_ASSISTANT_TEXT = "Hello! I'm your Briefly Agent with enhanced AI-powered capabilities! 🚀";

const buildInitialMessages = (): Message[] => [
  {
    id: `initial_${Date.now()}`,
    role: 'assistant',
    content: INITIAL_ASSISTANT_TEXT
  }
];

export default function TestAgentEnhancedPage() {
  const [messages, setMessages] = useState<Message[]>(() => buildInitialMessages());
  
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
  const [isWebSearchDialogOpen, setIsWebSearchDialogOpen] = useState(false);
  const [pendingWebSearchToggle, setPendingWebSearchToggle] = useState<boolean | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const themeColors = getThemeColors(settings.accent_color);
  const hasUserMessage = messages.some(m => m.role === 'user');
  const { documents: allDocs, folders: allFolders, getFolderMetadata } = useDocuments();
  const { bootstrapData } = useAuth();

  const resetChatSession = useCallback(() => {
    setMessages(buildInitialMessages());
    setCurrentTaskSteps([]);
    setCurrentTools([]);
    taskStepsRef.current = [];
    toolsRef.current = [];
    setLastListDocIds([]);
    setIsLoading(false);
    setInputValue('');
    const nextSessionId =
      typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
        ? (crypto as any).randomUUID()
        : Math.random().toString(36).slice(2);
    setSessionId(nextSessionId);
  }, []);

  const handleWebSearchChange = useCallback((nextValue: boolean) => {
    if (nextValue === webSearchEnabled) return;
    if (nextValue) {
      if (!hasUserMessage) {
        resetChatSession();
        setWebSearchEnabled(true);
        return;
      }
      setPendingWebSearchToggle(true);
      setIsWebSearchDialogOpen(true);
    } else {
      setWebSearchEnabled(false);
    }
  }, [hasUserMessage, resetChatSession, webSearchEnabled]);

  const confirmWebSearchEnable = useCallback(() => {
    if (pendingWebSearchToggle) {
      resetChatSession();
      setWebSearchEnabled(true);
    }
    setPendingWebSearchToggle(null);
    setIsWebSearchDialogOpen(false);
  }, [pendingWebSearchToggle, resetChatSession]);

  const cancelWebSearchEnable = useCallback(() => {
    setPendingWebSearchToggle(null);
    setIsWebSearchDialogOpen(false);
  }, []);
  
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

    const scopeType =
      effectiveContext.type === 'folder'
        ? 'folder'
        : effectiveContext.type === 'document'
        ? 'document'
        : 'org';

    const contextPayload: any = {
      scope: scopeType,
      includeSubfolders: true,
      includeLinked: false,
      includeVersions: false
    };

    if (scopeType === 'document') {
      if (effectiveContext.id) {
        contextPayload.docId = effectiveContext.id;
      }
    } else if (scopeType === 'folder') {
      if (effectiveContext.id) {
        contextPayload.folderId = effectiveContext.id;
      }
      const folderPath = effectiveContext.folderPath || effectiveContext.path;
      if (folderPath?.length) {
        contextPayload.folderPath = folderPath;
      }
    }
    
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
        context: contextPayload,
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
              const citations = dedupeCitations(data.citations || []);
              const baseSteps = Array.isArray(data.processingSteps) && data.processingSteps.length > 0
                ? data.processingSteps
                : taskStepsRef.current;
              const baseTools = Array.isArray(data.tools) && data.tools.length > 0
                ? data.tools
                : toolsRef.current;
              
              setMessages(prev => prev.map(m => {
                if (m.id !== assistantId) return m;
                
                const derivedInsights = buildActivityInsights(
                  { ...m, citations, isStreaming: false },
                  baseSteps,
                  baseTools
                );
                
                return { 
                  ...m, 
                  content: finalContent,
                  citations: citations,
                  isStreaming: false,
                  tools: derivedInsights.tools,
                  reasoning: data.reasoning || data.agentInsights?.join('\n'),
                  agent: data.agent || 'Smart Assistant',
                  processingSteps: derivedInsights.steps
                };
              }));
              
              // Keep the processing steps and tools visible in the message
              // Don't clear them - they should remain visible
              
              // Update lastListDocIds for follow-up questions
              if (citations.length > 0) {
                const docOnlyIds = citations
                  .map((c: any) => c.docId)
                  .filter((id: string | null | undefined): id is string => Boolean(id));
                if (docOnlyIds.length > 0) {
                  setLastListDocIds(docOnlyIds.slice(0, 5));
                }
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
                      processingSteps: dedupeSteps(taskStepsRef.current),
                      tools: dedupeTools(toolsRef.current)
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
              <div className="max-w-5xl mx-auto py-8 space-y-8 pb-40">
                {messages.map((message, idx) => {
                console.log('Rendering message:', message);
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "animate-in fade-in slide-in-from-bottom-4 duration-700",
                      "group w-full flex gap-3 sm:gap-4"
                    )}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    {message.role === 'user' ? (
                      <>
                        {/* User Message - Right aligned */}
                        <div className="flex-1 flex justify-end">
                          <div className={cn(
                            "max-w-[85%] sm:max-w-[75%]",
                            "rounded-2xl rounded-tr-md px-4 py-3.5",
                            "bg-gradient-to-br from-primary/90 to-primary",
                            "text-primary-foreground shadow-lg shadow-primary/25",
                            "border border-primary/20",
                            "transition-all duration-300 hover:shadow-xl hover:shadow-primary/30",
                            "backdrop-blur-sm"
                          )}>
                            <div className="prose prose-sm max-w-none text-primary-foreground [&>*]:text-primary-foreground">
                              {message.content}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* AI Message - Left aligned with avatar */}
                        <div className="flex-shrink-0">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center",
                            "bg-gradient-to-br shadow-md border border-border/50",
                            themeColors.gradient.includes('blue') && "from-blue-500/10 via-indigo-500/10 to-purple-500/10",
                            themeColors.gradient.includes('green') && "from-green-500/10 via-emerald-500/10 to-teal-500/10",
                            themeColors.gradient.includes('purple') && "from-purple-500/10 via-fuchsia-500/10 to-pink-500/10",
                            !themeColors.gradient.includes('blue') && !themeColors.gradient.includes('green') && !themeColors.gradient.includes('purple') && "from-muted/50 to-muted/30"
                          )}>
                            <Bot className={cn("h-4 w-4", themeColors.primary)} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 space-y-4">
                          {/* Agent activity using Task component */}
                          {(() => {
                            const { steps: activitySteps, tools } = buildActivityInsights(
                              message,
                              currentTaskSteps,
                              currentTools
                            );
                            const hasSteps = activitySteps.length > 0;
                            const hasTools = tools.length > 0;
                            
                            if (!hasSteps && !hasTools) return null;

                            return (
                              <div className="space-y-3">
                                {/* Processing Steps Task */}
                                {hasSteps && (() => {
                                  // Group steps by task or show as single task
                                  const hasMultipleTasks = activitySteps.some((step: any) => step.task || step.category);
                                  
                                  if (hasMultipleTasks) {
                                    // Group by task/category
                                    const grouped = activitySteps.reduce((acc: any, step: any) => {
                                      const key = step.task || step.category || 'general';
                                      if (!acc[key]) {
                                        acc[key] = [];
                                      }
                                      acc[key].push(step);
                                      return acc;
                                    }, {});

                                    return (
                                      <>
                                        {Object.entries(grouped).map(([taskKey, steps]: [string, any]) => (
                                          <Task key={taskKey} defaultOpen={taskKey === Object.keys(grouped)[0]}>
                                            <TaskTrigger title={steps[0]?.task || steps[0]?.category || 'Processing'} />
                                            <TaskContent>
                                              {steps.map((step: any, index: number) => (
                                                <TaskItem key={`${step.step}-${index}`}>
                                                  {step.description || step.title}
                                                  {step.status === 'completed' && ' ✓'}
                                                  {step.status === 'error' && ' ✗'}
                                                </TaskItem>
                                              ))}
                                            </TaskContent>
                                          </Task>
                                        ))}
                                      </>
                                    );
                                  }

                                  // Single task with all steps
                                  return (
                                    <Task defaultOpen={true}>
                                      <TaskTrigger title="Processing Steps" />
                                      <TaskContent>
                                        {activitySteps.map((step: any, index: number) => (
                                          <TaskItem key={`${step.step}-${index}`}>
                                            {step.description || step.title}
                                            {step.status === 'completed' && ' ✓'}
                                            {step.status === 'error' && ' ✗'}
                                            {step.status === 'in_progress' && ' ⏳'}
                                          </TaskItem>
                                        ))}
                                      </TaskContent>
                                    </Task>
                                  );
                                })()}

                                {/* Tools Task */}
                                {hasTools && (
                                  <Task defaultOpen={hasSteps ? false : true}>
                                    <TaskTrigger title="Tools Used" />
                                    <TaskContent>
                                      {tools.map((tool: any, index: number) => (
                                        <TaskItem key={`tool-${tool.name}-${index}`}>
                                          {tool.name || tool.tool}
                                          {tool.description && ` - ${tool.description}`}
                                          {tool.status === 'completed' && ' ✓'}
                                          {tool.status === 'error' && ' ✗'}
                                          {tool.status === 'running' && ' ⏳'}
                                        </TaskItem>
                                      ))}
                                    </TaskContent>
                                  </Task>
                                )}
                              </div>
                            );
                          })()}

                          {/* Main Response Content - Enhanced typography */}
                          {message.content && (
                            <div className={cn(
                              "space-y-3 rounded-2xl p-5",
                              "bg-gradient-to-br from-card/50 to-transparent",
                              "border border-border/30",
                              "transition-all duration-300 hover:border-border/50"
                            )}>
                              <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&>p]:leading-relaxed [&>p]:text-[15px]">
                                {processContentWithCitations(message.content, message.citations)}
                              </div>
                            </div>
                          )}

                          {/* Loading State - Shimmer animation */}
                          {message.isStreaming && !message.content && currentTaskSteps.some(step => step.step === 'search_documents') && (
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/20 border border-border/30">
                              <div className="flex gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '300ms' }} />
                              </div>
                              <Shimmer as="span" className="text-sm" duration={2}>
                                Thinking...
                              </Shimmer>
                            </div>
                          )}

                          {/* Sources and Citations - Elegant collapsible */}
                          {message.citations && message.citations.length > 0 && (
                            <details className={cn(
                              "group rounded-2xl border border-border/40 p-4",
                              "bg-gradient-to-br from-muted/20 to-transparent",
                              "transition-all duration-300 hover:border-border/60 hover:shadow-sm"
                            )}>
                              <summary className="flex items-center justify-between cursor-pointer list-none select-none">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                    "bg-gradient-to-br from-primary/10 to-primary/5",
                                    "border border-primary/20"
                                  )}>
                                    <FileText className={cn("h-4 w-4", themeColors.primary)} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">Sources</p>
                                    <p className="text-xs text-muted-foreground">
                                      {message.citations.length} source{message.citations.length > 1 ? 's' : ''} referenced
                                    </p>
                                  </div>
                                </div>
                                <Badge 
                                  variant="outline" 
                                  className="text-[11px] border-0 bg-muted/50 group-open:bg-primary/10 group-open:text-primary transition-all"
                                >
                                  <ChevronDown className="h-3 w-3 mr-1 transition-transform duration-300 group-open:rotate-180" />
                                  View
                                </Badge>
                              </summary>
                              <div className="mt-4 grid gap-2.5">
                                {message.citations.map((citation, index) => {
                                  const title = getCitationDisplayTitle(citation);
                                  const description = getCitationDisplayDescription(citation);
                                  const isWebSource = citation?.sourceType === 'web' || (!citation?.docId && !!citation?.url);
                                  const linkTarget = citation?.docId
                                    ? `/documents/${citation.docId}`
                                    : citation?.url || undefined;
                                  const identifier = isWebSource
                                    ? getHostname(citation?.url) || 'web'
                                    : citation.docId?.slice(0, 16);
                                  return (
                                    <div
                                      key={`${citation.docId || citation.url || 'citation'}-${index}`}
                                      className={cn(
                                        "rounded-xl border border-border/40 p-3.5 flex items-center justify-between gap-3",
                                        "bg-gradient-to-br from-card/80 to-card/40",
                                        "transition-all duration-300 hover:shadow-md hover:border-border/60 hover:-translate-y-0.5"
                                      )}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm font-medium text-foreground mb-1">{title}</p>
                                          <span className={cn(
                                            "text-[10px] px-2 py-0.5 rounded-full border",
                                            isWebSource ? "border-amber-400/60 text-amber-600 dark:text-amber-400" : "border-primary/40 text-primary"
                                          )}>
                                            {isWebSource ? 'Web' : 'Document'}
                                          </span>
                                        </div>
                                        {description && (
                                          <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                                        )}
                                        {identifier && (
                                          <p className="text-[10px] text-muted-foreground/70 mt-2 font-mono">
                                            {identifier}{citation.docId && citation.docId.length > 16 ? '...' : ''}
                                          </p>
                                        )}
                                      </div>
                                      {linkTarget && (
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className={cn(
                                            "rounded-lg shadow-sm shrink-0",
                                            themeColors.buttonHover
                                          )} 
                                          asChild
                                        >
                                          <a href={linkTarget} target="_blank" rel="noopener noreferrer">
                                            {isWebSource ? 'Open link →' : 'Open document →'}
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
                      </>
                    )}
                  </div>
                );
                })}

              </div>
            </ScrollArea>

            {/* Input Area - Floating with elegant shadow */}
            <div className={cn(
              "sticky bottom-0 pt-4 pb-6",
              "bg-gradient-to-t from-background via-background to-transparent",
              "transition-all duration-300"
            )}>
              <div className="w-full max-w-5xl mx-auto px-4">
                <div className={cn(
                  "animate-in fade-in slide-in-from-bottom-4 duration-500",
                  "shadow-2xl shadow-black/10 dark:shadow-black/40",
                  "rounded-3xl"
                )}>
                  <BrieflyChatBox
                    folders={folderOptions}
                    documents={documentOptions}
                    defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                    defaultWebSearch={webSearchEnabled}
                    webSearch={webSearchEnabled}
                    onWebSearchChange={handleWebSearchChange}
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
        ) : (
          // Beautiful empty state with centered input
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-5xl mx-auto px-4">
                {/* Welcome Message */}
                <div className="mb-12 text-center animate-in fade-in slide-in-from-top-4 duration-700">
                  <div className="mb-6 inline-flex items-center justify-center">
                    <div className={cn(
                      "w-20 h-20 rounded-3xl flex items-center justify-center",
                      "bg-gradient-to-br shadow-2xl shadow-primary/30 border-2 border-primary/30",
                      "animate-in zoom-in duration-1000",
                      themeColors.gradient.includes('blue') && "from-blue-500/20 via-indigo-500/20 to-purple-500/20",
                      themeColors.gradient.includes('green') && "from-green-500/20 via-emerald-500/20 to-teal-500/20",
                      themeColors.gradient.includes('purple') && "from-purple-500/20 via-fuchsia-500/20 to-pink-500/20",
                      !themeColors.gradient.includes('blue') && !themeColors.gradient.includes('green') && !themeColors.gradient.includes('purple') && "from-primary/20 via-primary/10 to-primary/20"
                    )}>
                      <Sparkles className={cn("h-10 w-10", themeColors.primary)} />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
                    What can I help you with?
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    Ask me anything about your documents. I can search, summarize, and provide insights.
                  </p>
                  
                  {/* Quick action suggestions */}
                  <div className="mt-8 flex flex-wrap justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                    {[
                      'Summarize recent documents',
                      'Find information about...',
                      'Compare documents',
                    ].map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInputValue(suggestion)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl text-sm font-medium",
                          "border border-border/50 bg-muted/30",
                          "transition-all duration-300",
                          "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md hover:-translate-y-0.5",
                          "active:translate-y-0"
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Box */}
                <div className={cn(
                  "animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300",
                  "shadow-2xl shadow-black/10 dark:shadow-black/40",
                  "rounded-3xl"
                )}>
                  <BrieflyChatBox
                    folders={folderOptions}
                    documents={documentOptions}
                    defaultMode={chatContext.type === 'folder' ? 'folder' : chatContext.type === 'document' ? 'document' : 'all'}
                    defaultWebSearch={webSearchEnabled}
                    webSearch={webSearchEnabled}
                    onWebSearchChange={handleWebSearchChange}
                    defaultFolderId={selectedFolderId}
                    defaultDocumentId={selectedDocumentId}
                    placeholder={
                      chatContext.type === 'document'
                        ? `Ask about "${chatContext.name || 'this document'}"...`
                        : chatContext.type === 'folder'
                        ? `Ask about documents in "${chatContext.name || 'this folder'}"...`
                        : 'Type your question here...'
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

      <Dialog
        open={isWebSearchDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            cancelWebSearchEnable();
          } else {
            setIsWebSearchDialogOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enable web search?</DialogTitle>
            <DialogDescription>
              Turning on web search starts a fresh chat session so the assistant can cite live articles.
              Continue and reset the current conversation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button variant="outline" onClick={cancelWebSearchEnable}>
              Cancel
            </Button>
            <Button onClick={confirmWebSearchEnable}>
              Enable web search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getApiContext } from '@/lib/api';

export default function EnhancedAgentTest() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; type?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      const { orgId } = getApiContext();
      if (!orgId) throw new Error('No organization selected');

      // Use the new enhanced agent endpoint
      const response = await fetch(`/api/orgs/${orgId}/chat/ask-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          conversation: messages.slice(-5), // Last 5 messages for context
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      const assistantMessage = { role: 'assistant', content: data.answer || data.content || 'No response' };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to get response from the agent',
        variant: 'destructive',
      });
      const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Enhanced Agent Test</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Thinking...' : 'Ask'}
            </Button>
          </form>
          
          <ScrollArea className="h-96 rounded-md border p-4">
            <div className="space-y-4">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg ${
                    msg.role === 'user' 
                      ? 'bg-blue-100 dark:bg-blue-900 ml-10' 
                      : 'bg-gray-100 dark:bg-gray-800 mr-10'
                  }`}
                >
                  <div className="font-semibold mb-1">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div>{msg.content}</div>
                </div>
              ))}
              {isLoading && (
                <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 mr-10">
                  <div className="font-semibold mb-1">Assistant</div>
                  <div>Thinking...</div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Folder, Globe, Search, X, Check, Clock, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocuments } from '@/hooks/use-documents';

export type ChatContext = {
  type: 'org' | 'document' | 'folder';
  id?: string;
  name?: string;
  folderPath?: string[];
  // Legacy support for 'path'
  path?: string[];
};

interface ChatContextSelectorProps {
  value: ChatContext;
  onChange: (context: ChatContext) => void;
  className?: string;
  restrictTo?: 'folder' | 'document';
}

export function ChatContextSelector({ value, onChange, className, restrictTo }: ChatContextSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { documents, folders, getDocumentsInPath, listFolders } = useDocuments();

  const contextOptions = [
    {
      type: 'org' as const,
      name: 'All Documents',
      description: 'Search across all documents in your organization',
      icon: Globe,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
    },
    {
      type: 'folder' as const,
      name: 'Specific Folder',
      description: 'Search within a specific folder',
      icon: Folder,
      color: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
    },
    {
      type: 'document' as const,
      name: 'Specific Document',
      description: 'Chat about a specific document',
      icon: FileText,
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
    }
  ];

  const getContextDisplay = () => {
    switch (value.type) {
      case 'org':
        return {
          icon: Globe,
          text: 'All Documents',
          color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
        };
      case 'document':
        return {
          icon: FileText,
          text: value.name || 'Select Document',
          color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'
        };
      case 'folder':
        return {
          icon: Folder,
          text: value.name || 'Select Folder',
          color: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
        };
    }
  };

  const handleContextSelect = (type: ChatContext['type'], id?: string, name?: string, path?: string[]) => {
    onChange({ type, id, name, folderPath: path });
    setIsOpen(false);
    setSearchQuery('');
  };

  const effectiveType = (restrictTo ?? value.type);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents.slice(0, 20);
    
    const query = searchQuery.toLowerCase();
    return documents.filter(doc => 
      doc.title?.toLowerCase().includes(query) ||
      doc.subject?.toLowerCase().includes(query) ||
      doc.sender?.toLowerCase().includes(query) ||
      doc.receiver?.toLowerCase().includes(query) ||
      doc.category?.toLowerCase().includes(query) ||
      doc.type?.toLowerCase().includes(query)
    ).slice(0, 20);
  }, [documents, searchQuery]);

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders.slice(0, 20);
    
    const query = searchQuery.toLowerCase();
    return folders.filter(folder => 
      folder.join('/').toLowerCase().includes(query)
    ).slice(0, 20);
  }, [folders, searchQuery]);

  const currentDisplay = getContextDisplay();
  const IconComponent = currentDisplay.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-3 gap-2 text-sm font-medium",
            currentDisplay.color,
            "hover:opacity-80 transition-opacity",
            className
          )}
        >
          <IconComponent className="h-4 w-4" />
          <span className="truncate max-w-[120px]">{currentDisplay.text}</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Choose Chat Context</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select what you want to chat about - all documents, a specific folder, or a specific document.
          </p>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                effectiveType === 'document'
                  ? "Search documents by title, subject, sender..."
                  : effectiveType === 'folder'
                  ? "Search folders by name..."
                  : "Search documents or folders..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-2 text-xs text-muted-foreground">
              {value.type === 'document' && `${filteredDocuments.length} documents found`}
              {value.type === 'folder' && `${filteredFolders.length} folders found`}
              {value.type === 'org' && `${filteredDocuments.length + filteredFolders.length} items found`}
            </div>
          )}
        </div>

        <ScrollArea className="max-h-[400px] px-6">
          <div className="space-y-4 pb-6">
            {/* Context Type Options */}
            {(!restrictTo) && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Chat Scope</h3>
              <div className="grid gap-2">
                {contextOptions.map((option) => {
                  const IconComponent = option.icon;
                  const isSelected = value.type === option.type && !value.id;
                  
                  return (
                    <Card
                      key={option.type}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]",
                        isSelected && "ring-2 ring-primary bg-primary/5"
                      )}
                      onClick={() => handleContextSelect(option.type)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg flex-shrink-0", option.color)}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{option.name}</div>
                            <div className="text-sm text-muted-foreground">{option.description}</div>
                          </div>
                          {isSelected && (
                            <div className="flex-shrink-0">
                              <Check className="h-4 w-4 text-primary" />
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
            )}

            {/* Documents */}
            {(effectiveType === 'document') && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Documents {searchQuery && `(${filteredDocuments.length} found)`}
                </h3>
                <div className="space-y-2">
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="bg-muted/50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="text-muted-foreground mb-2">
                        {searchQuery ? 'No documents found' : 'No documents available'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {searchQuery ? 'Try adjusting your search terms' : 'Upload some documents to get started'}
                      </div>
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const isSelected = value.id === doc.id;
                      
                      return (
                        <Card
                          key={doc.id}
                          className={cn(
                            "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]",
                            isSelected && "ring-2 ring-primary bg-primary/5"
                          )}
                          onClick={() => handleContextSelect('document', doc.id, doc.title)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 p-2 rounded-lg flex-shrink-0">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate mb-1">{doc.title || 'Untitled Document'}</div>
                                <div className="space-y-1">
                                  {doc.subject && (
                                    <div className="text-sm text-muted-foreground truncate">
                                      {doc.subject}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    {doc.sender && (
                                      <div className="flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        <span className="truncate">{doc.sender}</span>
                                      </div>
                                    )}
                                    {doc.documentDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        <span>{new Date(doc.documentDate).toLocaleDateString()}</span>
                                      </div>
                                    )}
                                    {doc.type && (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                        {doc.type}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex-shrink-0">
                                  <Check className="h-4 w-4 text-primary" />
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Folders */}
            {(effectiveType === 'folder') && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Folders {searchQuery && `(${filteredFolders.length} found)`}
                </h3>
                <div className="space-y-2">
                  {filteredFolders.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="bg-muted/50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <Folder className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="text-muted-foreground mb-2">
                        {searchQuery ? 'No folders found' : 'No folders available'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {searchQuery ? 'Try adjusting your search terms' : 'Create some folders to organize your documents'}
                      </div>
                    </div>
                  ) : (
                    filteredFolders.map((folder, index) => {
                      const folderPath = folder.join('/');
                      const isSelected = value.folderPath?.join('/') === folderPath;
                      
                      return (
                        <Card
                          key={index}
                          className={cn(
                            "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]",
                            isSelected && "ring-2 ring-primary bg-primary/5"
                          )}
                          onClick={() => handleContextSelect('folder', undefined, folderPath, folder)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400 p-2 rounded-lg flex-shrink-0">
                                <Folder className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate mb-1">{folderPath || 'Root Folder'}</div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    <span>{getDocumentsInPath(folder).length} documents</span>
                                  </div>
                                  {folder.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      <span>{folder.length} levels deep</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex-shrink-0">
                                  <Check className="h-4 w-4 text-primary" />
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

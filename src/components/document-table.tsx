"use client";

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MoreVertical,
  FileText,
  ImageIcon,
  FileCode,
  Download,
  Trash2,
  Eye,
  FileClock,
  Pen,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import { formatAppDateTime } from '@/lib/utils';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { apiFetch, getApiContext } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const typeIcons: Record<string, React.ReactNode> = {
  PDF: <FileText className="h-5 w-5 text-red-500" />,
  Image: <ImageIcon className="h-5 w-5 text-blue-500" />,
  Word: <FileCode className="h-5 w-5 text-blue-700" />,
  Drawing: <Pen className="h-5 w-5 text-orange-500" />,
  'Government Circular': <FileText className="h-5 w-5 text-yellow-600" />,
  Invoice: <FileText className="h-5 w-5 text-green-600" />,
  folder: <FileText className="h-5 w-5 text-purple-500" />,
};

export default function DocumentTable({ documents, onDelete }: { documents: Document[]; onDelete?: (id: string) => void }) {
  const { toast } = useToast();
  const { orgId } = getApiContext();

  const reingest = async (docId: string) => {
    if (!orgId) { toast({ title: 'No org selected', variant: 'destructive' }); return; }
    try {
      await apiFetch(`/orgs/${orgId}/documents/${docId}/reingest`, { method: 'POST' });
      toast({ title: 'Re-ingest started', description: 'Processing will run in the background.' });
    } catch (e: any) {
      toast({ title: 'Re-ingest failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">Name</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden xl:table-cell">Semantic</TableHead>
                <TableHead className="hidden lg:table-cell">Uploaded</TableHead>
                <TableHead className="hidden md:table-cell">Version</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium w-[45%]">
                    <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 group">
                      <div className="hidden sm:block shrink-0">{typeIcons[doc.type] || <FileText className="h-5 w-5 text-gray-500" />}</div>
                      <div className="min-w-0">
                        <div title={doc.name} className="truncate font-semibold max-w-[48ch] group-hover:underline">{doc.name}</div>
                        <div className="truncate text-xs text-muted-foreground sm:hidden">
                          {doc.type} - {formatAppDateTime(doc.uploadedAt)}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{doc.type}</Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {doc.semanticReady ? (
                      <Badge className="bg-emerald-600 text-emerald-50 hover:bg-emerald-600">Ready</Badge>
                    ) : (
                      <Badge variant="secondary">Processing</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatAppDateTime(doc.uploadedAt)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center">
                    <Badge variant="secondary">{doc.version}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {doc.keywords.slice(0, 2).map((keyword) => (
                        <Badge key={keyword} variant="outline" className="font-normal">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => reingest(doc.id)}>
                          <FileClock className="mr-2 h-4 w-4" /> Re-ingest (OCR + Embeddings)
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <FileClock className="mr-2 h-4 w-4" /> View History
                        </DropdownMenuItem>
                        {onDelete && (
                          <DropdownMenuItem className="text-destructive" onClick={() => onDelete(doc.id)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

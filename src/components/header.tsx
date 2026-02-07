import { Input } from './ui/input';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import UploadDialog from './upload-dialog';
import Link from 'next/link';
import type { StoredDocument } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { FolderOpen } from 'lucide-react';

export default function Header({ onNewDocument }: { onNewDocument: (doc: StoredDocument) => void }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
      <PageHeader title="Documents" backHref="/dashboard" backLabel="Back to Dashboard" icon={<FolderOpen className="h-5 w-5" />} />
      <div className="flex flex-1 items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents..." className="pl-10" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>PDF</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Image</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Word</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>
                Government Circular
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Invoice</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <UploadDialog onNewDocument={onNewDocument} />
      </div>
    </header>
  );
}

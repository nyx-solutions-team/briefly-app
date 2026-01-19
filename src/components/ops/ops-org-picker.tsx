"use client";

import { useState } from 'react';
import { ChevronsUpDown, Loader2, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useOpsFilters } from './ops-filters-context';

export default function OpsOrgPicker() {
  const { orgId, orgName, setOrgId, orgs, orgsLoading } = useOpsFilters();
  const [open, setOpen] = useState(false);

  const displayName = orgId ? orgName : 'All organizations';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 min-w-[180px] justify-between"
          aria-label="Choose organization filter"
        >
          <span className="flex items-center gap-2 truncate">
            <Building className="h-4 w-4 text-muted-foreground" />
            <span className="truncate text-sm">{displayName}</span>
          </span>
          {orgsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="end">
        <Command>
          <CommandInput placeholder="Search orgs" autoFocus className="h-9" />
          <CommandList>
            <CommandEmpty>No organizations found.</CommandEmpty>
            <CommandGroup heading="Filter">
              <CommandItem
                value="all"
                onSelect={() => {
                  setOrgId('');
                  setOpen(false);
                }}
              >
                All organizations
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Organizations">
              {orgs.map((org) => (
                <CommandItem
                  key={org.id}
                  value={org.name}
                  onSelect={() => {
                    setOrgId(org.id);
                    setOpen(false);
                  }}
                >
                  {org.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

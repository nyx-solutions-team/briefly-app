"use client";

import { useState } from "react";
import { Filter, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type MobileFilterButtonProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  activeCount?: number;
  className?: string;
  footer?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type FilterSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: number | string;
};

export function FilterSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-3 text-left hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge !== undefined && badge !== null && badge !== 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {typeof badge === 'number' && badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "transform rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MobileFilterButton({
  children,
  title = "Filters",
  description,
  activeCount = 0,
  className,
  footer,
  open: openProp,
  onOpenChange,
}: MobileFilterButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;

  const setOpen = (nextOpen: boolean) => {
    if (openProp === undefined) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <>
      {/* Floating Filter Button - Mobile Only */}
      <Button
        variant="default"
        size="icon"
        className={cn(
          "fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full shadow-lg md:hidden",
          activeCount > 0 && "ring-2 ring-primary ring-offset-2",
          className
        )}
        onClick={() => setOpen(true)}
        aria-label="Open filters"
      >
        <Filter className="h-5 w-5" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeCount > 9 ? "9+" : activeCount}
          </span>
        )}
      </Button>

      {/* Bottom Sheet for Filters */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-[32px] border-none px-0 pb-6 max-h-[85vh] overflow-hidden flex flex-col"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-center text-center">
              <div>
                <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
                {description && (
                  <SheetDescription className="text-xs mt-1">
                    {description}
                  </SheetDescription>
                )}
              </div>
            </div>
            {activeCount > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {activeCount} filter{activeCount !== 1 ? "s" : ""} active
              </div>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>
          {footer && (
            <div className="px-6 py-4 border-t bg-background/50 backdrop-blur-sm">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

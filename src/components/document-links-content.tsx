"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatAppDateTime } from "@/lib/utils";
import { ExternalLink, Link2, Loader2, Plus, X } from "lucide-react";

export type DocumentLinkEntry = {
  id: string;
  title: string;
  type?: string | null;
  linkType?: string | null;
  linkedAt?: string | null;
  versionNumber?: number | null;
  isCurrentVersion?: boolean;
  directions?: Array<"incoming" | "outgoing">;
};

type DocumentLinksContentProps = {
  links: DocumentLinkEntry[];
  loading?: boolean;
  linkType: string;
  onLinkTypeChange: (value: string) => void;
  onOpenPicker: () => void;
  onRemoveLink: (item: DocumentLinkEntry) => void;
  compact?: boolean;
  busy?: boolean;
  emptyMessage?: string;
  addLabel?: string;
};

function humanizeLinkType(value?: string | null) {
  if (!value) return "Related";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDirectionLabel(directions?: Array<"incoming" | "outgoing">) {
  const unique = Array.from(new Set(directions || []));
  if (unique.length === 2) return "Two-way";
  if (unique[0] === "incoming") return "Incoming";
  if (unique[0] === "outgoing") return "Outgoing";
  return "Linked";
}

export function DocumentLinksContent({
  links,
  loading = false,
  linkType,
  onLinkTypeChange,
  onOpenPicker,
  onRemoveLink,
  compact = false,
  busy = false,
  emptyMessage = "No linked documents yet.",
  addLabel = "Link document",
}: DocumentLinksContentProps) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-2xl border border-border/40 bg-muted/10 p-3",
          compact ? "space-y-3" : "flex items-center justify-between gap-3"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-sm">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {links.length} linked {links.length === 1 ? "document" : "documents"}
            </div>
            <div className="text-xs text-muted-foreground">Direct relationships only</div>
          </div>
        </div>
        <div className={cn("flex gap-2 shrink-0", compact ? "flex-col" : "items-center")}>
          <Select value={linkType} onValueChange={onLinkTypeChange}>
            <SelectTrigger
              className={cn(
                "h-9 rounded-xl border-border/50 bg-background",
                compact ? "w-full" : "w-[148px]"
              )}
            >
              <SelectValue placeholder="Link type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="related">Related</SelectItem>
              <SelectItem value="reference">Reference</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenPicker}
            className={cn(
              "gap-1.5 rounded-xl border-border/50 bg-background",
              compact ? "h-10 w-full" : "h-9 px-3"
            )}
            disabled={busy}
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading links...</span>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="text-sm font-medium text-foreground">No links yet</div>
          <div className="mt-1 text-sm text-muted-foreground">{emptyMessage}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((item) => {
            const directionLabel = getDirectionLabel(item.directions);
            const linkedAtLabel = item.linkedAt
              ? formatAppDateTime(new Date(item.linkedAt))
              : null;

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border border-border/40 bg-background/60 shadow-sm",
                  compact ? "p-4 space-y-3" : "px-4 py-3 flex items-center justify-between gap-3"
                )}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground truncate">{item.title || "Untitled"}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {humanizeLinkType(item.linkType)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {directionLabel}
                    </Badge>
                    {item.versionNumber ? (
                      <Badge variant="outline" className="text-[10px]">
                        v{item.versionNumber}
                      </Badge>
                    ) : null}
                    {item.isCurrentVersion ? (
                      <Badge variant="outline" className="text-[10px] border-green-200/50 text-green-600 bg-green-500/10">
                        Current
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {linkedAtLabel ? `Added ${linkedAtLabel}` : "Direct link"}
                  </div>
                </div>

                <div className={cn("flex items-center shrink-0", compact ? "justify-end gap-2" : "gap-1.5")}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(compact ? "h-9 w-9" : "h-8 w-8", "text-muted-foreground hover:text-foreground")}
                    asChild
                  >
                    <Link href={`/documents/${item.id}`} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      compact ? "h-9 w-9" : "h-8 w-8",
                      "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                    )}
                    onClick={() => onRemoveLink(item)}
                    disabled={busy}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Search, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type WorkflowTemplateSidebarItem = {
  id: string;
  name: string;
  latestVersion?: number | null;
  isActive?: boolean;
  description?: string | null;
};

type Props = {
  title?: string;
  items: WorkflowTemplateSidebarItem[];
  activeId?: string;
  layout?: "vertical" | "horizontal";
  onSelect: (id: string) => void;
  onCreateNew?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

export function WorkflowTemplateSidebar({
  title = "Workflow Templates",
  items,
  activeId,
  layout = "vertical",
  onSelect,
  onCreateNew,
  onRefresh,
  isRefreshing,
}: Props) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const desc = String(item.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q) || String(item.id).toLowerCase().includes(q);
    });
  }, [items, query]);

  if (layout === "horizontal") {
    return (
      <div className="rounded-lg border border-border/50 bg-card/60 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border/40 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-[260px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="h-8 text-xs pl-8"
              />
            </div>
            {onRefresh ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onRefresh}>
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            ) : null}
            {onCreateNew ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onCreateNew}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="p-2 overflow-x-auto">
          <div className="flex items-stretch gap-2 min-w-full">
            {filtered.map((item) => {
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`w-[220px] shrink-0 text-left rounded-md border px-2.5 py-2 transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/40 bg-background/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="text-xs font-medium truncate">{item.name}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant={item.isActive ? "default" : "outline"} className="text-[10px]">
                      {item.isActive ? "active" : "draft"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      v{item.latestVersion || "-"}
                    </Badge>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-3">No templates found.</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 rounded-lg border border-border/50 bg-card/60 overflow-hidden flex flex-col">
      <div className="px-3 py-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="flex items-center gap-1">
          {onRefresh ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRefresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          ) : null}
          {onCreateNew ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateNew}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-3 border-b border-border/40">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates"
            className="h-9 text-sm pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {filtered.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                active
                  ? "border-primary/50 bg-primary/10 shadow-[0_4px_14px_rgba(79,70,229,0.08)]"
                  : "border-border/40 bg-background/50 hover:bg-muted/30 hover:border-border/70"
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.name}</div>
                {item.description ? (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{String(item.description)}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant={item.isActive ? "default" : "outline"} className="text-[10px] h-5">
                  {item.isActive ? "active" : "draft"}
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5">
                  v{item.latestVersion || "-"}
                </Badge>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-3">No templates found.</div>
        ) : null}
      </div>
    </div>
  );
}

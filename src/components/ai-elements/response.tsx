"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, isStreaming, ...props }: ResponseProps & { isStreaming?: boolean }) => (
    <Streamdown
      className={cn(
        "size-full max-w-full overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_table]:my-3 [&_table]:min-w-[520px] [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-lg [&_table]:border [&_table]:border-border",
        "[&_thead]:bg-muted/70 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground",
        "[&_td]:border-b [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-sm [&_tr:last-child_td]:border-b-0 [&_tbody_tr:nth-child(even)]:bg-muted/25",
        "[&_th:last-child]:text-right [&_td:last-child]:text-right [&_td:last-child]:font-medium",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";

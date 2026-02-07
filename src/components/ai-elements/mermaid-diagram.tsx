"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import mermaid from "mermaid";

type MermaidDiagramProps = {
  code: string;
  className?: string;
  theme?: "default" | "dark";
};

export default function MermaidDiagram({ code, className, theme }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const mmConfig = useMemo(
    () => ({
      startOnLoad: false,
      securityLevel: "strict" as const,
      theme: theme === "dark" ? "dark" : "default",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial",
      maxTextSize: 90000,
    }),
    [theme]
  );

  useEffect(() => {
    try {
      mermaid.initialize(mmConfig);
      const render = async () => {
        try {
          // Normalize: strip ```mermaid fences if present and trim
          const normalize = (raw: string) => {
            if (!raw) return "";
            let cleaned = raw.trim();
            cleaned = cleaned.replace(/^\s*```mermaid\s*/i, "");
            cleaned = cleaned.replace(/\s*```\s*$/i, "");
            return cleaned.trim();
          };
          const normalizedCode = normalize(code);

          // Validate before rendering to avoid crashing the renderer
          try {
            // mermaid.parse may be sync or async depending on version
            const maybePromise = (mermaid as any).parse?.(normalizedCode);
            if (maybePromise && typeof (maybePromise as Promise<any>).then === "function") {
              await maybePromise;
            }
          } catch (_e) {
            if (containerRef.current) {
              containerRef.current.textContent = "Invalid Mermaid diagram.";
            }
            // eslint-disable-next-line no-console
            console.warn("Mermaid parse error:", _e);
            return;
          }

          const { svg } = await mermaid.render(`mmd-${id}`, normalizedCode);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        } catch (e) {
          if (containerRef.current) {
            containerRef.current.textContent = "Failed to render diagram.";
          }
          // eslint-disable-next-line no-console
          console.warn("Mermaid render error:", e);
        }
      };
      render();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Mermaid init error:", e);
    }
  }, [code, id, mmConfig]);

  return <div ref={containerRef} className={className} />;
}



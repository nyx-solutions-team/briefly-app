"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Undo,
  Redo,
  ChevronDown,
  Link as LinkIcon,
  Table as TableIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyHeadingLevel } from "@/components/editor/heading-command";

type InlineColorOption = {
  id: string;
  label: string;
  color: string | null;
  swatch: string;
};

const INLINE_TEXT_COLORS: InlineColorOption[] = [
  { id: "default", label: "Default text", color: null, swatch: "#1f2937" },
  { id: "gray", label: "Gray", color: "#6b7280", swatch: "#6b7280" },
  { id: "brown", label: "Brown", color: "#9a6f49", swatch: "#9a6f49" },
  { id: "orange", label: "Orange", color: "#c96d2d", swatch: "#c96d2d" },
  { id: "yellow", label: "Yellow", color: "#b38b17", swatch: "#b38b17" },
  { id: "green", label: "Green", color: "#2f8f63", swatch: "#2f8f63" },
  { id: "blue", label: "Blue", color: "#3178c6", swatch: "#3178c6" },
  { id: "purple", label: "Purple", color: "#7a53c5", swatch: "#7a53c5" },
  { id: "pink", label: "Pink", color: "#c7548a", swatch: "#c7548a" },
  { id: "red", label: "Red", color: "#c84d4d", swatch: "#c84d4d" },
];

const INLINE_BACKGROUND_COLORS: InlineColorOption[] = [
  { id: "default", label: "Default background", color: null, swatch: "#ffffff" },
  { id: "gray", label: "Gray", color: "#f3f4f6", swatch: "#f3f4f6" },
  { id: "brown", label: "Brown", color: "#f4ede7", swatch: "#f4ede7" },
  { id: "orange", label: "Orange", color: "#fef1e7", swatch: "#fef1e7" },
  { id: "yellow", label: "Yellow", color: "#fdf8d9", swatch: "#fdf8d9" },
  { id: "green", label: "Green", color: "#e9f6ee", swatch: "#e9f6ee" },
  { id: "blue", label: "Blue", color: "#e9f2ff", swatch: "#e9f2ff" },
  { id: "purple", label: "Purple", color: "#f1ecff", swatch: "#f1ecff" },
  { id: "pink", label: "Pink", color: "#fcecf4", swatch: "#fcecf4" },
  { id: "red", label: "Red", color: "#fdecec", swatch: "#fdecec" },
];

export function TipTapBubbleMenu({ editor }: { editor: Editor }) {
  const setLink = React.useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);
  const colorMenuRef = React.useRef<HTMLDivElement | null>(null);
  const colorButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const applyInlineTextColor = React.useCallback((color: string | null) => {
    const chain = editor.chain().focus();
    if (color) {
      chain.setColor(color).run();
    } else {
      chain.unsetColor().run();
    }
    setColorMenuOpen(false);
  }, [editor]);

  const applyInlineBackgroundColor = React.useCallback((color: string | null) => {
    const chain = editor.chain().focus();
    if (color) {
      chain.setHighlight({ color }).run();
    } else {
      chain.unsetHighlight().run();
    }
    setColorMenuOpen(false);
  }, [editor]);

  React.useEffect(() => {
    if (!colorMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (colorMenuRef.current?.contains(target)) return;
      if (colorButtonRef.current?.contains(target)) return;
      setColorMenuOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown, true);
    return () => window.removeEventListener("mousedown", onPointerDown, true);
  }, [colorMenuOpen]);

  React.useEffect(() => {
    const closeColorMenu = () => setColorMenuOpen(false);
    editor.on("selectionUpdate", closeColorMenu);
    return () => {
      editor.off("selectionUpdate", closeColorMenu);
    };
  }, [editor]);

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/95 shadow-lg backdrop-blur px-1 py-1">
      <Button
        type="button"
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("bold") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
        aria-label="Bold"
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("italic") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
        aria-label="Italic"
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive("underline") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("underline") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleUnderline().run();
        }}
        aria-label="Underline"
        title="Underline"
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive("strike") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("strike") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleStrike().run();
        }}
        aria-label="Strike"
        title="Strike"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-6 w-px bg-border/70" />

      <Button
        type="button"
        variant={editor.isActive("code") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("code") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleCode().run();
        }}
        aria-label="Inline code"
        title="Inline code"
      >
        <Code className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive("link") ? "secondary" : "ghost"}
        size="icon"
        className={cn("h-8 w-8", editor.isActive("link") && "bg-primary/10 text-primary")}
        onMouseDown={(e) => {
          e.preventDefault();
          setLink();
        }}
        aria-label="Link"
        title="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </Button>

      <div className="relative">
        <Button
          ref={colorButtonRef}
          type="button"
          variant={colorMenuOpen ? "secondary" : "ghost"}
          size="icon"
          className={cn("h-8 w-8", colorMenuOpen && "bg-primary/10 text-primary")}
          onMouseDown={(e) => {
            e.preventDefault();
            setColorMenuOpen((prev) => !prev);
          }}
          aria-label="Text and background color"
          title="Text and background color"
        >
          <span className="inline-flex items-center gap-0.5">
            <span className="text-[11px] font-semibold leading-none">A</span>
            <ChevronDown className="h-3 w-3" />
          </span>
        </Button>

        {colorMenuOpen && (
          <div
            ref={colorMenuRef}
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-[210px] rounded-md border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur"
          >
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Text color</div>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {INLINE_TEXT_COLORS.map((option) => (
                <button
                  key={`inline-text-${option.id}`}
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/70 transition-colors hover:bg-muted"
                  style={{ color: option.color ?? option.swatch }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyInlineTextColor(option.color);
                  }}
                  aria-label={option.label}
                  title={option.label}
                >
                  <span className="text-[12px] font-semibold leading-none">A</span>
                </button>
              ))}
            </div>

            <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Background color</div>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {INLINE_BACKGROUND_COLORS.map((option) => (
                <button
                  key={`inline-bg-${option.id}`}
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/70 transition-colors hover:opacity-85"
                  style={{ backgroundColor: option.swatch }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyInlineBackgroundColor(option.color);
                  }}
                  aria-label={option.label}
                  title={option.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon"
            disabled={disabled}
            // Run commands on mouse down so they apply to the *current* selection.
            // If we wait for click (mouse up), ProseMirror selection can collapse.
            onMouseDown={(e) => {
              e.preventDefault();
              onClick();
            }}
            // Prevent double-toggle: mouse down already runs the command.
            onClick={(e) => {
              e.preventDefault();
            }}
            // Keep keyboard accessibility.
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }}
            className={cn(
              "h-8 w-8",
              active && "bg-primary/10 text-primary hover:bg-primary/15"
            )}
            aria-label={label}
            title={label}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span>{label}</span>
          {shortcut && <span className="ml-1 text-muted-foreground">({shortcut})</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TipTapToolbar({ editor }: { editor: Editor | null }) {
  const setLink = React.useCallback(() => {
    if (!editor) return;

    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  const insertTable = React.useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run();
  }, [editor]);

  if (!editor) {
    return <div className="h-8" />;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton
          label="Undo"
          shortcut="Ctrl/Cmd+Z"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          shortcut="Ctrl/Cmd+Shift+Z"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border/60" />

        <ToolbarButton
          label="Bold"
          shortcut="Ctrl/Cmd+B"
          active={editor.isActive("bold")}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          shortcut="Ctrl/Cmd+I"
          active={editor.isActive("italic")}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          shortcut="Ctrl/Cmd+U"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Strike"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border/60" />

        <ToolbarButton
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => applyHeadingLevel(editor, 1)}
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => applyHeadingLevel(editor, 2)}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => applyHeadingLevel(editor, 3)}
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border/60" />

        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Ordered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-border/60" />

        <ToolbarButton label="Link" shortcut="Ctrl/Cmd+K" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Insert table" onClick={insertTable}>
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import type { JSONContent } from "@tiptap/core";

import { TipTapBubbleMenu, TipTapToolbar } from "@/components/editor/tiptap-toolbar";
import { cn } from "@/lib/utils";

export type TipTapEditorValue = JSONContent;

type Props = {
  value?: TipTapEditorValue;
  onChange?: (value: TipTapEditorValue) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  showToolbar?: boolean;
  showBubbleMenu?: boolean;
};

const DEFAULT_DOC: TipTapEditorValue = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Untitled" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Start writing. Use the toolbar for headings, checklists, tables, and more.",
        },
      ],
    },
  ],
};

export function TipTapEditor({
  value,
  onChange,
  placeholder = "Write something...",
  className,
  editable = true,
  showToolbar = true,
  showBubbleMenu = true,
}: Props) {
  const lastExternalValueRef = React.useRef<string | null>(null);

  const editor = useEditor({
    // Next.js renders client components on the server for the initial HTML.
    // TipTap recommends disabling immediate render to avoid hydration mismatches.
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value ?? DEFAULT_DOC,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  // TipTap doesn't always pick up editable changes from React props,
  // so explicitly apply the current editable flag.
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(Boolean(editable));
  }, [editor, editable]);

  // Allow external value updates (e.g., load template) without breaking typing.
  React.useEffect(() => {
    if (!editor) return;
    if (!value) return;

    const next = JSON.stringify(value);
    if (lastExternalValueRef.current === next) return;
    lastExternalValueRef.current = next;

    // Avoid resetting selection/history when content is effectively the same.
    const current = JSON.stringify(editor.getJSON());
    if (current === next) return;

    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className={cn("rounded-lg border bg-card/50 border-border/40", className)}>
      {showToolbar && (
        <div className="border-b border-border/40 bg-muted/10 px-2 py-2">
          <TipTapToolbar editor={editor} />
        </div>
      )}
      <div className="px-4 py-4">
        {editor && showBubbleMenu && editable && (
          <BubbleMenu
            editor={editor}
          >
            <TipTapBubbleMenu editor={editor} />
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

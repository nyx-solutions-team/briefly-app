import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type ApprovalCommentAnchor = {
  id: string;
  from: number;
  to: number;
  message?: string;
  userLabel?: string;
  createdAt?: string;
  quote?: string;
};

type ApprovalCommentsOptions = {
  getComments: () => ApprovalCommentAnchor[];
  getActiveCommentId: () => string | null;
};

export const approvalCommentsPluginKey = new PluginKey("approvalComments");

export const ApprovalCommentsExtension = Extension.create<ApprovalCommentsOptions>({
  name: "approvalComments",

  addOptions() {
    return {
      getComments: () => [],
      getActiveCommentId: () => null,
    };
  },

  addProseMirrorPlugins() {
    const getComments = this.options.getComments;
    const getActiveCommentId = this.options.getActiveCommentId;

    return [
      new Plugin({
        key: approvalCommentsPluginKey,
        props: {
          decorations: (state) => {
            const comments = Array.isArray(getComments()) ? getComments() : [];
            if (comments.length === 0) return DecorationSet.empty;

            const activeId = getActiveCommentId();
            const docSize = state.doc.content.size;
            const decorations: Decoration[] = [];

            for (const comment of comments) {
              if (!comment?.id) continue;
              const from = Math.max(1, Math.min(docSize, Number(comment.from) || 0));
              const toRaw = Math.max(from, Math.min(docSize, Number(comment.to) || from));
              const to = Math.max(from, toRaw);
              if (to <= from) continue;

              const isActive = activeId === comment.id;
              decorations.push(
                Decoration.inline(
                  from,
                  to,
                  {
                    class: isActive ? "editor-approval-comment-anchor editor-approval-comment-anchor-active" : "editor-approval-comment-anchor",
                    "data-approval-comment-id": String(comment.id),
                  },
                  {
                    commentId: String(comment.id),
                  }
                )
              );
            }

            if (decorations.length === 0) return DecorationSet.empty;
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});


# Inline AI Diff Editing

This module implements Cursor-style inline diff editing for AI suggestions in the TipTap editor.

## Features

- ✅ **Inline rendering**: Changes appear directly in the document (no side-by-side preview)
- ✅ **Green highlights** for insertions
- ✅ **Red strikethrough** for deletions
- ✅ **Floating Accept/Reject buttons** on each changed block
- ✅ **Block-level granularity**: Each paragraph/heading/list item can be accepted/rejected independently
- ✅ **Clean state separation**: Original content remains untouched until Accept is clicked
- ✅ **Non-destructive**: Uses TipTap decorations (overlays) instead of modifying document structure

## Architecture

### Core Components

1. **`diff-types.ts`**: TypeScript type definitions
2. **`diff-utils.ts`**: Utility functions for generating diffs using `fast-diff`
3. **`diff-manager.tsx`**: React context provider for managing diff state
4. **`diff-marks-extension.ts`**: TipTap extension that renders decorations
5. **`diff-actions.tsx`**: Accept/Reject button component
6. **`diff-styles.css`**: CSS animations and styling (in `globals.css`)

### Data Flow

```
AI Response → addDiff() → DiffManagerState → DiffMarksExtension → Decorations → Rendered in Editor
                                                                                          ↓
                                                                                   User clicks Accept
                                                                                          ↓
                                                                              acceptDiff() → TipTap Transaction
```

## Usage

### 1. Wrap Editor with DiffManagerProvider

```tsx
import { DiffManagerProvider } from "@/components/editor/diff/diff-manager";

<DiffManagerProvider editor={editorInstance}>
  <TipTapEditor ... />
</DiffManagerProvider>
```

### 2. Add DiffMarksExtension to TipTap

The extension is already integrated in `tiptap-editor.tsx`:

```tsx
DiffMarksExtension.configure({
  getActiveDiffs: () => diffManager?.activeDiffs ?? new Map(),
  onAccept: (diffId) => diffManager?.acceptDiff(diffId),
  onReject: (diffId) => diffManager?.rejectDiff(diffId),
})
```

### 3. Trigger Diff from AI Sidebar

```tsx
import { useDiffManager } from "@/components/editor/diff/diff-manager";
import { generateBlockDiff } from "@/components/editor/diff/diff-utils";

const { addDiff } = useDiffManager();

// When AI returns a suggestion for a selected block:
const diffSegments = generateBlockDiff(
  originalBlockContent,  // JSONContent
  suggestedBlockContent  // JSONContent
);

addDiff({
  blockPos: selectionFrom,
  originalContent: originalBlockContent,
  suggestedContent: suggestedBlockContent,
  diff: diffSegments,
});
```

### 4. User Interaction

- **Accept**: Replaces original block with AI suggestion (atomic TipTap transaction)
- **Reject**: Discards suggestion, decorations disappear

## Example: Testing Diff Manually

To test the diff system, you can manually trigger it from the browser console:

```javascript
// Get editor instance (assuming it's exposed globally or via React DevTools)
const editor = window.tiptapEditor;

// Create a simple diff
const originalContent = {
  type: "paragraph",
  content: [{ type: "text", text: "Hello world" }]
};

const suggestedContent = {
  type: "paragraph",
  content: [{ type: "text", text: "Hello beautiful world" }]
};

// Trigger diff (you'll need access to diffManager)
diffManager.addDiff({
  blockPos: 0,  // Position of the block in the document
  originalContent,
  suggestedContent,
  diff: generateBlockDiff(originalContent, suggestedContent),
});
```

## Styling

Diff styles are defined in `globals.css`:

- `.diff-insert`: Green gradient background with bottom border
- `.diff-delete`: Red strikethrough with semi-transparent background
- Smooth fade-in animations for visual polish

## Future Enhancements

- [ ] Keyboard shortcuts (Cmd+Enter = Accept, Cmd+Delete = Reject)
- [ ] Diff invalidation when user edits original block
- [ ] Support for multi-block diffs (e.g., AI rewrites 3 paragraphs)
- [ ] Undo/Redo integration
- [ ] Conflict detection (multiple overlapping diffs)
- [ ] Preview mode toggle (show/hide all diffs)

## Dependencies

- `fast-diff`: Character-level diff algorithm (2KB, lightweight)
- `nanoid`: Unique ID generation for diff blocks
- TipTap's ProseMirror decorations API

## Notes

- The diff system is **optional**: If the editor is not wrapped in `DiffManagerProvider`, it works normally without diff features.
- Decorations are **non-editable overlays**: They don't interfere with the user's ability to edit the document.
- Each diff block is **independent**: Users can accept some suggestions and reject others.


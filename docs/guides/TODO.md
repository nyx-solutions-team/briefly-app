## Amazing Experience Upgrade Plan

- Phase 1 – Super important
  - [x] Chat: citations with snippets and links to source docs
  - [x] Chat: include linked docs (versions + related) when scoped to a doc (toggle)
  - [x] Chat: commands to fetch linked docs by sender/receiver, month/year, type, contains words
  - [x] Documents: “Current only” toggle in list

- Phase 2 – Less important
  - [x] Chat: streaming answers (UI)
  - [x] Chat: disambiguation scope chips (entity) in scoped chat
  - [x] Chat: structured extraction and export
    - [x] /linked filters + export:csv|export:json
    - [x] /extract fields:... with CSV/JSON export
    - [x] /timeline entity:... listing
  - [x] Inline rename and quick tag editor
  - [x] Drag to move between folders

- [ ] Upload that feels magic
  - [x] Multi-file upload with a queue, progress per file, and background AI processing (bulk upload)
  - [x] Upload queue carousel (Prev/Next, focused item)
  - [x] Save Ready saves all ready items then redirects to `\documents`
  - [x] Deduplicate by content hash before saving
  - [ ] Live preview for PDFs/images in uploader, with page splitting/rotation
  - [ ] Auto-suggest folder based on AI `documentType` (keep manual override)
  - [x] Auto-suggest tags from AI metadata

- [ ] Document detail that answers questions
  - [x] “Ask about this” button → opens full chat scoped to selected doc
  - [x] Citations with clickable snippets in chat
  - [x] One-click actions: copy summary, export JSON, download notes

- [ ] Folders and list UX that move fast
  - [x] Multi-select in list view with bulk actions (tag, delete)
  - [x] Bulk move selected docs to folder (by destination path dialog)
  - [x] Drag to move between folders (drag doc rows/cards onto a folder card)
  - [ ] Inline rename and quick tag editor everywhere
  - [x] Show Doc Type tag across list/grid/cards

- [ ] Clean, calm design polish
  - [ ] Clear empty states and microcopy
  - [ ] Keyboard shortcuts (Cmd+K command palette; A to upload, T to tag, M to move)

- [ ] Reliability & performance
  - [ ] Optimistic UI for edits; background AI states
  - [ ] Offline-ready local cache & resume processing
  - [x] Server actions body limit increased (20 MB)


Notes
- Completed: bulk upload queue with carousel, hash dedupe, Save Ready redirect, doc-type tags across views, list-view multi-select with bulk tag/delete, chat scoped via `/chat?docId=` and detail actions.
- Next: previews with page tools, streaming + citations, drag-to-move, bulk move, command palette, accessibility and empty-state polish.



# Backend API Plan (Node.js + Fastify)

## Multi-tenant model
- Organizations: each org has exactly one `orgAdmin` and multiple other users (`contentManager`, `contentViewer`, `guest`).
- All data (documents, links, audit, chat, chunks) is scoped by `org_id` and protected by RLS.

## Auth
- Supabase Auth JWT verified server-side.
- Org membership resolved per request: client includes `X-Org-Id` header or path param; server verifies membership (`organization_users`).
- On successful login (session established on frontend), server records an `audit_events` row with type `login`.

## Storage
- You will create a Supabase bucket `documents` (and optionally `previews`, `extractions`).
- Object keys are prefixed with `org_id/` to enforce org-scoped policies.

## Endpoints (org-scoped)
- All org endpoints require `X-Org-Id: <uuid>` header.

### Health & Profile
- `GET /health`
- `GET /me` → returns `{id, orgs: [{orgId, role, name}]}`

### Organizations
- `GET /orgs` → orgs for current user
- `POST /orgs` (create org; caller becomes `orgAdmin`)
- `GET /orgs/:orgId/users` (admin)
- `PATCH /orgs/:orgId/users/:userId` role updates (admin)

### Documents
- `GET /orgs/:orgId/documents?q=&folderPath=&type=&tags[]=&dateFrom=&dateTo=&currentOnly=&limit=&offset=`
- `GET /orgs/:orgId/documents/:id`
- `POST /orgs/:orgId/documents` → metadata row (no file upload)
- `PATCH /orgs/:orgId/documents/:id`
- `DELETE /orgs/:orgId/documents/:id`
- `POST /orgs/:orgId/documents/move` → `{ids, destPath}`
- `POST /orgs/:orgId/documents/:id/link` / `DELETE /orgs/:orgId/documents/:id/link/:linkedId`
- Versioning: `POST /orgs/:orgId/documents/:id/version`, `POST /orgs/:orgId/documents/:id/set-current`, `POST /orgs/:orgId/documents/:id/unlink`

### Uploads
- `POST /orgs/:orgId/uploads/sign` → returns signed URL + `storageKey` like `orgId/versionGroupId/versionNumber/filename`
- `POST /orgs/:orgId/uploads/finalize` → persists size/mime/storageKey/content_hash; enqueues background processing

### Audit
- `GET /orgs/:orgId/audit?type=&actors=&from=&to=&limit=&offset=` (includes `login` events)

### Search
- `GET /orgs/:orgId/search` → lexical
- `POST /orgs/:orgId/search/semantic` → hybrid (pgvector + lexical)

### Chat (default not persisted)
- `POST /orgs/:orgId/chat/ask` (SSE) → streams answer and ephemeral citations. Does not create DB rows by default.
- `POST /orgs/:orgId/chat/sessions` → create a saved session
- `POST /orgs/:orgId/chat/sessions/:id/ask` (SSE) → streams and persists messages
- `GET /orgs/:orgId/chat/sessions` / `GET /orgs/:orgId/chat/sessions/:id/messages`

## Background jobs
- On finalize upload or versioning changes, OCR/metadata/chunk/embedding update for that `org_id` and `doc_id`.

## Security
- Enforce `X-Org-Id` membership on every request.
- Storage object keys MUST begin with `orgId/` to match policies.
- Rate limit per-user per-org; stricter on chat.
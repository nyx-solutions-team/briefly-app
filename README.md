# Briefly – Next.js + Fastify + Supabase

Production-ready document management with AI. Frontend: Next.js App Router. Backend: Fastify. Database/Auth/Storage: Supabase.

Quick start (local backend):
- Copy `.env.local.example` to `.env.local` and set values. For local testing, leave `NEXT_PUBLIC_API_BASE_URL=http://localhost:8787`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project.
- Run: `npm i && npm run dev` (frontend on port 9002).
- Backend (`server/`): set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, optional `GEMINI_API_KEY` and `OPENAI_API_KEY`; `npm i && npm run dev` (port 8787).
- Database: run `docs/supabase_schema.sql` and `docs/supabase_policies.sql` in Supabase SQL editor. Create buckets: `documents`, `previews`, `extractions`.

Auth: Users sign in with Supabase Auth (email/password). Backend enforces RLS using the end-user JWT.
# Trigger deployment Mon Sep 29 17:57:52 IST 2025

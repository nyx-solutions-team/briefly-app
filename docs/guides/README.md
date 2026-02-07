# Backend and Supabase Setup

This folder contains SQL and planning docs to provision Supabase (Auth, Postgres, Storage) and to guide the Node.js backend.

## Order of operations

1. Create a Supabase project and copy your `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET`.
2. Run `supabase_schema.sql` in the SQL editor to create tables, extensions, indexes.
3. Run `supabase_policies.sql` to enable RLS and define policies, helper functions, and Storage buckets/policies.
4. Create a `.env` for the server using `.env.example` in `server/`.
5. Start the server and test routes.

## Files

- `supabase_schema.sql`: Tables, extensions, indexes, and base schema.
- `supabase_policies.sql`: RLS policies, helper functions, and storage bucket entries/policies.
- `backend_api_plan.md`: API surface, contracts, and background job plan.

## Notes

- This design expects role-based access using Supabase Auth and row-level security (RLS). Roles live in `app_users.role` and are resolved via a helper SQL function for policies.
- Storage is split into three buckets: `documents` (originals), `previews` (thumbnails), `extractions` (cached OCR/metadata JSON). Signed uploads should be used from the client; the server finalizes DB rows.
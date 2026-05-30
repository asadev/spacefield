-- 2026-05-30 — Realign search_doc_remove() signature to (text, uuid).
--
-- DRIFT: the live DB (project your-supabase-project-ref) had
--   search_doc_remove(p_entity_type text, p_entity_id text)
-- — p_entity_id was TEXT — even though:
--   * search_documents.entity_id is UUID,
--   * search_doc_upsert() takes p_entity_id uuid, and
--   * the defining migration (20260514f_search.sql) declares
--     search_doc_remove(text, uuid).
-- So prod had been patched out-of-band to a TEXT param; the repo no
-- longer reproduced production. The body compared a uuid column against
-- a text param (forcing an implicit text->uuid cast that errors on any
-- malformed id), and PostgREST could resolve to the wrong overload.
--
-- This was latent: nothing exercised un-indexing until the CRM delete
-- paths were wired (companies DELETE, AI-skill delete, etc.), all of
-- which call lib/search/indexer.ts unindexDocument() -> this RPC.
--
-- FIX: drop the TEXT anomaly and (re)create the canonical UUID version,
-- then re-apply the same REVOKEs the original migration used. The TS
-- caller passes entityId as a string; PostgREST casts text->uuid for a
-- uuid-typed param, which is correct.
--
-- Idempotent + safe to re-run.

drop function if exists public.search_doc_remove(text, text);

create or replace function public.search_doc_remove(
  p_entity_type text,
  p_entity_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.search_documents
  where entity_type = p_entity_type
    and entity_id = p_entity_id;
$$;

-- SECURITY DEFINER RPC must not be world-callable (service role bypasses
-- RLS and is the only intended caller via the admin client). Mirror the
-- original lockdown from 20260514f_search.sql.
revoke all on function public.search_doc_remove(text, uuid) from public;
revoke all on function public.search_doc_remove(text, uuid) from anon;
revoke all on function public.search_doc_remove(text, uuid) from authenticated;

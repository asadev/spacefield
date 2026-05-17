-- 2026-05-18 pgvector embeddings infrastructure.
--
-- A single workspace-scoped table where we stash content + its
-- embedding vector, plus an HNSW index for fast ANN search and a
-- security-definer RPC that wraps the cosine-distance lookup with the
-- existing workspace-membership check.
--
-- One row per (entity_type, entity_id, chunk_index) — chunking happens
-- at write time (in lib/ai/embeddings.ts). 1536-d matches OpenAI's
-- text-embedding-3-small and is the practical default for RAG today.

create extension if not exists vector;

create table if not exists public.embeddings (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  entity_type  text not null,
  entity_id    uuid not null,
  chunk_index  int  not null default 0,
  content      text not null,
  embedding    vector(1536),
  model        text not null default 'text-embedding-3-small',
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists embeddings_entity_idx
  on public.embeddings (entity_type, entity_id);
create index if not exists embeddings_workspace_idx
  on public.embeddings (workspace_id);
-- HNSW for cosine similarity ANN. ivfflat needs training rows; HNSW
-- works out of the box and gives better recall for our expected
-- O(10k–100k) row volumes.
create index if not exists embeddings_vector_hnsw_idx
  on public.embeddings using hnsw (embedding vector_cosine_ops);

alter table public.embeddings enable row level security;

drop policy if exists embeddings_select on public.embeddings;
create policy embeddings_select on public.embeddings
  for select to authenticated
  using (workspace_id is null or public.is_workspace_member(workspace_id));

-- Service-role writes only; no insert/update/delete policies for
-- authenticated. The lib uses the admin client.

-- ────────────────────────── semantic search RPC ──────────────────────────
-- Takes a query embedding + optional workspace/entity filters. Returns
-- top-N matches by cosine similarity (1 - cosine distance). Cap at 50
-- to keep the worst-case payload bounded.
create or replace function public.semantic_search(
  p_query_embedding vector(1536),
  p_workspace_id    uuid default null,
  p_entity_type     text default null,
  p_limit           int default 10
) returns table (
  id          uuid,
  entity_type text,
  entity_id   uuid,
  content     text,
  metadata    jsonb,
  similarity  float4
) language sql security definer set search_path = public, extensions as $$
  select id, entity_type, entity_id, content, metadata,
         (1 - (embedding <=> p_query_embedding))::float4 as similarity
  from public.embeddings
  where (p_workspace_id is null or workspace_id = p_workspace_id)
    and (p_entity_type is null or entity_type = p_entity_type)
    and (p_workspace_id is null or public.is_workspace_member(p_workspace_id))
  order by embedding <=> p_query_embedding
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.semantic_search(vector, uuid, text, int) to authenticated;

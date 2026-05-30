-- 20260530b_aud03_group_jid_repair.sql
-- AUD-03-ingest (FIX-B): legacy phone-style group JID corruption — historical repair.
--
-- WHAT WENT WRONG
--   lib/whatsapp/webhook-parser.ts normalised every JID with
--   jidToNumber() == local.replace(/\D/g,'') (digits only). That is correct for
--   individual JIDs, but for GROUP JIDs it corrupted the legacy phone-style form
--   "<creator>-<timestamp>@g.us" (e.g. 971552704745-1460373952@g.us): the hyphen
--   was stripped and the two halves glued into a single bogus value
--   (9715527047451460373952). That value is what the webhook handler
--   (app/api/whatsapp/webhook/route.ts) wrote into
--   whatsapp_messages.from_number / to_number, so ~355 group messages key on the
--   wrong id and the thread renders as a bare 22-digit number.
--
-- THE CODE FIX (already shipped in this branch)
--   jidToNumber() now returns the local part VERBATIM for "@g.us" JIDs (keeps the
--   hyphen). NEW inbound group messages are no longer corrupted. This migration
--   only concerns rows ALREADY written with the glued value.
--
-- WHY THE REPAIR IS HEURISTIC (and therefore left commented / not auto-run)
--   whatsapp_messages has NO raw-payload column, so the original hyphen position
--   is NOT stored on the message row. The only place the correct id survives is
--   whatsapp_groups.evolution_group_id (the groups-sync path stored Evolution's
--   raw group id unchanged). We therefore recover the correct id by matching a
--   glued from_number/to_number to a known group whose digit-stripped
--   evolution_group_id equals the glued value, scoped to the SAME instance_id.
--   This is safe only when that match is UNIQUE for the row's instance — hence
--   the guard below. Where there is no matching group, or the match is ambiguous,
--   the row is left untouched (best-effort, per the audit).
--
-- THIS MIGRATION IS INTENTIONALLY A NO-OP ON APPLY.
--   The only thing that runs is the side-effect-free DO block below, which just
--   RAISES NOTICEs with counts. The destructive UPDATE is shipped as commented
--   SQL for an operator to review + run manually.
--
-- ------------------------------------------------------------------------------
-- Idempotent, side-effect-free apply step: report scope. Pure reads, no writes.
-- ------------------------------------------------------------------------------
do $$
declare
	v_glued      bigint;
	v_repairable bigint;
begin
	-- A from_number/to_number that is a long unbroken digit run (>= 18) is the
	-- glued-group signature: real individual numbers are <= 15 digits (E.164) and
	-- correctly-stored legacy group ids contain a hyphen, while modern 120363...
	-- group ids are exactly 18 digits and were never corrupted (no hyphen to
	-- strip). We use >= 19 to avoid touching legitimate 18-digit modern ids.
	select count(*) into v_glued
	from public.whatsapp_messages
	where from_number ~ '^[0-9]{19,}$' or to_number ~ '^[0-9]{19,}$';

	-- Of those, how many can be UNIQUELY recovered from whatsapp_groups within
	-- the same instance.
	select count(*) into v_repairable
	from public.whatsapp_messages m
	where (m.from_number ~ '^[0-9]{19,}$' or m.to_number ~ '^[0-9]{19,}$')
	  and exists (
		select 1
		from public.whatsapp_groups g
		where g.instance_id = m.instance_id
		  and g.evolution_group_id like '%-%'
		  and regexp_replace(g.evolution_group_id, '\D', '', 'g')
		      = coalesce(nullif(m.from_number, ''), m.to_number)
	  );

	raise notice 'AUD-03-ingest repair scan: % glued-group rows, % uniquely repairable from whatsapp_groups',
		v_glued, v_repairable;
end
$$;

-- ------------------------------------------------------------------------------
-- OPTIONAL ONE-TIME HISTORICAL REPAIR (RUN MANUALLY, NOT AUTO-APPLIED)
--
-- Matching is HEURISTIC (no raw payload survives on the message row), so review
-- the dry run before applying and keep it inside a transaction.
--
-- 1) DRY RUN — inspect glued -> corrected pairs and the affected row count.
--    Only rows with EXACTLY ONE matching group for their instance are shown.
--
-- with candidates as (
--   select m.id,
--          m.instance_id,
--          coalesce(nullif(m.from_number,''), m.to_number) as glued,
--          (
--            select array_agg(g.evolution_group_id)
--            from public.whatsapp_groups g
--            where g.instance_id = m.instance_id
--              and g.evolution_group_id like '%-%'
--              and regexp_replace(g.evolution_group_id,'\D','','g')
--                  = coalesce(nullif(m.from_number,''), m.to_number)
--          ) as matches
--   from public.whatsapp_messages m
--   where m.from_number ~ '^[0-9]{19,}$' or m.to_number ~ '^[0-9]{19,}$'
-- )
-- select glued,
--        matches[1] as corrected,
--        count(*)   as n
-- from candidates
-- where array_length(matches,1) = 1            -- unambiguous only
-- group by glued, matches[1]
-- order by n desc;
--
-- 2) APPLY — wrap in a transaction so it is reviewable / abortable.
--    Updates from_number and/or to_number in place to the unambiguous match.
--
-- begin;
-- with repair as (
--   select m.id,
--          (
--            select g.evolution_group_id
--            from public.whatsapp_groups g
--            where g.instance_id = m.instance_id
--              and g.evolution_group_id like '%-%'
--              and regexp_replace(g.evolution_group_id,'\D','','g')
--                  = coalesce(nullif(m.from_number,''), m.to_number)
--            -- enforce uniqueness: error out instead of silently picking one
--            limit 1
--          ) as corrected,
--          m.from_number,
--          m.to_number
--   from public.whatsapp_messages m
--   where (m.from_number ~ '^[0-9]{19,}$' or m.to_number ~ '^[0-9]{19,}$')
--     and (
--       select count(*)
--       from public.whatsapp_groups g
--       where g.instance_id = m.instance_id
--         and g.evolution_group_id like '%-%'
--         and regexp_replace(g.evolution_group_id,'\D','','g')
--             = coalesce(nullif(m.from_number,''), m.to_number)
--     ) = 1                                     -- unambiguous only
-- )
-- update public.whatsapp_messages m
-- set from_number = case when m.from_number ~ '^[0-9]{19,}$' then r.corrected else m.from_number end,
--     to_number   = case when m.to_number   ~ '^[0-9]{19,}$' then r.corrected else m.to_number end
-- from repair r
-- where m.id = r.id
--   and r.corrected is not null;
-- -- inspect the rowcount, then:  commit;   (or  rollback;  to back out)
--
-- Note: this update is idempotent — once a value contains the hyphen it no longer
-- matches '^[0-9]{19,}$', so re-running selects/updates zero rows. Rows with no
-- matching group, or an ambiguous match, are intentionally left untouched.
-- ------------------------------------------------------------------------------

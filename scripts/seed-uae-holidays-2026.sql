-- 2026-05-14 UAE public holidays for 2026.
--
-- Optional seed. Run only if you want the holidays in a queryable table
-- instead of the hard-coded list rendered by app/people/time-off/page.tsx.
-- Idempotent: drops + recreates the per-year rows.

create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  country     text not null,
  year        int not null,
  date        date not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (country, date)
);

alter table public.holidays enable row level security;

drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays
  for select to anon, authenticated using (true);

-- ── UAE 2026 ──
delete from public.holidays where country = 'AE' and year = 2026;

insert into public.holidays (country, year, date, name) values
  ('AE', 2026, '2026-01-01', 'New Year''s Day'),
  ('AE', 2026, '2026-03-20', 'Eid al-Fitr (obs.)'),
  ('AE', 2026, '2026-03-21', 'Eid al-Fitr'),
  ('AE', 2026, '2026-03-22', 'Eid al-Fitr'),
  ('AE', 2026, '2026-05-26', 'Arafah Day'),
  ('AE', 2026, '2026-05-27', 'Eid al-Adha'),
  ('AE', 2026, '2026-05-28', 'Eid al-Adha'),
  ('AE', 2026, '2026-05-29', 'Eid al-Adha'),
  ('AE', 2026, '2026-06-17', 'Hijri New Year'),
  ('AE', 2026, '2026-08-26', 'Prophet''s Birthday'),
  ('AE', 2026, '2026-12-01', 'Commemoration Day'),
  ('AE', 2026, '2026-12-02', 'National Day'),
  ('AE', 2026, '2026-12-03', 'National Day');

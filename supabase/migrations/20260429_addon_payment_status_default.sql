-- 2026-04-29
-- Default new workspace_storage_addons rows to payment_status='pending'.
--
-- Before this, the column default was 'mock' (legacy v1 inheritance from the
-- Polar migration). Combined with /api/billing/checkout pre-staging a row
-- BEFORE the user has paid, that meant a freshly-clicked add-on counted
-- toward the cap immediately — exactly the "no payment, big cap" footgun
-- the QA bug 1 caught. Pending is correct: webhook flips to 'active' on
-- subscription.created, and the workspace_storage RPC ignores anything
-- that's not 'mock' or 'active'.
alter table public.workspace_storage_addons
  alter column payment_status set default 'pending';

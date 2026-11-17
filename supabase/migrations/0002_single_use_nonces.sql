-- Ownership challenges are now issued statelessly (signed by the server) and
-- only recorded when verified. A unique nonce makes each one single-use across
-- every server instance: a replayed signature hits a unique violation.

create unique index if not exists uq_oc_nonce on public.ownership_challenges (nonce);

-- The session is a signed token now; nothing is stored here any more.
alter table public.ownership_challenges drop column if exists session_token;

-- Optional housekeeping: rows are only needed until they expire.
-- delete from public.ownership_challenges where expires_at < now() - interval '1 day';

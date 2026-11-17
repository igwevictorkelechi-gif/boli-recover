-- Ownership challenges: one row per "prove you control this address" attempt.
-- The signature itself is never stored; we only record that verification passed.

create table if not exists public.ownership_challenges (
  id            uuid primary key default gen_random_uuid(),
  address       text        not null,          -- lowercased EVM address
  nonce         text        not null,
  message       text        not null,          -- exact message the user signed
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  verified_at   timestamptz,                   -- set once the signature checks out
  session_token text,                          -- issued on successful verification
  created_at    timestamptz not null default now()
);

create index if not exists idx_oc_address on public.ownership_challenges (address);
create index if not exists idx_oc_expires on public.ownership_challenges (expires_at);

-- Lock the table to the service role only. With RLS enabled and no policies,
-- anon/authenticated clients get nothing; the service-role key used by the API
-- routes bypasses RLS. The browser never touches this table directly.
alter table public.ownership_challenges enable row level security;

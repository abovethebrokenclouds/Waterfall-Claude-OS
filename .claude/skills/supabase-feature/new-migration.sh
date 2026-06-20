#!/usr/bin/env bash
# Scaffold a Supabase migration with RLS + owner-scoped policies.
# Usage:  new-migration.sh <table_name>
# Example: new-migration.sh widgets   ->  supabase/migrations/<ts>_widgets.sql
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

raw="${1:-}"
[ -z "$raw" ] && { echo "usage: new-migration.sh <table_name>"; exit 2; }
# Normalize to a snake_case table identifier (strip a leading add_/create_).
t=$(echo "$raw" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/_/g; s/^(add|create)_//; s/^_+|_+$//g')
[ -z "$t" ] && { echo "could not derive a table name from '$raw'"; exit 2; }

ts=$(date -u +%Y%m%d%H%M%S)
file="supabase/migrations/${ts}_${t}.sql"
mkdir -p supabase/migrations
[ -e "$file" ] && { echo "refusing to overwrite $file"; exit 1; }

cat > "$file" <<EOF
-- ${file}
-- Table: public.${t}  (RLS enabled, owner-scoped). Edit columns as needed.

create table if not exists public.${t} (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- TODO: add your columns here
  name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_${t}_user on public.${t}(user_id);

alter table public.${t} enable row level security;
grant select, insert, update, delete on public.${t} to authenticated;
grant all on public.${t} to service_role;

create policy ${t}_select on public.${t} for select using (user_id = auth.uid());
create policy ${t}_insert on public.${t} for insert with check (user_id = auth.uid());
create policy ${t}_update on public.${t} for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ${t}_delete on public.${t} for delete using (user_id = auth.uid());
EOF

echo "created $file"

# Also scaffold a pgTAP test that PROVES the RLS policies scope rows by owner.
# Runs via `supabase test db` (the CLI bundles pgTAP + a TAP harness). Uses the
# basejump supabase-test-helpers for auth setup — pin them to a commit SHA in CI
# (light maintenance), or replace authenticate_as() with the inline set-role
# fallback shown in the header.
testfile="supabase/tests/${t}_rls_test.sql"
mkdir -p supabase/tests
if [ -e "$testfile" ]; then
  echo "test already exists, not overwriting: $testfile"
else
  cat > "$testfile" <<EOF
-- ${testfile}
-- pgTAP RLS scoping test for public.${t}.  Run:  supabase test db
-- Requires pgTAP (bundled with the Supabase CLI test runner) and basejump
-- supabase-test-helpers for tests.create_supabase_user/authenticate_as.
-- No helpers? Replace authenticate_as(x) with:
--   set local role authenticated;
--   set local request.jwt.claims to json_build_object('sub','<uuid>')::text;
begin;
select * from no_plan();

-- RLS must even be ON.
select tests.rls_enabled('public');

-- Seed two users; user_a owns a row.
select tests.create_supabase_user('user_a');
select tests.create_supabase_user('user_b');

select tests.authenticate_as('user_a');
insert into public.${t} (user_id, name)
  values (tests.get_supabase_uid('user_a'), 'a-row');

select is(
  (select count(*)::int from public.${t}),
  1,
  'user_a sees their own row'
);

-- The core scoping proof: a different user sees NONE of user_a's rows.
select tests.authenticate_as('user_b');
select is(
  (select count(*)::int from public.${t}),
  0,
  'user_b sees none of user_a''s rows'
);

-- And cannot forge a row owned by someone else.
select throws_ok(
  \$\$ insert into public.${t} (user_id, name)
       values (tests.get_supabase_uid('user_a'), 'forged') \$\$,
  null, null,
  'user_b cannot insert a row owned by user_a'
);

select * from finish();
rollback;
EOF
  echo "created $testfile"
fi

echo "Next: edit the columns, run 'supabase test db' to prove RLS scoping, then"
echo "run the security-monitor skill to confirm RLS coverage."

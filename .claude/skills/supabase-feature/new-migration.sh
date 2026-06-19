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
echo "Next: edit the columns, then run the security-monitor skill to confirm RLS coverage."

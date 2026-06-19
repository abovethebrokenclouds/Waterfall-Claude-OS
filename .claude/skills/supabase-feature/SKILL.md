---
name: supabase-feature
description: >-
  Add a Supabase-backed feature the secure way — scaffold a migration with RLS
  ENABLED and owner/workspace-scoped policies, plus a matching authenticated
  server accessor (TanStack server function on cairo-ai-pro, or a Deno Edge
  Function on Lovable-Cloud apps like waterfall-nexus). Use when adding a new
  table, persisted entity, or any server code that reads/writes user data.
  Defaults to the security-correct pattern so new tables are never left exposed
  via the anon key.
---

# Supabase Feature

A shared Waterfall Claude OS skill. Every public table MUST have RLS enabled with
policies that scope rows to their owner (or workspace) — otherwise the anon
publishable key can read/write it through PostgREST. The migration half is the
same across all Waterfall apps; the server accessor differs by stack (pick the
variant that matches the repo).

## Steps

1. Create a migration:
   ```bash
   bash .claude/skills/supabase-feature/new-migration.sh add_widgets
   ```
   This writes a timestamped file in `supabase/migrations/` pre-filled with the
   table + RLS + owner-scoped policies template below. Edit the columns.

2. Write a server accessor that uses an **RLS-scoped** client carrying the
   caller's JWT (never the service-role key for user-scoped reads/writes). Pick
   the variant for your repo:

   **Variant A — TanStack server function** (cairo-ai-pro):

   ```ts
   // src/lib/<area>/widgets.functions.ts
   import { createServerFn } from "@tanstack/react-start";
   import { z } from "zod";
   import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

   export const listWidgets = createServerFn({ method: "GET" })
     .middleware([requireSupabaseAuth])
     .handler(async ({ context }) => {
       const { data, error } = await context.supabase
         .from("widgets")
         .select("id, name, created_at")
         .order("created_at", { ascending: false });
       if (error) throw new Error(error.message);
       return data ?? [];
     });

   export const createWidget = createServerFn({ method: "POST" })
     .middleware([requireSupabaseAuth])
     .inputValidator((i) => z.object({ name: z.string().min(1).max(120) }).parse(i))
     .handler(async ({ context, data }) => {
       const { data: row, error } = await context.supabase
         .from("widgets")
         .insert({ user_id: context.userId, name: data.name })
         .select("id, name, created_at")
         .single();
       if (error) throw new Error(error.message);
       return row;
     });
   ```

   - `context.supabase` carries the caller's JWT, so RLS enforces ownership.
   - `context.userId` is the verified user id — always set `user_id` from it,
     never from client input.

   **Variant B — Supabase Edge Function** (Deno; Lovable-Cloud apps like
   waterfall-nexus, which deploy edge functions under `supabase/functions/`):

   ```ts
   // supabase/functions/widgets/index.ts
   import { createClient } from "jsr:@supabase/supabase-js@2";

   Deno.serve(async (req) => {
     // Forward the caller's JWT so RLS — not the key — decides what they can touch.
     const authorization = req.headers.get("Authorization") ?? "";
     const supabase = createClient(
       Deno.env.get("SUPABASE_URL")!,
       Deno.env.get("SUPABASE_ANON_KEY")!,            // anon key + user JWT, NOT service_role
       { global: { headers: { Authorization: authorization } } },
     );

     const { data: { user } } = await supabase.auth.getUser();
     if (!user) return new Response("Unauthorized", { status: 401 });

     if (req.method === "GET") {
       const { data, error } = await supabase
         .from("widgets").select("id, name, created_at")
         .order("created_at", { ascending: false });
       if (error) return new Response(error.message, { status: 400 });
       return Response.json(data ?? []);
     }
     if (req.method === "POST") {
       const { name } = await req.json();
       if (typeof name !== "string" || name.length < 1 || name.length > 120) {
         return new Response("invalid name", { status: 400 });
       }
       const { data, error } = await supabase
         .from("widgets")
         .insert({ user_id: user.id, name })          // user id from the verified JWT
         .select("id, name, created_at").single();
       if (error) return new Response(error.message, { status: 400 });
       return Response.json(data);
     }
     return new Response("Method Not Allowed", { status: 405 });
   });
   ```

   - The anon key + forwarded JWT means RLS enforces ownership; set `user_id`
     from `user.id`, never from the request body.

   **Both variants:** reserve the service-role client (bypasses RLS) for trusted
   server-only jobs (webhooks, aggregation) and authorize those yourself.

3. Validate: typecheck (`bun run typecheck` where applicable), then run the
   `security-monitor` skill — it confirms the new table has RLS and flags any
   `using (true)` policy.

## Migration template (what the scaffold writes)

```sql
create table if not exists public.widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_widgets_user on public.widgets(user_id);

alter table public.widgets enable row level security;
grant select, insert, update, delete on public.widgets to authenticated;
grant all on public.widgets to service_role;

create policy widgets_select on public.widgets for select using (user_id = auth.uid());
create policy widgets_insert on public.widgets for insert with check (user_id = auth.uid());
create policy widgets_update on public.widgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy widgets_delete on public.widgets for delete using (user_id = auth.uid());
```

For **workspace-scoped** tables, swap `user_id = auth.uid()` for a membership
check, e.g. `exists (select 1 from public.workspace_members m where m.workspace_id = widgets.workspace_id and m.user_id = auth.uid())`.
Only use `using (true)` for genuinely public/global catalog data.

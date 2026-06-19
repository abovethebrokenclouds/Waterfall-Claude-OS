# Example Workflow: Authoring a GitHub Action

Goal: add a `github.add_labels` action that applies labels to an existing issue.

## Trigger
An agent or workflow step needs to label an issue (e.g. triage automation tags
incoming bugs).

## Action flow
```text
agent/workflow step
  → actions/addLabels.ts  (ActionDefinition.run)
    → Input.parse(raw)              # zod validation
    → githubRequest(ctx, {...})     # POST /repos/{owner}/{repo}/issues/{n}/labels
    → LabelsSchema.parse(res.data)  # output validation
  → { ok: true, data, trace }
```

## Expected code touchpoints
1. `src/lib/integrations/github/schemas/github.schemas.ts` — add/confirm
   `LabelSchema` / `LabelsSchema` and reuse `OwnerSchema`, `RepoNameSchema`.
2. `src/lib/integrations/github/actions/addLabels.ts` — new file:
   ```ts
   const Input = z.object({
     owner: OwnerSchema,
     repo: RepoNameSchema,
     issueNumber: z.number().int().positive(),
     labels: z.array(z.string().min(1).max(50)).min(1).max(20),
   });
   export const addLabels: ActionDefinition<Input, GitHubLabel[]> = {
     name: 'github.add_labels',
     scopes: ['repo'],
     // examplePayload, errorCases (401/403/404/422), run(ctx, raw) → githubRequest
   };
   ```
3. `src/lib/integrations/github/actions/index.ts` — add `addLabels` to the
   `actions` map and the re-export list.
4. `src/lib/integrations/github/integration.json` — add `"github.add_labels"`
   to `capabilities.actions`.
5. (optional) `src/lib/integrations/github/tools/` — add a `github_add_labels`
   agent tool wrapper and list it in `capabilities.agentTools`.

## Verify
- `bun run typecheck` passes.
- The action appears in `actionList` and is callable through the engine.

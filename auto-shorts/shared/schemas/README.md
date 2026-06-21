# shared/schemas

Canonical **JSON Schema** for the entities that cross the language boundary
between the Node/TypeScript backend and the Python render worker. This is the one
place the wire contract is defined; both sides validate against it.

- `contracts.schema.json` — draft-07 schema with named `$defs`
  (`VideoSpec`, `RenderJob`, `Overlay`, `CaptionStyle`, …).

## Who validates what

- **Backend** (`backend/src/__tests__/schema.test.ts`) compiles the schema with
  `ajv` and asserts that a `VideoSpec` produced by `videoTemplateBuilder`
  validates against `#/$defs/VideoSpec`.
- **Worker** (`render-worker/tests/test_schema.py`) loads the same file with
  `jsonschema` and asserts the spec payload it consumes validates against the
  same `$defs`.

Because both languages validate against this single file, a drift between the
TypeScript types and the Python models surfaces as a failing test on whichever
side fell behind.

## Keeping it in sync

`shared/types/index.ts` (TypeScript) is the human-authored source of truth for
shapes; this schema mirrors it for runtime validation. When you change a contract
that crosses the boundary, update both, and the cross-language tests will confirm
the two agree.

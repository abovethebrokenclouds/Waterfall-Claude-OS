#!/usr/bin/env bash
# mcp-scaffold.sh — insurance-mcp-server skill helper
# Default: print the reference TypeScript MCP server scaffold (static, no AI calls, no network).
# --audit: advisory scan for MCP tool handlers that violate the delegation contract.
#
# Part of the Waterfall Claude OS insurance-mcp-server skill.
# Usage:
#   bash .claude/skills/insurance-mcp-server/mcp-scaffold.sh
#   bash .claude/skills/insurance-mcp-server/mcp-scaffold.sh --audit

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# ---------------------------------------------------------------------------
# Audit mode
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--audit" ]]; then
  SRC="src"

  finding() {
    local severity="$1"
    local message="$2"
    echo "  [${severity}] ${message}"
  }

  echo "=== insurance-mcp-server audit ==="
  echo "Checking MCP tool handler delegation + auth + idempotency..."
  echo ""

  if [[ ! -d "$SRC" ]]; then
    echo "  (no src/ directory found — skipping all checks)"
    echo ""
    echo "RESULT: advisory only — no src/ to scan"
    exit 0
  fi

  FINDINGS=0

  # --- Check 1: tool handlers that reimplement business logic instead of delegating ---
  # Flag files that contain rating/pricing logic (premium calc, loss-ratio math)
  # directly inside an MCP handler rather than delegating to the headless API client.
  REIMPL_PATTERNS=("calculatePremium\|computeRate\|lossRatio\|underwritingScore\|rateEngine")
  MCP_HANDLER_FILES=$(grep -rl "server\.tool\|tool\.register\|addTool\|defineTool" "$SRC" 2>/dev/null || true)

  if [[ -n "$MCP_HANDLER_FILES" ]]; then
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      if grep -qE "calculatePremium|computeRate|lossRatio|underwritingScore|rateEngine" "$file" 2>/dev/null; then
        finding "REVIEW" "$file — MCP tool handler appears to reimplement business logic; delegate to headless API client instead"
        FINDINGS=$((FINDINGS + 1))
      fi
    done <<< "$MCP_HANDLER_FILES"
  fi

  # --- Check 2: bind/payout tools without an idempotency key ---
  # Mutating tools (bind, payout, endorse, cancel) must enforce an idempotency_key param.
  MUTATING_TOOLS=("bind_policy\|bindPolicy\|payout\|disburs\|endorse_policy\|endorsePolicy\|cancel_policy\|cancelPolicy")
  ALL_TS_FILES=$(find "$SRC" -name "*.ts" -o -name "*.tsx" 2>/dev/null || true)

  if [[ -n "$ALL_TS_FILES" ]]; then
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      if grep -qE "bind_policy|bindPolicy|payout|disburs|endorse_policy|endorsePolicy|cancel_policy|cancelPolicy" "$file" 2>/dev/null; then
        if ! grep -qE "idempotency_key|idempotencyKey|idempotency-key" "$file" 2>/dev/null; then
          finding "REVIEW" "$file — mutating tool (bind/payout/endorse/cancel) with no idempotency key enforcement"
          FINDINGS=$((FINDINGS + 1))
        fi
      fi
    done <<< "$ALL_TS_FILES"
  fi

  # --- Check 3: MCP tool handlers lacking partner-scoped auth ---
  # Every tool handler should reference partner_id / partnerId or an auth middleware.
  if [[ -n "$MCP_HANDLER_FILES" ]]; then
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      if ! grep -qE "partner_id|partnerId|partnerAuth|partnerToken|validatePartner|requirePartner" "$file" 2>/dev/null; then
        finding "REVIEW" "$file — MCP tool handler has no visible partner-scoped auth; ensure auth middleware applies"
        FINDINGS=$((FINDINGS + 1))
      fi
    done <<< "$MCP_HANDLER_FILES"
  fi

  echo ""
  if [[ $FINDINGS -eq 0 ]]; then
    echo "RESULT: no advisory findings (or no MCP handler files detected)"
  else
    echo "RESULT: $FINDINGS advisory finding(s) — review before shipping to production"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Default: print reference scaffold
# ---------------------------------------------------------------------------

cat <<'SCAFFOLD'
// src/mcp/insurance-mcp-server.ts
// Reference MCP server scaffold — insurance-mcp-server skill
//
// Protocol: MCP (Model Context Protocol) over stdio transport
// Transport: @modelcontextprotocol/sdk StdioServerTransport
// This server is a DELEGATION layer — every tool calls the headless API client.
// No AI calls live here. AI triggered downstream routes through the Super Agent.
//
// Install deps (not included in scaffold):
//   npm install @modelcontextprotocol/sdk zod
//
// Run:
//   npx ts-node src/mcp/insurance-mcp-server.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createApiClient, type ApiClient } from "../lib/headless-api-client.js";
import { idempotencyCache } from "../lib/idempotency-cache.js";

// ---------------------------------------------------------------------------
// Partner auth middleware
// ---------------------------------------------------------------------------

async function resolvePartnerClient(bearerToken: string): Promise<ApiClient> {
  // Delegates to embedded-insurance-sdk headless API /api/v1/partner/auth
  // Returns a scoped client; throws if token is invalid or expired.
  return createApiClient({ bearerToken });
}

function isSandboxToken(token: string): boolean {
  return token.startsWith("sk_test_");
}

// ---------------------------------------------------------------------------
// MCP server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "insurance-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// Tool: get_quote
// ---------------------------------------------------------------------------

const GetQuoteInput = z.object({
  product: z.enum(["auto", "renters", "travel", "pet", "gadget", "shipping"]),
  zip: z.string().regex(/^\d{5}$/),
  vehicle_year: z.number().int().min(1980).max(2030).optional(),
  vehicle_value: z.number().positive().optional(),
  property_value: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// Tool: bind_policy
// ---------------------------------------------------------------------------

const BindPolicyInput = z.object({
  quote_id: z.string(),
  idempotency_key: z.string().uuid(),   // REQUIRED — enforced before any write
  insured: z.object({
    name: z.string(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    address: z.string(),
    email: z.string().email(),
  }),
  payment_method_token: z.string(),
});

// ---------------------------------------------------------------------------
// Tool: file_claim
// ---------------------------------------------------------------------------

const FileClaimInput = z.object({
  policy_id: z.string(),
  idempotency_key: z.string().uuid(),   // REQUIRED — safe retries
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(2000),
  media_urls: z.array(z.string().url()).optional(),
});

// ---------------------------------------------------------------------------
// Tool: issue_coi
// ---------------------------------------------------------------------------

const IssueCOIInput = z.object({
  policy_id: z.string(),
  certificate_holder: z.string(),
  holder_email: z.string().email().optional(),
});

// ---------------------------------------------------------------------------
// List tools handler
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_quote",
      description:
        "Return a bindable insurance quote. Read-only; cached 15 min by quote_id.",
      inputSchema: {
        type: "object",
        properties: {
          product: { type: "string", enum: ["auto", "renters", "travel", "pet", "gadget", "shipping"] },
          zip: { type: "string", pattern: "^\\d{5}$" },
          vehicle_year: { type: "integer" },
          vehicle_value: { type: "number" },
          property_value: { type: "number" },
        },
        required: ["product", "zip"],
      },
    },
    {
      name: "bind_policy",
      description:
        "Bind a quoted policy and issue documents. Mutating — supply idempotency_key (UUID v4).",
      inputSchema: {
        type: "object",
        properties: {
          quote_id: { type: "string" },
          idempotency_key: { type: "string", format: "uuid" },
          insured: {
            type: "object",
            properties: {
              name: { type: "string" },
              dob: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              address: { type: "string" },
              email: { type: "string", format: "email" },
            },
            required: ["name", "dob", "address", "email"],
          },
          payment_method_token: { type: "string" },
        },
        required: ["quote_id", "idempotency_key", "insured", "payment_method_token"],
      },
    },
    {
      name: "file_claim",
      description:
        "Open a FNOL claim. Hands off to claims-automation agent via headless API. " +
        "Mutating — supply idempotency_key (UUID v4).",
      inputSchema: {
        type: "object",
        properties: {
          policy_id: { type: "string" },
          idempotency_key: { type: "string", format: "uuid" },
          incident_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          description: { type: "string", maxLength: 2000 },
          media_urls: { type: "array", items: { type: "string", format: "uri" } },
        },
        required: ["policy_id", "idempotency_key", "incident_date", "description"],
      },
    },
    {
      name: "issue_coi",
      description:
        "Generate a real-time Certificate of Insurance for an active policy. " +
        "Delegates to coi-live-certificate skill via headless API.",
      inputSchema: {
        type: "object",
        properties: {
          policy_id: { type: "string" },
          certificate_holder: { type: "string" },
          holder_email: { type: "string", format: "email" },
        },
        required: ["policy_id", "certificate_holder"],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Call tool handler
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Resolve partner from auth — every tool requires a scoped client
  const bearerToken = (request.params as Record<string, unknown>)["_bearer"] as string ?? "";
  if (!bearerToken) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Missing Authorization header" }) }], isError: true };
  }
  const client = await resolvePartnerClient(bearerToken);
  const sandbox = isSandboxToken(bearerToken);

  if (name === "get_quote") {
    const input = GetQuoteInput.parse(args);
    // Delegate — no business logic here
    const result = await client.get("/api/v1/quote", { ...input, sandbox });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  if (name === "bind_policy") {
    const input = BindPolicyInput.parse(args);
    // Idempotency gate — return cached result if key already seen
    const cached = idempotencyCache.get(input.idempotency_key);
    if (cached) return { content: [{ type: "text", text: JSON.stringify(cached) }] };
    const result = await client.post("/api/v1/bind", { ...input, sandbox });
    idempotencyCache.set(input.idempotency_key, result, 86_400);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  if (name === "file_claim") {
    const input = FileClaimInput.parse(args);
    const cached = idempotencyCache.get(input.idempotency_key);
    if (cached) return { content: [{ type: "text", text: JSON.stringify(cached) }] };
    // Delegates to headless API → claims-automation FNOL agent (Super Agent routed)
    const result = await client.post("/api/v1/claims", { ...input, sandbox });
    idempotencyCache.set(input.idempotency_key, result, 86_400);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  if (name === "issue_coi") {
    const input = IssueCOIInput.parse(args);
    // Delegates to headless API → coi-live-certificate skill
    const result = await client.post("/api/v1/certificates", { ...input, sandbox });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
    isError: true,
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits — no AI calls, no model fetches here.
}

main().catch((err) => {
  console.error("insurance-mcp-server fatal:", err);
  process.exit(1);
});
SCAFFOLD

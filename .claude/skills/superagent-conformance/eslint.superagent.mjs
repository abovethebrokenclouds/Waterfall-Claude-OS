// eslint.superagent.mjs — flat-config fragment enforcing THE ONE RULE via AST.
//
// AST-accurate counterpart to scan.sh: fewer false positives (won't match a
// model string inside a comment/doc), catches aliased imports, and gives editor
// squiggles. The grep scanner stays the portable, dependency-free gate; wire
// this in where the repo already runs ESLint for precise enforcement.
//
// Merge into a repo's eslint.config.js (flat config):
//
//   import superagent from "./.claude/skills/superagent-conformance/eslint.superagent.mjs";
//   export default [ ...superagent, /* the rest of your config */ ];
//
// Files under the model-access engine are exempted — only the engine may hold
// provider SDKs, model strings, and token caps. Tune `enginePaths` per repo
// (keep it in sync with allowlist.txt used by scan.sh).

const enginePaths = [
  "**/agent/superAgent*",
  "**/super-agent/**",
  "src/lib/ai/**",
  "**/*.gen.*",
];

const providerImport = (name) => ({
  name,
  message:
    "Route AI through the Super Agent — only the engine may import a provider SDK.",
});

export default [
  // HIGH — hard violations of the contract (provider SDKs, model strings).
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: enginePaths,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            providerImport("@anthropic-ai/sdk"),
            providerImport("openai"),
            providerImport("@google/generative-ai"),
            providerImport("@mistralai/mistralai"),
            providerImport("cohere-ai"),
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // A literal that looks like a concrete model id.
          selector: "Literal[value=/^(claude-|gpt-|gemini-)/]",
          message:
            "Hardcoded model string — refer to a tier (OPUS/SONNET/HAIKU); concrete models live only in the engine.",
        },
        {
          // new Anthropic(...) / new OpenAI(...) constructed outside the engine.
          selector:
            "NewExpression[callee.name=/^(Anthropic|OpenAI|GoogleGenerativeAI)$/]",
          message:
            "Provider client constructed in app code — only the engine may construct a provider client.",
        },
      ],
    },
  },
  // REVIEW — advisory (maxTokens also appears in non-AI/UI contexts).
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: enginePaths,
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "Property[key.name=/^(max_tokens|maxTokens)$/][value.type='Literal']",
          message:
            "Manual token cap — caps are set centrally per app/task inside the engine.",
        },
      ],
    },
  },
];

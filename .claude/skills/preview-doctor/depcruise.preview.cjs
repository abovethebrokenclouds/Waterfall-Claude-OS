// depcruise.preview.cjs — dependency-cruiser config for the preview-safety gate.
//
// Why: vite dev does NO tree-shaking, and routeTree.gen.ts statically imports
// every route, so any module reachable from a route that pulls a Node built-in
// (`fs`, `crypto`, `path`, …) crashes the client bundle. grep only sees the
// literal import line; dependency-cruiser resolves the real import graph and
// follows re-exports, so it catches built-ins reached transitively.
//
// Usage (only runs if dependency-cruiser is installed — diagnose.sh auto-detects):
//   npx depcruise --config .claude/skills/preview-doctor/depcruise.preview.cjs src
//
// Server-only modules legitimately use Node built-ins, so *.server.ts and the
// Worker entry are excluded from the client-graph rule.

module.exports = {
  forbidden: [
    {
      name: "no-node-builtins-in-client",
      comment:
        "Node core modules must not reach the client graph — vite dev has no tree-shaking. Use Web APIs or lazy-import inside a server handler.",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: "\\.server\\.(ts|tsx)$|^src/server\\.ts$|\\.gen\\.",
      },
      to: { dependencyTypes: ["core"] },
    },
  ],
  options: {
    doNotFollow: { dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-bundled"] },
    tsPreCompilationDeps: true,
    // Picked up automatically if present; harmless if the repo has no tsconfig.
    tsConfig: { fileName: "tsconfig.json" },
  },
};

// Allow side-effect imports of stylesheets (e.g. `import "./globals.css"`) when
// `tsc --noEmit` runs in CI *before* `next build` has generated the (gitignored)
// next-env.d.ts that normally declares these. Keeps typecheck build-order
// independent.
declare module "*.css";

# 018. bun hoisted linker for the monorepo

**Status:** Accepted
**Date:** 2026-07-17

## Context

bun 1.3 defaults to the **isolated** linker in workspaces (pnpm-style symlinked store under `node_modules/.bun`). Metro and Babel resolve transitive packages by walking `node_modules` from the project directory, so with isolated installs `expo export` and `expo run:*` failed in `apps/mobile`: first `Cannot find module 'babel-preset-expo'`, then `@babel/plugin-transform-react-jsx`, and a misleading downstream `Cannot read properties of undefined (reading 'transformFile')`. Adding each missing package as a direct dependency is whack-a-mole against Metro's entire transitive graph.

## Decision

Set the **hoisted** linker for the whole repo in `bunfig.toml`:

```toml
[install]
linker = "hoisted"
```

This is the node_modules layout Expo's monorepo guide assumes; `expo/metro-config` auto-detects the workspace root and resolves everything without custom `watchFolders`.

## Alternatives Considered

- **Keep isolated, add missing packages as direct deps** — rejected. Endless whack-a-mole; breaks again with every SDK upgrade.
- **Custom Metro `nodeModulesPaths` into the `.bun` store** — rejected. Fights the tool; Babel's own `require` resolution still fails.

## Consequences

- All workspace dependencies hoist to the root `node_modules`; version conflicts across workspaces surface at install time (aligns with the single-version-per-dependency monorepo rule).
- `bun.lock` was regenerated once when switching.
- Any future workspace (admin, packages/shared) inherits the same layout; no per-app Metro resolution config needed.

# 017. NativeWind 4 stable over v5 preview

**Status:** Accepted
**Date:** 2026-07-17

## Context

RAPP-7 scaffolds the mobile app and had to pick the NativeWind version. Expo's current official `expo-tailwind-setup` skill prescribes `nativewind@5.0.0-preview.x` plus a nightly `react-native-css` build (Tailwind v4, CSS-first config, `useCssElement` wrappers around every RN component). At execution time (2026-07-17) the npm dist-tags are: `latest` 4.2.6, `preview` 5.0.0-preview.4, and `react-native-css` still publishes nightlies. NativeWind 5 has not reached stable.

This app holds asylum-seekers' data and must run for years on Ramassà's budget. A pre-release styling foundation means chasing breaking changes across previews and nightlies for the life of the project.

## Decision

Pin **`nativewind@4.2.6`** (stable) with **`tailwindcss@3.4.x`** and the classic setup: `tailwind.config.js` with `nativewind/preset`, `babel-preset-expo` with `jsxImportSource: "nativewind"` + `nativewind/babel`, `withNativeWind` in `metro.config.js`, `@tailwind` directives in `src/global.css`. Verified working on the SDK 57 / React 19 / New Architecture baseline (iOS simulator, Android, Expo Web export).

Revisit NativeWind 5 after launch, once it ships a stable release; migrate then as its own issue.

## Alternatives Considered

- **NativeWind 5 preview + react-native-css nightly (Expo's skill)** — rejected for now. Pre-release deps as the styling foundation of a client app is the wrong risk profile; the `useCssElement` wrapper pattern also touches every component, making a later downgrade expensive. Upgrading 4 → 5 later is the cheaper direction.
- **No Tailwind, StyleSheet only** — rejected. SPEC and ADR-015 assume shared Tailwind tokens across mobile and admin.

## Consequences

- Tailwind stays at v3 syntax in the mobile app while the admin app (RAPP-8) may use v4; the shared token source (ADR-015, `packages/shared`) is a TS file consumed by both configs, so tokens stay unified regardless.
- `tailwind.config.js` `theme.extend` is the RAPP-9 hook point for shared tokens.
- A NativeWind 5 migration issue must be filed post-launch when v5 is stable.

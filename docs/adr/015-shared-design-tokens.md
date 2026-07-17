# 015. Shared design tokens

**Status:** Accepted
**Date:** 2026-04-09

## Context

Two separate apps (Expo mobile, Next.js admin) need consistent branding. White-label support requires runtime color overrides per organization. Raw hex codes and pixel values scattered across components would make theming impossible.

## Decision

Define all design tokens in `packages/shared/lib/tokens.ts`. Both NativeWind (mobile) and Tailwind (admin) extend their configs from this single source. No raw hex codes or pixel values in components — always reference tokens.

## Alternatives Considered

- **Duplicate token files per app** — rejected. Causes drift between apps. One change requires updating two files.
- **CSS custom properties only** — rejected. Doesn't work well in React Native (NativeWind needs JS values). The shared TS file works for both platforms.

## Consequences

- Single source of truth for colors, spacing, radius, font sizes, tap targets, upload limits
- White-label orgs can override colors at runtime via `organizations` table
- Both apps stay visually consistent
- Adding a new token requires updating one file, both apps pick it up

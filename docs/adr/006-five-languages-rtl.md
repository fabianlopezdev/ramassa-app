# 006. 5 languages with RTL from day 1

**Status:** Accepted
**Date:** 2026-04-09

## Context

Catalan is mandatory (Generalitat grant requirement). The target population includes speakers of Spanish, English, Arabic, and Farsi. Adding RTL support after the fact requires refactoring every style that uses `left`/`right`.

## Decision

Support all 5 languages (CA, ES, EN, AR, FA) from the initial release. Use `start`/`end` instead of `left`/`right` in all styles from day 1. Bundle Arabic and Farsi fonts in the mobile app.

## Alternatives Considered

- **Start with CA/ES/EN, add AR/FA later** — rejected. Retrofitting RTL is painful and error-prone. Every component would need style review. Building RTL-first is cheaper than retrofitting.

## Consequences

- Larger initial translation effort (5 files instead of 3)
- RTL must be tested on every UI task (`/react-native-perfection` enforces this)
- Arabic/Farsi fonts increase mobile bundle size slightly
- Immediate accessibility for Arabic and Farsi speakers from launch

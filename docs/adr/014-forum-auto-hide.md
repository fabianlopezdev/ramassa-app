# 014. Forum auto-hide at 3 flags

**Status:** Accepted
**Date:** 2026-04-09

## Context

The community forum needs moderation. With 35-50 users, staff can't monitor every post in real-time. Flagged content should be handled automatically to keep the space safe, with staff reviewing afterward.

## Decision

Posts and replies are auto-hidden after 3 flags from different users. Hidden content goes to a staff moderation queue. Staff can dismiss flags (restore), keep hidden, or delete. The threshold is stored in shared constants (`tokens.forum.autoHideFlagThreshold`).

## Alternatives Considered

- **Flag but don't hide until staff reviews** — rejected. Harmful content stays visible until staff acts. Unacceptable for a safe space serving vulnerable women.
- **Immediate hide on first flag** — rejected. Too easy to abuse (one person could hide any post).
- **AI moderation** — rejected. Adds complexity, cost, and language challenges (5 languages including Farsi). Overkill for 35-50 users.

## Consequences

- Community is safer by default — harmful content auto-hides quickly
- Threshold may need tuning (3 might be too aggressive or too lenient for 35-50 users)
- Staff moderation queue needed in admin panel
- Threshold is configurable via shared constants (easy to adjust)

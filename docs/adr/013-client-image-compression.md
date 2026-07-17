# 013. Client-side image compression before upload

**Status:** Accepted
**Date:** 2026-04-09

## Context

Players may have limited mobile data plans. Photos from modern phones are 3-8MB. Uploading raw photos wastes bandwidth and storage. Video is capped at 10MB.

## Decision

Compress images on the client before uploading to R2. Max 1MB / 1200px width for images via `expo-image-manipulator`. Max 10MB for videos (no client-side video compression in MVP).

## Alternatives Considered

- **Server-side compression** — rejected. The full-size image still gets uploaded, wasting bandwidth. Compression after upload doesn't help users on limited data plans.
- **No compression** — rejected. Storage costs grow faster, uploads take longer on poor connections.

## Consequences

- Faster uploads for users on slow/limited connections
- Lower R2 storage costs
- `expo-image-manipulator` added to mobile bundle
- Image quality slightly reduced (acceptable for forum/gallery use)
- Video compression deferred — may add in future if 10MB cap proves insufficient

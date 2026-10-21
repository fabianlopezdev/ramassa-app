# ADR-028: Independent app terms and season authorization signatures

Date: 2026-10-21
Status: Accepted
Issues: RAPP-584, RAPP-591

## Context

App terms belong to registration. Participation authorization belongs to the current season and published authorization version. A player may already have a valid digital or paper season authorization. Showing one combined step count implied that every new login needed the same seasonal signing flow.

## Decision

Keep app registration and season authorization as separate flows. App registration has its own personalized progress. The existing backend authorization status decides whether the player then sees the three season authorization screens or Home.

Store the app signature and its photo/video choice against one terms acceptance in `app_terms_signatures`. Keep season signatures in the existing authorization tables. The two records have independent lifetimes and cannot stand in for one another.

The new `complete_onboarding_signed` RPC saves the profile, terms acceptance and app signature in one transaction. Its exposed entry point uses invoker security; a private definer performs validated writes with a pinned search path. Authenticated clients cannot write signature rows directly. This follows [Supabase function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker) and [PostgreSQL transaction semantics](https://www.postgresql.org/docs/17/tutorial-transactions.html).

## Alternatives considered

- One combined authorization record and stepper: couples app and season decisions and misrepresents players whose season authorization is already valid.
- Reuse a season signature for app terms: provides no distinct evidence of which app terms and media decision were accepted.
- Separate client writes for profile, acceptance and signature: permits partially completed registration if any request fails.

## Consequences

- Both flows reuse the same signature controls and accessible alternative to drawing.
- The server validates explicit terms acceptance, signature shape and the media choice together.
- Reading signatures requires ownership, or both personal and sensitive participant permissions within the same organization. [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) enforces this independently of the UI.
- Deleting the acceptance or participant cascades to the app signature. Erasure coverage includes the new table.
- The legacy completion RPC remains available for compatibility. The updated mobile flow uses the signed RPC.
- Existing historical acceptances do not gain fabricated signatures. Synthetic seed data is explicitly marked as such.
- The five prepared season document translations are development content. This change does not publish legal text to a production organization.

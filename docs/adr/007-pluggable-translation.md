# 007. Pluggable auto-translation provider

**Status:** Accepted
**Date:** 2026-04-09

## Context

Staff writes content in Catalan. The system must auto-translate to ES, EN, AR, FA. DeepL supports CA→ES/EN/AR but not Farsi. Claude API supports all 5 languages. Costs are negligible at current volume (~cents/month). We don't want to lock into a provider before evaluating quality.

## Decision

Implement a pluggable `TranslationProvider` interface in the Cloudflare Worker that handles auto-translation. The provider can be swapped at deploy time without app code changes.

```ts
interface TranslationProvider {
  translate(text: string, from: Language, to: Language[]): Promise<Record<Language, string>>;
}
```

## Alternatives Considered

- **Hard-code DeepL** — rejected. Doesn't support Farsi, would need a second provider anyway.
- **Hard-code Claude API** — rejected. Locks us in before evaluating quality and cost at scale.
- **Hybrid (DeepL + Claude)** — viable but premature. The interface supports this as one possible implementation.

## Consequences

- Decision on specific provider deferred to implementation time (Phase 3)
- Staff can always review/correct translations before publishing
- Adding a new provider requires implementing one interface method
- Testing requires mocking the provider

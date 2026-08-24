# OWASP MASVS checklist

Baseline: OWASP MASVS controls as published at https://mas.owasp.org/MASVS/ on 2026-08-24.

Status meanings:

- PASS: verified in source, configuration, tests, or the reset database.
- N/A: the control is outside this app's stated threat model and no sensitive decision relies on it.
- PROD GATE: code is ready, but the control requires client-owned production infrastructure.

| Control            | Status    | Ramassa evidence                                                                                                                                         |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MASVS-STORAGE-1    | PASS      | Auth and private MMKV stores use AES-256 with SecureStore-backed per-store keys. Android backup and device transfer are disabled.                        |
| MASVS-STORAGE-2    | PASS      | Shared logger and Sentry-extra redaction are tested. Sensitive values are excluded from logs and retained diagnostic context.                            |
| MASVS-CRYPTO-1     | PASS      | Device storage uses platform-backed key storage and AES-256. Database sensitive fields use Vault-backed pgcrypto helpers.                                |
| MASVS-CRYPTO-2     | PASS      | Keys use platform CSPRNG bytes. Device keys remain in SecureStore and the database key remains server-side in Vault.                                     |
| MASVS-AUTH-1       | PASS      | Supabase validates identity. Postgres RLS, RPC guards, and Worker JWT plus RLS profile resolution enforce authorization server-side.                     |
| MASVS-AUTH-2       | PASS      | Primary login uses an email-bound OTP. Password fallback is staff-provisioned, hashed, rate-limited, and never logged or stored in plaintext.            |
| MASVS-AUTH-3       | PROD GATE | Local JWT expiry and refresh rotation are configured. Production time-boxing, inactivity timeout, and single-session policy are required by RAPP-74.     |
| MASVS-NETWORK-1    | PASS      | Production endpoints are HTTPS. No code disables TLS validation. Plain HTTP values are limited to loopback development.                                  |
| MASVS-NETWORK-2    | N/A       | Certificate pinning is not required for the current rotating Supabase, Cloudflare, and Sentry SaaS endpoints. Platform trust validation remains enabled. |
| MASVS-PLATFORM-1   | PASS      | Permissions are feature-scoped, backup is disabled, and no sensitive exported native component or WebView bridge is introduced by app code.              |
| MASVS-PLATFORM-2   | PASS      | The auth custom-scheme bearer callback was removed. External links use validated application data and do not carry credentials.                          |
| MASVS-PLATFORM-3   | PASS      | Push content is minimized, protected values are not logged, and credentials are handled only in dedicated masked or one-time UI.                         |
| MASVS-CODE-1       | PASS      | Strict TypeScript, schema validation, centralized typed errors, full lint, typecheck, tests, and production builds are enforced.                         |
| MASVS-CODE-2       | PASS      | Untrusted inputs cross Zod, Postgres constraints, RLS, or Worker validation boundaries before use.                                                       |
| MASVS-CODE-3       | PASS      | Patchable dependency advisories were upgraded. The two unpatched `image-size` loops are covered by a reproducible Bun patch and contract test.           |
| MASVS-CODE-4       | PASS      | Deepsec scanned the repository, findings were independently revalidated, and all confirmed findings have focused regression coverage.                    |
| MASVS-RESILIENCE-1 | N/A       | Root or jailbreak detection is not an authorization boundary. All protected decisions remain server-side.                                                |
| MASVS-RESILIENCE-2 | N/A       | Anti-debugging and anti-emulation controls are not part of the baseline threat model and would not protect server-held keys or RLS.                      |
| MASVS-RESILIENCE-3 | PASS      | Release artifacts use platform signing and CI deploys the exact verified commit. Dev-only controls are excluded from production bundles.                 |
| MASVS-RESILIENCE-4 | N/A       | Code obfuscation is not treated as a security control. No production secret is embedded in the client.                                                   |
| MASVS-PRIVACY-1    | PASS      | Permissions, stored fields, analytics, and diagnostic context are minimized for the product purpose.                                                     |
| MASVS-PRIVACY-2    | PASS      | Opaque identifiers are used for diagnostics. Sentry default PII and session replay are disabled.                                                         |
| MASVS-PRIVACY-3    | PASS      | Onboarding records consent, participant data is tenant-scoped, and export, access audit, retention, and deletion workflows are implemented.              |
| MASVS-PRIVACY-4    | PROD GATE | Code-level privacy controls pass. Final declarations, provider ownership, retention, and production event sampling require RAPP-74 and RAPP-83.          |

## Conclusion

All code-verifiable baseline controls pass or have a documented not-applicable rationale. The two production-gated controls do not permit production data yet. They become verifiable only after Ramassa-owned Supabase and Sentry infrastructure exists.

# Accessibility conformance and audit evidence

Last updated: 2026-08-23

## Conformance statement

Ramassà targets WCAG 2.2 Level AA for the staff admin, entity portal, player web app, and native player app. Automated web coverage currently reports zero WCAG A or AA violations across every practical seeded and static route. Direct Android and iOS checks confirm accessible names, reading order, 200 percent large-text behavior, 48dp minimum touch targets, contrast-token compliance, and Arabic right-to-left layout across the practical native player flows.

This statement remains provisional until the final physical-iPhone VoiceOver walkthrough is recorded. Accessibility is an ongoing product requirement. The CI accessibility gate must remain green for every change.

## Automated web evidence

Command: `bun run qa:accessibility:web`

- 13 Playwright scenarios passed on 2026-08-23.
- 70 practical routes were scanned in the default locale: 36 staff, 9 entity, and 25 player routes.
- 69 authenticated routes were scanned again in Arabic with `lang="ar"` and `dir="rtl"` asserted.
- axe was configured for WCAG 2.0 A and AA, WCAG 2.1 A and AA, and WCAG 2.2 AA.
- Zero axe violations were reported.
- Every embedded frame must expose a non-empty accessible title. Axe scans the Ramassà-owned document while third-party frame descendants remain outside the product's control boundary.
- Keyboard-only checks cover the skip link, admin route changes, player tab navigation, and destination focus.
- Destructive-dialog checks cover initial focus, focus containment, Escape dismissal, and trigger-focus restoration.
- The same command runs in the `accessibility-web` CI job.

## Direct native evidence

| Platform                          | Coverage                                                                           | Result                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Android emulator                  | TalkBack traversal across 25 practical player routes in Arabic                     | Spoken focus on every route; zero unlabeled clickable controls |
| Android emulator                  | 200 percent font scale on onboarding, home feed, and services directory            | No clipped controls; date fields stack before 200 percent      |
| Android emulator                  | 48dp minimum target sweep across 25 practical player routes                        | Zero undersized app controls after fixes                       |
| Android emulator                  | Arabic player flows, including calendar, forum, gallery, service, and private chat | Layout, mixed text, navigation, cards, and dates mirror        |
| iPhone 17 Pro simulator, iOS 26.5 | Accessibility hierarchy across 25 practical player routes                          | Zero unlabeled controls and zero sub-48pt app targets          |
| iPhone 17 Pro simulator, iOS 26.5 | Accessibility Inspector audit on onboarding, home feed, and services directory     | Zero Ramassà app warnings                                      |
| iPhone 17 Pro simulator, iOS 26.5 | 235 percent content size on onboarding, home feed, and services directory          | No clipped controls; date fields stack correctly               |
| iPhone 17 Pro simulator, iOS 26.5 | Arabic player flows, including calendar, forum, gallery, service, and private chat | Layout, mixed text, navigation, cards, and dates mirror        |

Accessibility Inspector reported one warning on the Arabic onboarding screen for the Expo development-client gear control. That control is not part of the production Ramassà app and is excluded from the product finding count.

## Findings and resolutions

| Finding                                                                                                | Resolution                                                                                                        | Regression evidence                                                                                               | Status   |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Native shared press controls were not always exposed as one accessible element                         | `PressableScale` now sets the native accessibility-element contract                                               | Source contract failed before the change and passes after it                                                      | Resolved |
| Some shared press controls exposed less than 48dp in one dimension                                     | The shared primitive now enforces the 48dp token in both dimensions                                               | Source contract failed before the change; complete Android and iOS target sweeps pass                             | Resolved |
| Onboarding date inputs could compress at high font scale                                               | Date fields stack when font scale reaches the accessibility threshold                                             | Source contract failed before the change and passes after it; verified at 200 percent Android and 235 percent iOS | Resolved |
| Some mobile actions and meaningful media lacked complete translated accessible names or state          | Added translated labels, roles, values, busy state, progress, and mixed-direction handling                        | Mobile accessibility contract and direct hierarchy checks pass                                                    | Resolved |
| The gallery consent switch exposed only its 28pt visual height on iOS                                  | Scaled the native iOS switch to 48pt while preserving its switch role and checked value                           | Source contract failed before the change; iOS reports 108 by 48pt and Android reports a labeled 48dp switch       | Resolved |
| Private team chat announced the raw `playerThreadTitle` key                                            | Reused the catalog-backed `playerTitle` key available in all five languages                                       | Focused contract failed before the change; Arabic iOS hierarchy now reports `الدردشة مع الفريق`                   | Resolved |
| Profile loading states used accessible names without a permitted semantic role on web                  | Added the progressbar role to labeled busy profile states                                                         | Source contract failed before the change; the dynamic-key route-wide axe sweep passes                             | Resolved |
| Player web route changes did not consistently move focus into the destination                          | Added destination-heading focus management                                                                        | Source contract and keyboard-only Playwright route test pass                                                      | Resolved |
| Admin route changes did not consistently focus the destination landmark                                | Added a route focus manager to staff and entity shells                                                            | Source contract and keyboard-only Playwright route test pass                                                      | Resolved |
| Destructive modal surfaces lacked a shared focus-management contract                                   | Added the focus-managed dialog primitive and migrated destructive flows                                           | Dialog source contract and Playwright focus-cycle test pass                                                       | Resolved |
| Several admin controls used incomplete roles, names, or form associations                              | Corrected semantic roles, labels, placeholders, and control relationships                                         | Full axe route sweep reports zero violations                                                                      | Resolved |
| Error text tokens did not guarantee AA contrast on light and dark surfaces                             | Updated the semantic error token and added ratio assertions                                                       | Shared-token contrast tests pass                                                                                  | Resolved |
| Web locale changes did not consistently expose document language and direction                         | Synchronized root `lang` and `dir` for staff, entity, and player web                                              | Full Arabic route sweep asserts RTL semantics and reports zero axe violations                                     | Resolved |
| Hosted accessibility CI resolved a newer Supabase runtime than local QA, changing seeded auth behavior | Pinned the proven CLI version and exported that runtime's generated public key into the browser gate              | Source contract failed before the change; all hosted authenticated staff, entity, and player routes pass          | Resolved |
| Hosted axe entered the allowlisted YouTube frame and reported provider-owned internal ARIA defects     | Require an accessible frame title, exclude third-party frame descendants, and continue scanning Ramassà-owned DOM | Source contract failed before the change; the complete 13-scenario local gate passes, including both video routes | Resolved |

## Focused regression evidence

Command:

```bash
bun test apps/mobile/src/lib/phase-six-accessibility-i18n-contract.test.ts \
  apps/mobile/src/lib/message-thread-ui-contract.test.ts \
  apps/admin/src/lib/wcag-aa-contract.test.ts \
  packages/shared/tokens/tokens.test.ts
```

Result on 2026-08-23: 35 passed, 0 failed, with 226 assertions.

Command: `bun run typecheck`

Result on 2026-08-23: root, shared package, mobile, admin, media worker, and translation worker all passed.

## Cumulative regression evidence

- `bun test`: 1,201 passed, 0 failed, 1 expected local-stack skip, and 6,166 assertions.
- `bun run lint`: passed with no findings.
- `bun run format:check`: passed.
- `bun run typecheck`: passed across every workspace.
- `bun run qa:accessibility:web`: 13 passed, 0 failed.

## Sentry review

The read-only Ramassà Sentry projects were reviewed on 2026-08-23 using the token stored in macOS Keychain. No event title or transaction identified an accessibility, focus, screen-reader, text-scaling, contrast, keyboard, or RTL regression.

Recent unresolved admin events were handled validation, local Headless Chrome, local data-contract, or local network failures. The only mobile issue last seen on 2026-08-22 was an Expo push-token DNS failure against `exp.host` in the development environment. These findings are unrelated to the RAPP-66 accessibility changes and remain visible in Sentry for their owning issues.

## Remaining closure evidence

- Complete and record VoiceOver on a physical iPhone. VoiceOver is not available in Simulator, so the simulator hierarchy and Accessibility Inspector evidence cannot replace this check.
- Record the final commit, CI run, automatic deployment, remote-main parity, and clean runtime cleanup.

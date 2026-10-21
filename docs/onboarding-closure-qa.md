# Onboarding closure QA (RAPP-591)

Date: 2026-10-21. Scope: accumulated onboarding changes, app terms signatures, independent season authorization and their shared form/choice components. QA uses synthetic local records. The development database, real phone and production database are not reset by this closure.

## Review stages

| Stage                                   | Result      | Corrections or deliberate exceptions                                                                                                                                                           |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Native structure                     | Complete    | Selectable legal/error text, tabular character counter, continuous corners and explicit notification modal cover guard. Existing indirect app-lock guard was already present.                  |
| 2. Accessibility and i18n               | Complete    | Language pronunciation metadata on the accessible control, contrast-safe selected labels, corrected validation messages clear as answers change.                                               |
| 3. NativeWind setup                     | Complete    | Verified installed NativeWind 4/Tailwind 3 integration and generated utilities. No preview-version migration. No API routes or embedded DOM components to review.                              |
| 4. Data loading and recovery            | Complete    | Account-scoped drafts, offline paused-query recovery and latest-draft merges when revisiting earlier forms.                                                                                    |
| 5. Composition                          | Complete    | Shared FormScreen, AuthSubmitButton, SelectionChoiceSurface, ChoiceGrid, FormTextField, FormTextArea and SignatureSection already own the repeated behavior. No speculative abstraction added. |
| 6. Native performance                   | Complete    | Hoisted depth animation timing configurations, with repeated-press regression. No new dependency or per-frame React state.                                                                     |
| 7. React and async lifecycle            | Complete    | Clear the submitting account's draft explicitly when a late request finishes after switching accounts.                                                                                         |
| 8. Independent adversarial verification | In progress | Native assistive activation, cancellation and explicit web disabled/busy state are under final verification.                                                                                   |

Rules are applied with the project's precedence: keep custom RTL-safe wizard headers, manual safe-area/footer ownership and existing virtualized picker FlatLists. Automatic scroll insets would duplicate the shared layout's insets. No blanket callback memoization, list-library substitution or NativeWind upgrade is justified by a measured regression. These are recorded exceptions, not claims of literal compliance with every generic skill preference.

## Significant fixes

- Drafts belong to a specific authenticated account, including completion cleanup after an account switch. Signed-out reads cannot expose the previous person's answers. An old device-wide draft with no provable owner is discarded on upgrade; this can require restarting an unfinished old intake.
- Saving a revisited form merges current stored answers, avoiding a stale mounted screen overwriting answers entered later. Background updates cannot overwrite a newer name edit.
- An offline initial intake shows the translated network error and retry action instead of an indefinite skeleton. Hosted connections still honor network status; the existing development-only HTTP loopback exception supports USB testing.
- Selected text uses neutral900 on the dashboard secondary fill. The default primary color on that fill measured only 3.38:1. The existing dashboard contrast validation already requires neutral900 for secondary text.
- The app terms signature record is distinct from the season signature. Profile completion, terms acceptance and its signature commit atomically. Cross-account/cross-organization reads and direct client writes are denied; deletion includes the new record.

## Verification

Local final results:

| Check                                                         | Result                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Format and lint                                               | Pass                                                                                                    |
| Root, shared, mobile, admin and both Worker TypeScript checks | Pass                                                                                                    |
| Dependency audit                                              | Pass under the existing dated, scoped exceptions                                                        |
| Dead code and all five locale key checks                      | Pass                                                                                                    |
| Bun suite                                                     | 1,837 passed, zero failed; one inactive fallback placeholder skipped because the real database test ran |
| SQL RLS/encryption/transaction/deletion suite                 | Pass, including the new app signature cases                                                             |
| Existing browser accessibility suite                          | 15 passed                                                                                               |
| New onboarding browser suite                                  | 6 passed: full Catalan journey to Home and personalized choices in all five languages                   |

The full journey verifies the signed app acceptance exists before season signing, the separate season signature exists after signing, stored document/situation values, combined support details, date validation, summary edit return, hidden review-edit stepper, and disabled document Continue until the end is reached. Browser WCAG checks found no violations on the exercised onboarding summary and five-language documentation choices. This is coverage of those routes, not a claim that every possible branch or text has been manually read in every language. Commands use Bun 1.4.3 locally. No package dependency was changed by the QA tooling runtime upgrade.

### Repeatable local backend

The browser harness accepts loopback-only QA backend/mail origins and a validated Supabase container name. The isolated stack is prepared by `scripts/qa-smoke/supabase-stack.ts`; it uses project `ramassa-qa`, API 57321, database 57322 and Mailpit 57324. The new onboarding journey requires its fresh seed and refuses the ordinary development stack. Rebuild the isolated seed between the mutating browser journey and the SQL fixture suite; do not reset the ordinary development database.

```sh
RAMASSA_QA_SUPABASE_URL=http://127.0.0.1:57321 \
RAMASSA_QA_MAILPIT_URL=http://127.0.0.1:57324 \
RAMASSA_QA_DB_CONTAINER=supabase_db_ramassa-qa \
bunx playwright test scripts/qa-web/onboarding-closure.web-qa.ts

SUPABASE_TEST_WORKDIR="$PWD/.qa-supabase" \
SUPABASE_TEST_API_URL=http://127.0.0.1:57321/rest/v1/ \
bun test
```

### Database test tooling note

The local Supabase PostgreSQL 17.6 ARM image crashes inside supautils when an anonymous caller executes a function whose execute grant has been revoked. Two existing denial assertions now inspect the same execute privilege directly instead of invoking that upstream crash. The execute grant remains revoked. The issue is documented upstream in [supautils 214](https://github.com/supabase/supautils/issues/214) and [supabase/postgres 2112](https://github.com/supabase/postgres/issues/2112). This is a test workaround, not a weakened policy or a claimed PostgreSQL fix.

### Hosted slow-loading regression

The first extra hosted accessibility run caught unnamed native ActivityIndicators in transient account/authorization gates, although the initial local run had passed. The gates now use the existing common loading label in all five languages. A browser regression deliberately holds the real authorization-status response, verifies the visible named progressbar and runs axe before releasing the request. It failed before the label fix and passed afterward; all 15 accessibility browser cases passed locally after the loading follow-ups. A held login request also exposed the decorative spinner inside the busy shared action. Its native/web hiding semantics now leave the visual spinner mounted while the labeled owning action exposes busy and disabled state. A native regression failed before this fix, and a second held-request browser case checks the busy state with axe before allowing the code screen to open. The independent verifier reviewed both focused follow-ups. The two browser loading cases request reduced motion before navigation, matching the existing player-route cases: a hosted scan caught a heading midway through its intended fade. Contrast is checked at full opacity without changing the product animation, adding a sleep or hiding a failed rule. The shipping web export also passed direct Enter/Space language selection and Enter-to-Continue activation probes.

## Native evidence and limits

Android was tested on a disposable Pixel 8 emulator using the installed development build and the current JavaScript bundle against the isolated local backend. Checked language selection, login keyboard/CTA clearance, staff-personalized intake, advancing and saving a birthplace, documentation choices, and readable scrollable content at 200% system text size. Direct framebuffers were inspected. The connected Moto G was locked and its active test session was not operated during this closure.

An existing iPhone SE simulator remained on the operating-system boot logo. A separate disposable iPhone 18 Pro simulator was created for isolated QA instead. On that iPhone, native accessible activation selected Catalan without advancing, then Continue opened login. Login and personalized intake kept the CTA above the software keyboard. A synthetic birthplace saved and advanced to documentation, with the staff-provided name/date/nationality omitted. Native accessibility activation was exercised through the simulator accessibility action, not a full auditory VoiceOver session.

This review does not measure FPS, battery drain or performance on every supported phone. Automated WCAG results do not replace VoiceOver/TalkBack testing with real users. The prepared authorization translations are local development/seed content and still need the organization's legal/language review before production publication. No production document was published here.

## Independent checklist

All 54 combined review rules were explicitly checked. The status table below preserves exceptions and the scope of the checks rather than certifying unrelated legacy screens.

| #   | Rule                                                                                                 | Status                    | Evidence or rationale                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No `@expo/vector-icons` : must use `expo-symbols` (or whatever CLAUDE.md specifies)                  | Pass                      | Target imports use expo-symbols or shared BrandSymbol, no vector-icons.                                                                                                                                                                   |
| 2   | No RN `Image` or `<img>` for non-icon images : must use `expo-image`                                 | Pass                      | Image imports in broader media/profile targets use expo-image; no HTML img.                                                                                                                                                               |
| 3   | No `TouchableOpacity` : must use `Pressable`                                                         | Pass                      | Shared gesture primitives and native modal Pressable rows replace legacy touchables.                                                                                                                                                      |
| 4   | `Stack` imported from `expo-router/stack`, not `expo-router`                                         | Pass                      | Target Stack imports come from expo-router/stack.                                                                                                                                                                                         |
| 5   | `NativeTabs` from `expo-router/unstable-native-tabs` if tabs are used                                | Not applicable            | The profile tab body is in scope, but no tab navigator was implemented or changed here.                                                                                                                                                   |
| 6   | `process.env.EXPO_OS` instead of `Platform.OS`                                                       | Recorded exception        | Eight existing Platform.OS branches remain, including diagnostic OS/version pairs and older web branches. New shared focus/platform code uses EXPO_OS. No unrelated platform rewrite.                                                     |
| 7   | File name is kebab-case                                                                              | Pass                      | Kebab-case for components and helpers; Expo Router file conventions retained.                                                                                                                                                             |
| 8   | `contentInsetAdjustmentBehavior="automatic"` on every ScrollView, FlatList, SectionList              | Recorded exception        | FormScreen intentionally uses never: SafeAreaView and fixed footer own insets. Country/municipality lists use automatic. The older staff ParticipantCard ScrollView retains its existing default under its enclosing staff shell.         |
| 9   | `boxShadow` style, no legacy shadow props or elevation                                               | Pass                      | No shadowColor/shadowOpacity/elevation target properties found. Raised choice depth is geometry with token offsets, not a legacy shadow API.                                                                                              |
| 10  | Flex `gap` preferred over margin for sibling spacing                                                 | Pass with exception       | Shared form sibling spacing uses gap. Existing profile-logo bottom edge spacing remains; no speculative broad layout churn.                                                                                                               |
| 11  | `borderCurve: 'continuous'` on elements with borderRadius (unless capsule)                           | Pass for changed surfaces | New rounded shared field/card/consent/entity surfaces use continuousCorners. Circles/capsules are exempt. Existing cached older route styles were not broadly rewritten.                                                                  |
| 12  | Navigation titles via Stack.Screen options, not custom Text headers                                  | Recorded exception        | Custom AuthTitle/WizardProgress is the approved RTL-safe design. CLAUDE explains Android native-header defects. Preserve it.                                                                                                              |
| 13  | `selectable` prop on Text that displays copiable data                                                | Pass for changed flow     | Wizard errors, full legal text and review values are selectable; button labels intentionally are not. Older profile-edit error-only typography outside onboarding remains outside this sweep's redesign.                                  |
| 14  | `fontVariant: ['tabular-nums']` on numeric counters/displays                                         | Pass                      | WizardProgress, textarea counters and attendance counters have tabular numerals. Editable numeric inputs retain standard text input behavior.                                                                                             |
| 15  | Haptic feedback on every interactive handler : check ALL handlers, not just some                     | Recorded exception        | Configured press controls own shared haptics, including the new assistive activation path. Input focus, native scrolling and existing quiet retry controls do not add a new buzz. No duplicate per-gesture haptic.                        |
| 16  | No components co-located in `app/` directory                                                         | Recorded exception        | Reusable primitives remain in components. Existing private route helpers and navigator/provider wrappers remain colocated; no new reusable UI is placed in app routes.                                                                    |
| 17  | No `StyleSheet.create` when a plain hoisted object suffices                                          | Recorded exception        | Existing module-level cached StyleSheet objects in older media/forum/story routes and shared Scale minimum target remain. They are not constructed on render. No blanket replacement.                                                     |
| 18  | Every `Pressable`/interactive element has `accessibilityRole`                                        | Fixed and pass            | Scale/Depth expose role and now native assistive activation. Native TextInput roles remain platform-owned. Country/municipality modal rows use standard Pressable.                                                                        |
| 19  | Every `Pressable`/interactive element has `accessibilityLabel` using `t()`                           | Pass                      | Translated accessible names are supplied via t(), or published localized catalog/canonical data. Native language names intentionally carry their own accessibilityLanguage.                                                               |
| 20  | Stateful controls have `accessibilityState` reflecting current state                                 | Fixed and pass            | Selected/checked state is exposed; Scale now explicitly carries aria-disabled/aria-busy and blocks assistive activation when disabled/busy.                                                                                               |
| 21  | Decorative images/icons have `accessible={false}`                                                    | Pass                      | BrandSymbol/back icons exclude themselves; decorative surfaces also use accessibilityElementsHidden/no-hide-descendants. Labels remain on the owning control.                                                                             |
| 22  | Lists have `accessibilityRole="list"` and `accessibilityLabel`                                       | Pass                      | Both virtualized picker lists have translated labels/list role. Short form option groups expose their own labels/roles rather than claiming virtualized-list semantics.                                                                   |
| 23  | `useTranslation` hook is imported if translated strings are needed                                   | Pass                      | Translation hooks or translated props are used where UI strings are needed.                                                                                                                                                               |
| 24  | Zero hardcoded user-facing strings : all use `t()` from react-i18next                                | Fixed and pass            | No new hardcoded player copy. Arabic/Persian keyboard decimal digits now normalize at the form boundary; translations alone were insufficient.                                                                                            |
| 25  | Includes: accessibility labels, alerts, toasts, placeholders                                         | Pass                      | Shared error/confirmation/picker/placeholder labels are translated. Decorative removal glyph is not spoken; translated remove action names the entity.                                                                                    |
| 26  | No magic numbers : all extracted to named constants                                                  | Pass with exception       | Motion/layout configuration uses tokens or named constants. Existing field maxLength/validation bounds are literal schema constraints in older fields, not a new visual token system; no bulk rewrite.                                    |
| 27  | No repeated color literals : extracted to constants or theme                                         | Pass                      | No new raw color literals. Selected text and focus inner outline use existing contrast-safe semantic theme classes.                                                                                                                       |
| 28  | Audio/config values reference existing constants files where available                               | Not applicable            | No audio setup or new native runtime configuration.                                                                                                                                                                                       |
| 29  | Components use CSS-wrapped primitives from `src/tw/`                                                 | Recorded exception        | Existing NativeWind4/Tailwind3 remains per CLAUDE. NativeWind5 src/tw preview setup applies only to project scaffolding, not this existing app.                                                                                           |
| 30  | No `flex-1` on ScrollView content containers (use `grow`)                                            | Pass                      | FormScreen contentContainerClassName uses grow; flex-1 bounds the viewport. Picker FlatLists are intentionally bounded.                                                                                                                   |
| 31  | No boolean prop proliferation : use variants or compound components                                  | Pass                      | Remaining booleans represent actual checked/disabled/busy/scroll/native state; variant props already use explicit unions. No speculative provider rewrite.                                                                                |
| 32  | No redundant callback wrappers (functions that just forward to another function)                     | Pass                      | Inspected forwarding callbacks have persistence, validation, haptic, value binding or Promise-to-void work.                                                                                                                               |
| 33  | `children` preferred over `renderX` props                                                            | Pass                      | FormScreen/WizardFrame/ReviewSection compose ReactNode slots and children. Controller/renderItem callbacks legitimately receive field/item arguments.                                                                                     |
| 34  | `FlashList` for large lists (or recommend it if not installed)                                       | Recorded exception        | Keep bounded FlatList country/municipality virtualizers. FlashList2 is installed, but an unmeasured library substitution is not necessary to bound mounted rows.                                                                          |
| 35  | List item components wrapped in `React.memo`                                                         | Pass                      | Country/Municipality and relevant attendance rows are memoized. Small finite form choices do not need a list-engine rewrite.                                                                                                              |
| 36  | ALL callbacks passed to children stabilized with `useCallback`                                       | Recorded exception        | High-volume list callbacks are stable; short translated forms use bound handlers and React Compiler (enabled). Do not blanket-wrap every callback and risk stale values.                                                                  |
| 37  | Every inline style object extracted to module-level constant                                         | Pass                      | No JSX literal style objects found in target scan. Static objects are hoisted; runtime font/measurement compositions use memoized values.                                                                                                 |
| 38  | Reanimated animation builders (`FadeInDown.delay()`, `withTiming()` configs) hoisted to module scope | Pass with exception       | Depth and Scale timing configs are hoisted. Existing FadeSlideIn/SelectionTransition/DrawnCheckmark configs are constructed inside effects only when their actual motion inputs change, not on every render; no new inline builder churn. |
| 39  | Only `transform` and `opacity` animated (GPU-accelerated)                                            | Pass                      | Entrance, selection, depth and drawn checkmark animate transform/opacity. Checkmark uses two transformed native strokes, not layout or an SVG path redraw.                                                                                |
| 40  | State values only used in callbacks read via `store.getState()`, NOT subscribed with selector        | Pass                      | No new broad store subscriptions. Latest draft reads are at persistence boundaries; captured account clear handles async completion ownership.                                                                                            |
| 41  | Values that change frequently but don't need re-renders use `useRef`                                 | Pass                      | Scroll offset, end-report bookkeeping, focus ownership and transient motion values use refs/shared values, no per-frame setState.                                                                                                         |
| 42  | No falsy `&&` for conditional rendering : use ternary                                                | Pass                      | Target scan finds boolean conditions inside guards and ternaries, not raw possibly-numeric && JSX output.                                                                                                                                 |
| 43  | All raw strings wrapped in `<Text>`                                                                  | Pass                      | Player strings are inside Text. Native control values/accessible names are props. Decorative remove glyph is inside Text.                                                                                                                 |
| 44  | No async waterfalls : independent operations use `Promise.all()`                                     | Pass                      | Independent intake/staff reads use Promise.all. Writes/profile refresh remain ordered where completion depends on earlier success.                                                                                                        |
| 45  | No barrel file imports : import from source modules                                                  | Recorded exception        | Local components import specific modules. Shared package feature entry points are intentional exports rather than an unbounded app barrel; no unnecessary package reorganization.                                                         |
| 46  | State only used in callbacks NOT subscribed via selector (use `getState()`)                          | Pass                      | Same state-subscription review as rule40; no Zustand whole-store subscription was added.                                                                                                                                                  |
| 47  | Expensive computations memoized                                                                      | Pass                      | Country/municipality option/filter work and locale formatter factories are memoized. Small scalar expressions are not needlessly memoized.                                                                                                |
| 48  | Default non-primitive props hoisted to module scope                                                  | Pass with exception       | Static configs/styles are module constants. Existing tiny optional fallback closures/props in older fields remain under React Compiler; no new costly allocation.                                                                         |
| 49  | State derived during render, not synced with `useEffect`                                             | Pass                      | Derived display values are computed in render. Query seeding, native event subscriptions and persisted identity binding necessarily synchronize external systems in effects.                                                              |
| 50  | Functional `setState` for stable callbacks                                                           | Pass                      | Selection and shared partial-answer updates use functional state setters. Discrete known phase values are not asynchronous stale increments.                                                                                              |
| 51  | `useRef` for transient high-frequency values                                                         | Pass                      | Transient geometry/scroll/focus/motion ownership uses refs/shared values when it does not affect React output.                                                                                                                            |
| 52  | Static JSX hoisted outside components                                                                | Recorded exception        | Static icons/configs are hoisted where beneficial. Translated/contextual JSX remains inside components because its language and state can change.                                                                                         |
| 53  | `RefreshControl` and similar inline objects memoized                                                 | Not applicable            | No RefreshControl added or changed in onboarding; existing broader-screen refresh props are memoized where used.                                                                                                                          |
| 54  | `RegExp`, `Intl`, and `Date` formatters hoisted to module level                                      | Pass with exception       | Intl factories are memoized by language. New localized-digit RegExp is hoisted. Date validation deliberately constructs current dates at validation time so age/year bounds do not freeze at module load.                                 |

## References

- [ADR-028: independent app and season signatures](adr/028-independent-app-and-season-signatures.md)
- [React Native accessibility](https://reactnative.dev/docs/accessibility)
- [TanStack Query network mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html)

## Mobile production review inventory

- `apps/mobile/src/app/(app)/(tabs)/profile.tsx`
- `apps/mobile/src/app/(app)/_layout.tsx`
- `apps/mobile/src/app/(app)/authorization.tsx`
- `apps/mobile/src/app/(app)/entity-referral/[id].tsx`
- `apps/mobile/src/app/(app)/event/[id].tsx`
- `apps/mobile/src/app/(app)/forum/[id].tsx`
- `apps/mobile/src/app/(app)/forum/create.tsx`
- `apps/mobile/src/app/(app)/gallery/[id].tsx`
- `apps/mobile/src/app/(app)/gallery/upload.tsx`
- `apps/mobile/src/app/(app)/onboarding/_layout.tsx`
- `apps/mobile/src/app/(app)/onboarding/applicant-status-details.tsx`
- `apps/mobile/src/app/(app)/onboarding/background.tsx`
- `apps/mobile/src/app/(app)/onboarding/custom/[screenId].tsx`
- `apps/mobile/src/app/(app)/onboarding/documentation-details.tsx`
- `apps/mobile/src/app/(app)/onboarding/documentation.tsx`
- `apps/mobile/src/app/(app)/onboarding/equipment.tsx`
- `apps/mobile/src/app/(app)/onboarding/index.tsx`
- `apps/mobile/src/app/(app)/onboarding/logistics.tsx`
- `apps/mobile/src/app/(app)/onboarding/participation-support.tsx`
- `apps/mobile/src/app/(app)/onboarding/season.tsx`
- `apps/mobile/src/app/(app)/onboarding/specific-needs-details/[category].tsx`
- `apps/mobile/src/app/(app)/onboarding/specific-needs.tsx`
- `apps/mobile/src/app/(app)/onboarding/summary.tsx`
- `apps/mobile/src/app/(app)/onboarding/supporting-entities.tsx`
- `apps/mobile/src/app/(app)/onboarding/terms-intro.tsx`
- `apps/mobile/src/app/(app)/onboarding/terms.tsx`
- `apps/mobile/src/app/(app)/profile-edit.tsx`
- `apps/mobile/src/app/(app)/story/submit.tsx`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/components/announcements/feed-states.tsx`
- `apps/mobile/src/components/auth/auth-back-button.tsx`
- `apps/mobile/src/components/auth/auth-form-error.tsx`
- `apps/mobile/src/components/auth/auth-screen.tsx`
- `apps/mobile/src/components/auth/auth-submit-button.tsx`
- `apps/mobile/src/components/auth/auth-text-field.tsx`
- `apps/mobile/src/components/auth/auth-title.tsx`
- `apps/mobile/src/components/auth/language-choice-list.tsx`
- `apps/mobile/src/components/auth/selection-choice-card.tsx`
- `apps/mobile/src/components/authorization/authorization-form.tsx`
- `apps/mobile/src/components/authorization/consent-row.tsx`
- `apps/mobile/src/components/authorization/signature-section.tsx`
- `apps/mobile/src/components/entity/entity-load-failure.tsx`
- `apps/mobile/src/components/error-code-line.tsx`
- `apps/mobile/src/components/error-fallback.tsx`
- `apps/mobile/src/components/forms/data-icon.tsx`
- `apps/mobile/src/components/forms/field-appearance.ts`
- `apps/mobile/src/components/forms/field-focus-owner.ts`
- `apps/mobile/src/components/forms/field-focus-ring.tsx`
- `apps/mobile/src/components/forms/form-text-area.tsx`
- `apps/mobile/src/components/forms/form-text-field.tsx`
- `apps/mobile/src/components/forms/glass-icon-surface.tsx`
- `apps/mobile/src/components/forms/raised-action-button.tsx`
- `apps/mobile/src/components/forms/selection-choice-surface.tsx`
- `apps/mobile/src/components/layout/form-screen.tsx`
- `apps/mobile/src/components/messaging/message-thread.tsx`
- `apps/mobile/src/components/motion/pressable-depth.tsx`
- `apps/mobile/src/components/onboarding/country-picker.tsx`
- `apps/mobile/src/components/onboarding/custom-question-field.tsx`
- `apps/mobile/src/components/onboarding/municipality-picker.tsx`
- `apps/mobile/src/components/onboarding/onboarding-question-heading.tsx`
- `apps/mobile/src/components/onboarding/option-chip.tsx`
- `apps/mobile/src/components/onboarding/option-grid.tsx`
- `apps/mobile/src/components/onboarding/question-help.tsx`
- `apps/mobile/src/components/onboarding/review-section.tsx`
- `apps/mobile/src/components/onboarding/season-wizard-step.tsx`
- `apps/mobile/src/components/onboarding/support-need-details-step.tsx`
- `apps/mobile/src/components/onboarding/support-needs-step.tsx`
- `apps/mobile/src/components/onboarding/terms-introduction.tsx`
- `apps/mobile/src/components/onboarding/wizard-frame.tsx`
- `apps/mobile/src/components/onboarding/wizard-progress.tsx`
- `apps/mobile/src/components/onboarding/wizard-validation-summary.tsx`
- `apps/mobile/src/components/participants/participant-card.tsx`
- `apps/mobile/src/components/profile/attendance-history-section.tsx`
- `apps/mobile/src/components/profile/profile-form-fields.tsx`
- `apps/mobile/src/components/profile/profile-section.tsx`
- `apps/mobile/src/components/profile/season-answer-fields.tsx`
- `apps/mobile/src/components/profile/season-answer-rows.tsx`
- `apps/mobile/src/components/profile/supporting-entities-field.tsx`
- `apps/mobile/src/lib/confirm-action.ts`
- `apps/mobile/src/lib/confirm-delete.ts`
- `apps/mobile/src/lib/documentation-step.ts`
- `apps/mobile/src/lib/field-focus-ownership.ts`
- `apps/mobile/src/lib/logistics-draft.ts`
- `apps/mobile/src/lib/network-status.ts`
- `apps/mobile/src/lib/onboarding-entrance.tsx`
- `apps/mobile/src/lib/onboarding-form.ts`
- `apps/mobile/src/lib/onboarding-intake-context.tsx`
- `apps/mobile/src/lib/onboarding-intake.ts`
- `apps/mobile/src/lib/onboarding.ts`
- `apps/mobile/src/lib/push-prompt-eligibility.ts`
- `apps/mobile/src/lib/season-draft.ts`
- `apps/mobile/src/lib/support-needs-draft.ts`
- `apps/mobile/src/lib/use-push-registration.tsx`

Additional shared dependencies reviewed during verification:

- `apps/mobile/src/components/motion/pressable-scale.tsx`
- `apps/mobile/src/components/motion/accessibility-actions.ts`
- `packages/shared/lib/onboarding-drafts.ts`

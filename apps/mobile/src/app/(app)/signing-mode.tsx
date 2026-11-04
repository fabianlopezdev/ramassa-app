/**
 * Signing mode on a staff tablet (RAPP-305). The tablet shows only the
 * authorization for the one player the coach handed it to:
 *
 *   1. she picks her language (any of the five, right to left where needed);
 *   2. she walks the authorization form of the version the tablet collects,
 *      with the shared form walker, as in her own app (RAPP-304, RAPP-773):
 *      she reads, answers, ticks and signs, "No puc signar" allowed;
 *   3. a walk-in then signs each signature block of the live Onboarding
 *      screens, in her language (RAPP-691), "No puc signar" allowed
 *      (RAPP-773), and ticks the consents placed on them (RAPP-699). They travel with her signing and move to her profile
 *      when the team confirms her. With none, or no connection to read them,
 *      this step is not shown;
 *   4. she is thanked and gives the tablet back. Her medical answer is gone
 *      from the screen.
 *
 * While this screen is open, the layout turns every other screen off, so no
 * link, notification or back gesture opens a staff screen. Leaving needs the
 * coach's biometrics or passcode, and so does a signature she could not
 * draw: the coach confirms she agreed.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { ConsentRow } from '@/components/authorization/consent-row';
import { FormWalker } from '@/components/forms/form-walker';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SignatureBlockField } from '@/components/onboarding/signature-block-field';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { fontClassForLanguage } from '@/lib/language-font-class';
import {
  useAuthorizationForSigning,
  useSigningCatalog,
  useSigningOutbox,
  useSigningSession,
  useWalkInOnboardingAsks,
} from '@/lib/tablet-signing';
import { ScreenLanguageContext } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildSignPayload, signerName } from '@ramassa/shared/authorization';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  isRtlLanguage,
  isSupportedLanguage,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import {
  authorizationForm,
  authorizationWalkForm,
  consentDecisionsPayload,
  consentText,
  formSignaturesPayload,
  formWalkScreens,
  UNABLE_TO_DRAW,
  unsignedFormBlocks,
  untickedRequiredConsents,
  withSeasonName,
  type FormSignatureDrafts,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

type Step = 'language' | 'form' | 'blocks' | 'done';

// Her language for the open session, in memory only. A link or notification
// that lands back on signing mode mounts this screen again; she keeps her
// language and returns to the form.
let keptLanguage: { readonly startedAt: string; readonly language: SupportedLanguage } | null =
  null;

const rtlText = { writingDirection: 'rtl' } as const;
const ltrText = { writingDirection: 'ltr' } as const;

/** The coach's language, kept where the player's language is shown (RAPP-773). */
const CoachLanguageContext = createContext<SupportedLanguage>('ca');

/**
 * The way back to the coach, in the coach's language: she is the one who
 * reads it, also where the screen shows the player's language.
 */
function ReturnToCoach({ onPress }: { readonly onPress: () => void }) {
  const { i18n } = useTranslation();
  const coachLanguage = useContext(CoachLanguageContext);
  const t = i18n.getFixedT(coachLanguage, 'participants');
  const fontClass = fontClassForLanguage(coachLanguage);
  return (
    <PressableScale
      testID="signing-return-to-coach"
      accessibilityRole="button"
      accessibilityLabel={t('signing.returnToCoach')}
      onPress={onPress}
      haptic="tapLight"
      className="min-h-recommended self-end justify-center"
    >
      <Text className={`font-semibold text-primary-dark ${fontClass}`}>
        {t('signing.returnToCoach')}
      </Text>
    </PressableScale>
  );
}

export default function SigningModeScreen() {
  const { i18n } = useTranslation();
  const coachLanguage: SupportedLanguage = isSupportedLanguage(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as SupportedLanguage)
    : 'ca';
  return (
    <CoachLanguageContext.Provider value={coachLanguage}>
      <SigningMode />
    </CoachLanguageContext.Provider>
  );
}

function SigningMode() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const { confirmOwner } = useAppLock();
  const { session, end } = useSigningSession();
  const authorization = useAuthorizationForSigning(true);
  const signing = useSigningCatalog(authorization.data);
  const { record } = useSigningOutbox();

  const kept = keptLanguage?.startedAt === session?.startedAt ? keptLanguage : null;
  const [step, setStep] = useState<Step>(kept === null ? 'language' : 'form');
  const [language, setLanguage] = useState<SupportedLanguage | null>(kept?.language ?? null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  // A walk-in's Onboarding signature blocks (RAPP-691), signed after the authorization.
  const isWalkIn = session?.signer.kind === 'walk_in';
  const walkInAsks = useWalkInOnboardingAsks(isWalkIn);
  const blocks = isWalkIn ? (walkInAsks.data?.blocks ?? []) : [];
  // And the consents placed on her Onboarding screens (RAPP-699), in her language.
  const consents = isWalkIn ? (walkInAsks.data?.consents ?? []) : [];
  const [ticks, setTicks] = useState<Readonly<Record<string, boolean>>>({});
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [signed, setSigned] = useState<SignedPayload | null>(null);
  const [strokes, setStrokes] = useState<FormSignatureDrafts>({});
  const [unsigned, setUnsigned] = useState<ReadonlySet<string>>(new Set());
  const [isDrawing, setIsDrawing] = useState(false);

  // Android's back button stays in signing mode; iOS swipe back is off in the layout.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const leave = async () => {
    if (!(await confirmOwner())) {
      playHaptic('warning');
      return;
    }
    end();
    router.replace('/collect-signatures' as Href);
  };

  const t = useMemo(() => i18n.getFixedT(language ?? 'ca', 'onboarding'), [i18n, language]);
  // Her language for the whole form: every field, consent and signature of
  // the walk reads it, whatever the coach's app language is.
  const herI18n = useMemo(
    () => (language === null ? null : i18n.cloneInstance({ lng: language })),
    [i18n, language],
  );

  const current = authorization.data;
  const catalog = signing.data;
  const found = catalog === undefined ? undefined : authorizationForm(catalog);
  const form = found === undefined ? undefined : authorizationWalkForm(found);
  if (
    session === null ||
    authorization.isPending ||
    current == null ||
    catalog === undefined ||
    form === undefined ||
    formWalkScreens(catalog, form, {}).length === 0
  ) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-lg bg-neutral-50 p-lg">
        {authorization.isPending || signing.isPending ? (
          <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
        ) : null}
        <ReturnToCoach onPress={() => void leave()} />
      </SafeAreaView>
    );
  }
  const name = signerName(session.signer);

  if (step === 'language' || language === null || herI18n === null) {
    return (
      <SafeAreaView testID="signing-language" className="flex-1 bg-neutral-50">
        <ScrollView contentContainerClassName="pb-3xl">
          <PageWidth className="gap-lg p-lg">
            <ReturnToCoach onPress={() => void leave()} />
            {/* She may read none of the coach's languages: the question is asked in all five. */}
            <View className="gap-xs">
              {SUPPORTED_LANGUAGES.map((candidate) => (
                <Text
                  key={candidate}
                  accessibilityLanguage={candidate}
                  style={isRtlLanguage(candidate) ? rtlText : ltrText}
                  className={`text-xl font-bold text-neutral-900 ${fontClassForLanguage(candidate)}`}
                >
                  {i18n.getFixedT(candidate, 'onboarding')('signingChooseLanguage', { name })}
                </Text>
              ))}
            </View>
            {SUPPORTED_LANGUAGES.map((candidate) => (
              <PressableScale
                key={candidate}
                testID={`signing-language-${candidate}`}
                accessibilityRole="button"
                accessibilityLabel={LANGUAGE_NATIVE_NAMES[candidate]}
                accessibilityLanguage={candidate}
                onPress={() => {
                  setLanguage(candidate);
                  keptLanguage = { startedAt: session.startedAt, language: candidate };
                  setStep('form');
                }}
                haptic="selection"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
              >
                <Text
                  className={`text-center text-lg font-bold text-primary-dark ${fontClassForLanguage(candidate)}`}
                >
                  {LANGUAGE_NATIVE_NAMES[candidate]}
                </Text>
              </PressableScale>
            ))}
          </PageWidth>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const fontClass = fontClassForLanguage(language);
  const direction = { direction: isRtlLanguage(language) ? 'rtl' : 'ltr' } as const;
  if (step === 'done') {
    return (
      <SafeAreaView testID="signing-done" style={direction} className="flex-1 bg-neutral-50">
        <PageWidth className="flex-1 justify-center gap-lg p-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('signingThanks', { name })}
          </Text>
          <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
            {t('signingGiveBack')}
          </Text>
          {isWaiting ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('signingSavedOnTablet')}
            </Text>
          ) : null}
          <ReturnToCoach onPress={() => void leave()} />
        </PageWidth>
      </SafeAreaView>
    );
  }

  const save = async (
    payload: SignedPayload,
    blockSignatures: ReturnType<typeof formSignaturesPayload> | null,
  ): Promise<boolean> => {
    setHasFailed(false);
    setIsSaving(true);
    try {
      const outcome = await record({
        id: randomUUID(),
        signer: session.signer,
        versionId: current.versionId,
        // The form's payload, checked by the server against the version (RAPP-773).
        payload,
        signedAt: new Date().toISOString(),
        ...(blockSignatures === null ? {} : { blockSignatures }),
        ...(consents.length === 0 ? {} : { consents: consentDecisionsPayload(consents, ticks) }),
      });
      setIsWaiting(outcome === 'waiting');
      playHaptic('success');
      setStep('done');
      return true;
    } catch {
      playHaptic('error');
      setHasFailed(true);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'blocks' && signed !== null) {
    const signBlocks = async () => {
      const missing = unsignedFormBlocks(blocks, strokes);
      setUnsigned(new Set(missing));
      const missingTicks = untickedRequiredConsents(consents, ticks);
      setUnticked(new Set(missingTicks));
      if (missing.length > 0 || missingTicks.length > 0) {
        playHaptic('warning');
        return;
      }
      // A block she could not draw: the coach confirms she agreed.
      if (Object.values(strokes).includes(UNABLE_TO_DRAW) && !(await confirmOwner())) {
        playHaptic('warning');
        return;
      }
      void save(signed, formSignaturesPayload(blocks, strokes, language));
    };
    return (
      <SafeAreaView testID="signing-blocks" style={direction} className="flex-1 bg-neutral-50">
        <ScrollView scrollEnabled={!isDrawing} contentContainerClassName="pb-3xl">
          <PageWidth className="gap-lg p-lg">
            <ReturnToCoach onPress={() => void leave()} />
            <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
              {t('signingFor', { name })}
            </Text>
            {blocks.map((block) => (
              <SignatureBlockField
                key={block.id}
                block={block}
                language={language}
                strokes={strokes[block.id] ?? null}
                onDrawingChange={setIsDrawing}
                errorMessage={unsigned.has(block.id) ? t('customErrorSignature') : undefined}
                onChange={(next) => {
                  setStrokes((existing) => ({ ...existing, [block.id]: next }));
                  if (next !== null) {
                    setUnsigned(
                      (existing) => new Set([...existing].filter((id) => id !== block.id)),
                    );
                  }
                }}
              />
            ))}
            {consents.map((consent) => (
              <ConsentRow
                key={consent.id}
                testID={`signing-consent-${consent.key}`}
                label={consentText(consent.body, language).text}
                required={consent.required}
                requiredMark={t('authorizationRequiredMark')}
                checked={ticks[consent.key] === true}
                errorMessage={unticked.has(consent.key) ? t('customErrorConsent') : undefined}
                onToggle={() => {
                  const next = ticks[consent.key] !== true;
                  setTicks((existing) => ({ ...existing, [consent.key]: next }));
                  if (next) {
                    setUnticked(
                      (existing) => new Set([...existing].filter((key) => key !== consent.key)),
                    );
                  }
                }}
              />
            ))}
            {hasFailed ? (
              <Text
                selectable
                accessibilityLiveRegion="polite"
                className={`text-start text-form text-error ${fontClass}`}
              >
                {t('authorizationSignFailed')}
              </Text>
            ) : null}
            <PressableScale
              testID="signing-blocks-submit"
              accessibilityRole="button"
              accessibilityLabel={t('signingBlocksAction')}
              isDisabled={isSaving}
              onPress={() => void signBlocks()}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-lg font-bold text-white ${fontClass}`}>
                {t('signingBlocksAction')}
              </Text>
            </PressableScale>
          </PageWidth>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <I18nextProvider i18n={herI18n}>
      <ScreenLanguageContext.Provider value={language}>
        <View testID="signing-form" style={direction} className="flex-1">
          <FormWalker
            key={`${session.startedAt}:${language}`}
            catalog={catalog}
            form={form}
            saved={{}}
            sendLabel={t('authorizationSignAction')}
            failureMessage={t('authorizationSignFailed')}
            onLeave={undefined}
            fillText={(text) => withSeasonName(text, current.seasonName)}
            header={
              <View className="gap-sm">
                <ReturnToCoach onPress={() => void leave()} />
                <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                  {t('signingFor', { name })}
                </Text>
                <PressableScale
                  testID="signing-change-language"
                  accessibilityRole="button"
                  accessibilityLabel={t('signingChangeLanguage')}
                  onPress={() => setStep('language')}
                  haptic="tapLight"
                  className="min-h-recommended self-start justify-center"
                >
                  <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                    {t('signingChangeLanguage')}
                  </Text>
                </PressableScale>
              </View>
            }
            onSubmit={async (draft, screens): Promise<AppErrorCode | null> => {
              const payload = buildSignPayload({
                catalog,
                screens,
                draft,
                language,
                device: `${Platform.OS} ${String(Platform.Version)}`,
              });
              if (payload === null) return 'VALIDATION-1';
              // She could not draw: the coach confirms, on her own device check, that she agreed.
              if (
                Object.values(draft.signatures).includes(UNABLE_TO_DRAW) &&
                !(await confirmOwner())
              ) {
                return 'VALIDATION-1';
              }
              // A walk-in signs the Onboarding blocks before anything is kept (RAPP-691).
              if (blocks.length > 0 || consents.length > 0) {
                setSigned(payload);
                setStep('blocks');
                return null;
              }
              return (await save(payload, null)) ? null : 'DB-1';
            }}
          />
        </View>
      </ScreenLanguageContext.Provider>
    </I18nextProvider>
  );
}

type SignedPayload = NonNullable<ReturnType<typeof buildSignPayload>>;

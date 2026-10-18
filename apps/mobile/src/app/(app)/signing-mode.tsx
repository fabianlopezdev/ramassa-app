/**
 * Signing mode on a staff tablet (RAPP-305). The tablet shows only the
 * authorization for the one player the coach handed it to:
 *
 *   1. she picks her language (any of the five, right to left where needed);
 *   2. she reads, answers, ticks and signs, as in her own app (RAPP-304);
 *   3. she is thanked and gives the tablet back. Her medical answer is gone
 *      from the screen.
 *
 * While this screen is open, the layout turns every other screen off, so no
 * link, notification or back gesture opens a staff screen. Leaving needs the
 * coach's biometrics or passcode, and so does a signing she could not draw:
 * the coach confirms she agreed.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthorizationForm } from '@/components/authorization/authorization-form';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { fontClassForLanguage } from '@/lib/language-font-class';
import {
  useAuthorizationForSigning,
  useSigningOutbox,
  useSigningSession,
} from '@/lib/tablet-signing';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { randomUUID } from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  buildSignPayload,
  signerName,
  type AuthorizationSigning,
} from '@ramassa/shared/authorization';
import {
  isRtlLanguage,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

type Step = 'language' | 'form' | 'done';

// Her language for the open session, in memory only. A link or notification
// that lands back on signing mode mounts this screen again; she keeps her
// language and returns to the form.
let keptLanguage: { readonly startedAt: string; readonly language: SupportedLanguage } | null =
  null;

const rtlText = { writingDirection: 'rtl' } as const;
const ltrText = { writingDirection: 'ltr' } as const;

/** The way back to the coach, in the coach's language: she is the one who reads it. */
function ReturnToCoach({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
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
  const router = useRouter();
  const { confirmOwner } = useAppLock();
  const { session, end } = useSigningSession();
  const authorization = useAuthorizationForSigning(true);
  const { record } = useSigningOutbox();

  const kept = keptLanguage?.startedAt === session?.startedAt ? keptLanguage : null;
  const [step, setStep] = useState<Step>(kept === null ? 'language' : 'form');
  const [language, setLanguage] = useState<SupportedLanguage | null>(kept?.language ?? null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);

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

  const current = authorization.data;
  if (session === null || authorization.isPending || current == null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-lg bg-neutral-50 p-lg">
        {authorization.isPending ? (
          <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
        ) : null}
        <ReturnToCoach onPress={() => void leave()} />
      </SafeAreaView>
    );
  }
  const name = signerName(session.signer);

  if (step === 'language' || language === null) {
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
  if (step === 'done') {
    return (
      <SafeAreaView
        testID="signing-done"
        style={{ direction: isRtlLanguage(language) ? 'rtl' : 'ltr' }}
        className="flex-1 bg-neutral-50"
      >
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

  const submit = async (signing: AuthorizationSigning) => {
    setHasFailed(false);
    // She could not draw: the coach confirms, on her own device check, that she agreed.
    if (signing.unableToDraw && !(await confirmOwner())) {
      playHaptic('warning');
      return;
    }
    setIsSaving(true);
    try {
      const outcome = await record({
        id: randomUUID(),
        signer: session.signer,
        versionId: current.versionId,
        payload: buildSignPayload(signing, {
          language,
          device: `${Platform.OS} ${String(Platform.Version)}`,
        }),
        signedAt: new Date().toISOString(),
      });
      setIsWaiting(outcome === 'waiting');
      playHaptic('success');
      setStep('done');
    } catch {
      playHaptic('error');
      setHasFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthorizationForm
      testID="signing-form"
      content={current.content}
      seasonName={current.seasonName}
      language={language}
      isOtherLanguage
      isBusy={isSaving}
      hasFailed={hasFailed}
      onSubmit={(signing) => void submit(signing)}
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
    />
  );
}

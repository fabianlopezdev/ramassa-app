/**
 * A new version of the app terms (RAPP-613). Staff published new terms; a
 * player who already joined reads them and accepts them here, on this screen
 * alone, the next time she opens the app. Nothing of the wizard comes back.
 *
 * It looks like the onboarding terms screen: the full text first, the
 * acceptance chip never pre-ticked, the photo and video choice separate and
 * optional (opening with her current choice, so accepting never withdraws it
 * silently), and her signature. "Not now" signs her out after asking; the
 * gate brings her back here on her next sign-in.
 */
import { ConsentRow } from '@/components/authorization/consent-row';
import { SignatureSection } from '@/components/authorization/signature-section';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { TermsBody } from '@/components/onboarding/terms-body';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { appTermsWording } from '@/lib/app-terms-wording';
import { logout } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm-action';
import { playHaptic } from '@/lib/haptics/haptics';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { acceptCurrentAppTerms } from '@ramassa/shared/intake';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import {
  termsSigningPayload,
  termsSigningSchema,
  type LanguageCode,
} from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

export default function TermsUpdateScreen() {
  const { t, i18n } = useTranslation(['onboarding', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { user, refreshProfile } = useAuth();
  const current = useQuery({
    queryKey: ['app-terms-update', user?.id ?? 'signed-out'],
    queryFn: async ({ signal }) => {
      const [catalog, profile] = await Promise.all([
        fetchIntakeCatalog(supabase),
        fetchOwnProfile(supabase, { signal }),
      ]);
      return { terms: catalog.terms ?? null, mediaConsent: profile?.media_consent === true };
    },
    enabled: user !== null,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  if (current.data === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center bg-neutral-50"
        testID="terms-update-loading"
      >
        <ActivityIndicator
          accessibilityLabel={t('common:loading')}
          color={tokens.colors.primary.DEFAULT}
        />
      </View>
    );
  }
  return (
    <TermsUpdateForm
      key={current.data.terms?.id ?? 'bundled'}
      wording={appTermsWording(
        current.data.terms,
        (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca',
        (key) => t(key),
      )}
      initialMediaConsent={current.data.mediaConsent}
      languageFontClass={languageFontClass}
      onAccepted={refreshProfile}
    />
  );
}

function TermsUpdateForm({
  wording,
  initialMediaConsent,
  languageFontClass,
  onAccepted,
}: {
  readonly wording: ReturnType<typeof appTermsWording>;
  readonly initialMediaConsent: boolean;
  readonly languageFontClass: string;
  readonly onAccepted: () => Promise<void>;
}) {
  const { t } = useTranslation('onboarding');
  const [isAccepted, setIsAccepted] = useState(false);
  const [hasMediaConsent, setHasMediaConsent] = useState(initialMediaConsent);
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [unableToDraw, setUnableToDraw] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignatureError, setHasSignatureError] = useState(false);
  const [hasAcceptError, setHasAcceptError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  async function accept() {
    if (!isAccepted) {
      setHasAcceptError(true);
      playHaptic('warning');
      return;
    }
    const signing = termsSigningSchema.safeParse({
      termsAccepted: isAccepted,
      mediaConsent: hasMediaConsent,
      strokes: unableToDraw ? null : strokes,
      unableToDraw,
    });
    if (!signing.success) {
      setHasSignatureError(true);
      playHaptic('warning');
      return;
    }
    // A version only the bundled text stands for cannot be accepted here: the
    // gate opened on a version her app could not read. Reloading reads it.
    if (wording.versionId === null) {
      setFailureCode('DB-1');
      return;
    }
    setFailureCode(null);
    setIsSubmitting(true);
    try {
      await acceptCurrentAppTerms(supabase, {
        versionId: wording.versionId,
        localeShown: wording.localeShown,
        signing: termsSigningPayload(signing.data, `${Platform.OS} ${String(Platform.Version)}`),
      });
      playHaptic('success');
      // Flips `needsTermsAcceptance`; the (app) layout then opens her home.
      await onAccepted();
    } catch (error) {
      setFailureCode(toAppError(error).code);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <WizardFrame
      screenId={'terms'}
      scrollEnabled={!isDrawing}
      title={wording.title}
      intro={wording.mediaHint}
      continueLabel={t('finishAction')}
      onContinue={() => void accept()}
      isContinueBusy={isSubmitting}
    >
      <TermsBody body={wording.body} />

      <ConsentRow
        testID="terms-update-acceptance"
        required
        requiredMark={t('authorizationRequiredMark')}
        label={wording.acceptLabel}
        checked={isAccepted}
        onToggle={() => {
          setIsAccepted((value) => !value);
          setHasAcceptError(false);
          setFailureCode(null);
        }}
      />
      {hasAcceptError ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${languageFontClass}`}
        >
          {t('errorTermsRequired')}
        </Text>
      ) : null}

      <ConsentRow
        testID="terms-update-media-consent"
        required={false}
        requiredMark=""
        label={wording.mediaLabel}
        checked={hasMediaConsent}
        onToggle={() => setHasMediaConsent((value) => !value)}
      />

      <SignatureSection
        strokes={strokes}
        onChange={(value) => {
          setStrokes(value);
          setHasSignatureError(false);
        }}
        unableToDraw={unableToDraw}
        onUnableToDrawChange={(value) => {
          setUnableToDraw(value);
          setHasSignatureError(false);
        }}
        onDrawingChange={setIsDrawing}
        hasError={hasSignatureError}
        testID="terms-update-cannot-draw"
      />

      {failureCode === null ? null : (
        <FailureNotice code={failureCode} message={t('completionFailed')} />
      )}

      <PressableScale
        accessibilityLabel={t('termsDeclineAction')}
        isDisabled={isSubmitting}
        onPress={() =>
          confirmAction({
            title: t('termsLeaveTitle'),
            message: t('termsLeaveBody'),
            cancelLabel: t('termsLeaveStayAction'),
            confirmLabel: t('termsLeaveConfirmAction'),
            onConfirm: () => void logout(),
          })
        }
        haptic="selection"
        className="min-h-min items-center justify-center py-sm"
      >
        <Text className={`text-form font-medium text-neutral-700 ${languageFontClass}`}>
          {t('termsDeclineAction')}
        </Text>
      </PressableScale>
    </WizardFrame>
  );
}

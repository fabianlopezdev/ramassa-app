/**
 * A new version of the app terms (RAPP-613). Staff published new terms; a
 * player who already joined reads them and accepts them here, the next time
 * she opens the app. Nothing of the wizard comes back.
 *
 * The terms are a form staff build (RAPP-772): she walks its screens as the
 * version froze them, with the shared form walker, and the last one sends her
 * acceptance with her answers, her ticks and her signatures. Her photo and
 * video choice opens as she left it, so accepting never withdraws it
 * silently. "Ara no" signs her out after asking; the gate brings her back
 * here on her next sign-in.
 *
 * Terms this build cannot read are never accepted: she is asked to try again.
 */
import { FailureNotice } from '@/components/error-code-line';
import { FormWalker } from '@/components/forms/form-walker';
import { TermsDeclineAction } from '@/components/onboarding/terms-decline-action';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import { acceptCurrentAppTerms, APP_TERMS_MEDIA_KEY } from '@ramassa/shared/intake';
import {
  appTermsForm,
  appTermsSubmission,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  formScreenTextsIn,
  formWalkScreens,
  isTermsSignScreen,
  withAppTermsForm,
} from '@ramassa/shared/intake-builder';
import { fetchOwnProfile } from '@ramassa/shared/profile';
import { tokens } from '@ramassa/shared/tokens';

export default function TermsUpdateScreen() {
  const { t } = useTranslation(['onboarding', 'common', 'errors']);
  const { language } = useLanguage();
  const { user, refreshProfile } = useAuth();
  const current = useQuery({
    queryKey: ['app-terms-update', user?.id ?? 'signed-out'],
    queryFn: async ({ signal }) => {
      const [catalog, answers, profile] = await Promise.all([
        fetchIntakeCatalog(supabase),
        fetchMyCustomAnswers(supabase),
        fetchOwnProfile(supabase, { signal }),
      ]);
      return {
        catalog: withAppTermsForm(catalog),
        answers,
        mediaConsent: profile?.media_consent === true,
      };
    },
    enabled: user !== null,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  if (current.data === undefined && !current.isError) {
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
  const catalog = current.data?.catalog;
  const terms = catalog?.terms ?? null;
  const form = catalog === undefined ? undefined : appTermsForm(catalog);
  // Her terms could not be read, or this build cannot read them: she retries
  // or leaves. Accepting needs the version she was shown.
  if (
    current.data === undefined ||
    catalog === undefined ||
    terms === null ||
    form === undefined ||
    formWalkScreens(catalog, form, current.data.answers).length === 0
  ) {
    return (
      <TermsUnavailable
        failureCode={current.isError ? toAppError(current.error).code : 'VALIDATION-1'}
        isRetrying={current.isFetching}
        onRetry={() => void current.refetch()}
      />
    );
  }
  return (
    <FormWalker
      key={terms.id}
      catalog={catalog}
      form={form}
      saved={current.data.answers}
      savedConsents={{ [APP_TERMS_MEDIA_KEY]: current.data.mediaConsent }}
      sendLabel={t('finishAction')}
      failureMessage={t('completionFailed')}
      onLeave={undefined}
      onSubmit={async (draft, screens): Promise<AppErrorCode | null> => {
        const submission = appTermsSubmission({
          catalog,
          terms,
          screens,
          draft,
          language,
          device: `${Platform.OS} ${String(Platform.Version)}`,
        });
        if (submission === null) return 'VALIDATION-1';
        try {
          await acceptCurrentAppTerms(supabase, {
            versionId: terms.id,
            localeShown: submission.kind === 'form' ? language : submission.localeShown,
            signing: submission.kind === 'form' ? submission.acceptance : submission.signing,
          });
          // Flips `needsTermsAcceptance`; the (app) layout then opens her home.
          await refreshProfile();
          return null;
        } catch (error) {
          return toAppError(error).code;
        }
      }}
      footer={(screen, isSending) =>
        isTermsSignScreen(screen) ? (
          <TermsDeclineAction
            label={formScreenTextsIn(screen.texts, language).declineLabel}
            isDisabled={isSending}
          />
        ) : null
      }
    />
  );
}

function TermsUnavailable({
  failureCode,
  isRetrying,
  onRetry,
}: {
  readonly failureCode: AppErrorCode;
  readonly isRetrying: boolean;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation(['onboarding', 'errors']);
  return (
    <WizardFrame
      screenId={'terms'}
      title={t('termsTitle')}
      continueLabel={t('errors:retry')}
      onContinue={onRetry}
      isContinueBusy={isRetrying}
    >
      <FailureNotice code={failureCode} message={t('termsUpdateLoadFailed')} />
      <TermsDeclineAction label={null} isDisabled={isRetrying} />
    </WizardFrame>
  );
}

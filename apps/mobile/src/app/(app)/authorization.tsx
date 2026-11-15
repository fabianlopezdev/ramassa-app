/**
 * Ramassà's participation authorization for the season (RAPP-304).
 *
 * A player without a valid authorization sees only this screen. Since
 * RAPP-773 the authorization is a legal form staff build: she walks its
 * screens as the version she is shown froze them, with the shared form
 * walker (the text she reads, the questions, the consents, the signatures),
 * and the last one, with her own signature ("No puc signar" allowed), sends
 * it. A returning player first checks her details and answers the season's
 * questions on the app's own re-registration screens (RAPP-306).
 *
 * An authorization this build cannot read is never signed: she is asked to
 * try again.
 */

import { ReregistrationSteps } from '@/components/authorization/reregistration-steps';
import { FailureNotice } from '@/components/error-code-line';
import { FormWalker } from '@/components/forms/form-walker';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { useAuthorizationStatus, useSignAuthorization } from '@/lib/authorization';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { buildSignPayload } from '@ramassa/shared/authorization';
import { toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  authorizationForm,
  authorizationWalkForm,
  fetchIntakeCatalog,
  fetchMyCustomAnswers,
  formWalkScreens,
  withSeasonName,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

export default function AuthorizationScreen() {
  const { t } = useTranslation(['onboarding', 'common']);
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useAuth();
  const status = useAuthorizationStatus(true);
  const sign = useSignAuthorization();
  // Her catalog holds the form as the version she is shown froze it, and her
  // saved answers fill in its questions for her to confirm or change.
  const walk = useQuery({
    queryKey: ['authorization-walk', user?.id ?? 'signed-out', status.data?.versionId ?? 'none'],
    queryFn: async () => {
      const [catalog, answers] = await Promise.all([
        fetchIntakeCatalog(supabase),
        fetchMyCustomAnswers(supabase),
      ]);
      return { catalog, answers };
    },
    enabled: user !== null && status.data != null,
    gcTime: 0,
  });
  // A returning player checks her details and answers the season questions
  // first (RAPP-306); a new player signs straight away.
  const [hasReregistered, setHasReregistered] = useState(false);

  const current = status.data;
  if (status.isPending || (current != null && walk.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator
          accessibilityLabel={t('common:loading')}
          color={tokens.colors.primary.DEFAULT}
        />
      </View>
    );
  }
  const catalog = walk.data?.catalog;
  const found = catalog === undefined ? undefined : authorizationForm(catalog);
  const form = found === undefined ? undefined : authorizationWalkForm(found);
  if (
    status.isError ||
    current == null ||
    current.formId === null ||
    catalog === undefined ||
    form === undefined ||
    formWalkScreens(catalog, form, walk.data?.answers ?? {}).length === 0
  ) {
    const error = status.error ?? walk.error;
    return (
      <AuthorizationUnavailable
        failureCode={error == null ? 'VALIDATION-1' : toAppError(error).code}
        isRetrying={status.isFetching || walk.isFetching}
        onRetry={() => {
          void status.refetch();
          void walk.refetch();
        }}
      />
    );
  }
  if (current.isReturning && !hasReregistered) {
    return (
      <ReregistrationSteps
        seasonName={current.seasonName}
        texts={current.content.texts}
        onDone={() => setHasReregistered(true)}
      />
    );
  }

  return (
    <FormWalker
      key={current.versionId}
      catalog={catalog}
      form={form}
      saved={walk.data?.answers ?? {}}
      sendLabel={t('authorizationSignAndEnterAction')}
      failureMessage={t('authorizationSignFailed')}
      onLeave={undefined}
      fillText={(text) => withSeasonName(text, current.seasonName)}
      onSubmit={async (draft, screens): Promise<AppErrorCode | null> => {
        const payload = buildSignPayload({
          catalog,
          screens,
          draft,
          language,
          device: `${Platform.OS} ${String(Platform.Version)}`,
        });
        if (payload === null) return 'VALIDATION-1';
        try {
          await sign.mutateAsync({ versionId: current.versionId, payload });
          router.replace('/' as Href);
          return null;
        } catch (error) {
          return toAppError(error).code;
        }
      }}
    />
  );
}

function AuthorizationUnavailable({
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
      title={t('seasonAuthorizationTitle')}
      continueLabel={t('errors:retry')}
      onContinue={onRetry}
      isContinueBusy={isRetrying}
    >
      <View testID="authorization-unavailable">
        <FailureNotice code={failureCode} message={t('authorizationLoadFailed')} />
      </View>
    </WizardFrame>
  );
}

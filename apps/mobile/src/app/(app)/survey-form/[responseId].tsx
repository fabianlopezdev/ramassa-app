/**
 * A survey on the form engine (RAPP-929), opened from Home. The address names
 * her response: the ask she is answering.
 *
 * Its screens are walked with the shared form walker (`FormWalker`), as a
 * form's are, from the version she was asked (`surveyCatalog`). The last
 * screen sends her answers with `complete_survey`: they stay with her
 * response and never reach her record. A survey is always optional, so Back
 * on its first screen leaves it for later.
 *
 * Her answers so far are kept as she goes, the way a form's are (RAPP-945):
 * she comes back to the screen she left with what she had answered. When
 * they cannot be read (offline), the survey opens from the start.
 */

import { FormWalker } from '@/components/forms/form-walker';
import { useCustomFormProgress, useKeepCustomFormProgress } from '@/lib/custom-forms';
import { useAnswerSurvey, useMySurveySource, useRefreshMySurveys } from '@/lib/survey-forms';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  customFormById,
  formProgressOf,
  formWalkPayload,
  formWalkScreens,
  resumedFormWalk,
  surveyCatalog,
  type CustomAnswerValue,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

/** A survey asks nothing she answered before: it starts empty. */
const NO_ANSWERS: Readonly<Record<string, CustomAnswerValue>> = {};

export default function SurveyFormRoute() {
  const { t } = useTranslation(['onboarding', 'surveys']);
  const { language } = useLanguage();
  const router = useRouter();
  const { responseId = '' } = useLocalSearchParams<{ responseId: string }>();
  const source = useMySurveySource();
  const answer = useAnswerSurvey();
  const leave = useRefreshMySurveys();
  const progress = useCustomFormProgress(responseId);
  const keepProgress = useKeepCustomFormProgress(responseId, progress.data ?? null);
  const survey = source.data?.surveys.find((each) => each.responseId === responseId);
  const catalog = useMemo(
    () =>
      survey === undefined || source.data === undefined
        ? undefined
        : surveyCatalog(source.data.raw, survey),
    [source.data, survey],
  );

  if (source.isPending || progress.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-neutral-50"
        testID="survey-form-loading"
      >
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  const form =
    survey === undefined || catalog === undefined
      ? undefined
      : customFormById(catalog, survey.formId);
  // Answered, closed, withdrawn or someone else's: Home shows what is left.
  if (
    survey === undefined ||
    catalog === undefined ||
    form === undefined ||
    formWalkScreens(catalog, form, NO_ANSWERS).length === 0
  ) {
    return <Redirect href={'/' as Href} />;
  }
  const resumed = resumedFormWalk(catalog, form, NO_ANSWERS, progress.data ?? null);
  return (
    <FormWalker
      key={responseId}
      catalog={catalog}
      form={form}
      saved={resumed.answers}
      startScreenId={resumed.screenId}
      onProgress={
        progress.isSuccess
          ? (answers, screenId) =>
              keepProgress(formProgressOf(catalog, form, NO_ANSWERS, answers, screenId))
          : undefined
      }
      sendLabel={t('surveys:submit')}
      failureMessage={t('onboarding:customFormFailed')}
      onSubmit={async (draft, screens) => {
        const payload = formWalkPayload(catalog, screens, draft, language);
        const code = await answer(responseId, payload.answers as Readonly<Record<string, unknown>>);
        if (code === null) router.replace('/' as Href);
        return code;
      }}
      onLeave={() => {
        // Home reads her surveys again, so a started one says so.
        leave();
        router.back();
      }}
    />
  );
}

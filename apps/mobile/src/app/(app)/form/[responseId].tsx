/**
 * A form the team created (RAPP-700), opened from Home, from its notification,
 * or by the gate when it keeps her from the app. The address names her
 * response: the ask she is answering.
 *
 * Its screens are walked with the shared form walker (`FormWalker`), which
 * draws each screen with the Onboarding wizard's own pieces. The last screen
 * sends everything through the Onboarding writers; until then her answers
 * stay on the form.
 *
 * Right after her Onboarding it can open as a form chained to it (RAPP-703):
 * an optional one she puts off with Back leaves the walk and stays on Home.
 */

import { FormWalker } from '@/components/forms/form-walker';
import { useAnswerCustomForm, useCustomFormSource, useMyCustomForms } from '@/lib/custom-forms';
import { useMyOnboardingChain, usePassChainedForm } from '@/lib/onboarding-chain';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  customFormById,
  customFormRef,
  formWalkPayload,
  formWalkScreens,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

export default function CustomFormRoute() {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const router = useRouter();
  const { responseId = '' } = useLocalSearchParams<{ responseId: string }>();
  const pending = useMyCustomForms(true);
  const source = useCustomFormSource(true);
  const chain = useMyOnboardingChain(true);
  const passChainedForm = usePassChainedForm();
  const answer = useAnswerCustomForm();

  if (pending.isPending || source.isPending) {
    return (
      <View
        className="flex-1 items-center justify-center bg-neutral-50"
        testID="custom-form-loading"
      >
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  const asked = pending.data?.find((form) => form.responseId === responseId);
  const form =
    asked === undefined || source.data === undefined
      ? undefined
      : customFormById(source.data.catalog, asked.formId);
  // Answered, dismissed, archived, someone else's, or with nothing left to ask: Home shows what is left.
  if (
    asked === undefined ||
    form === undefined ||
    source.data === undefined ||
    formWalkScreens(source.data.catalog, form, source.data.answers).length === 0
  ) {
    return <Redirect href={'/' as Href} />;
  }
  const { catalog, answers: saved } = source.data;
  const ref = customFormRef(form.id);
  const isChained = chain.data?.includes(ref) === true;
  // A legal form is never put off (RAPP-771): Back on its first screen goes nowhere.
  const isBlocking = asked.isBlocking || asked.kind === 'legal';
  return (
    <FormWalker
      key={responseId}
      catalog={catalog}
      form={form}
      saved={saved}
      sendLabel={t('customFormSend')}
      failureMessage={t('customFormFailed')}
      onSubmit={async (draft, screens) => {
        const code = await answer(responseId, formWalkPayload(catalog, screens, draft, language));
        if (code === null) router.replace('/' as Href);
        return code;
      }}
      onLeave={
        // An optional chained form she puts off leaves the walk (RAPP-703).
        isChained && !isBlocking
          ? () => {
              passChainedForm(ref);
              router.replace('/' as Href);
            }
          : isBlocking
            ? undefined
            : () => router.back()
      }
    />
  );
}

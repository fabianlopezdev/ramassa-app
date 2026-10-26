/**
 * A form the team created (RAPP-700), opened from Home, from its notification,
 * or by the gate when it keeps her from the app. The address names her
 * response: the ask she is answering.
 *
 * Its screens are walked with the Onboarding wizard's own pieces: the frame
 * and its progress, the generic field renderer, the answer checks, the
 * signature blocks and the consent ticks, each in the order the screen
 * shares. Every question shows her saved answer to confirm or change. The
 * last screen sends everything through the Onboarding writers; until then her
 * answers stay on this screen.
 */

import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { useScreenConsents } from '@/components/onboarding/screen-consents';
import { useSignatureBlocks } from '@/components/onboarding/signature-blocks';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { useAnswerCustomForm, useCustomFormSource, useMyCustomForms } from '@/lib/custom-forms';
import { playHaptic } from '@/lib/haptics/haptics';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { useLanguage } from '@ramassa/shared/i18n';
import {
  customFormById,
  customFormScreenBlocks,
  customFormScreenConsents,
  customFormScreenQuestions,
  formSignaturesPayload,
  isCustomQuestionVisible,
  textIn,
  updateCustomAnswer,
  type CustomForm,
  type CustomFormScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

type Strokes = Readonly<Record<string, SignatureStrokes | null>>;
type Ticks = Readonly<Record<string, boolean>>;

/** What she gave on the form so far, kept across its screens. */
interface FormDraft {
  readonly answers: CustomAnswerDraft;
  readonly signatures: Strokes;
  readonly consents: Ticks;
}

export default function CustomFormRoute() {
  const { responseId = '' } = useLocalSearchParams<{ responseId: string }>();
  const pending = useMyCustomForms(true);
  const source = useCustomFormSource(true);

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
  // Answered, dismissed, archived or not hers: Home shows what is left.
  if (asked === undefined || form === undefined || source.data === undefined) {
    return <Redirect href={'/' as Href} />;
  }
  return (
    <FormWalk
      key={responseId}
      responseId={responseId}
      form={form}
      catalog={source.data.catalog}
      saved={source.data.answers}
      isBlocking={asked.isBlocking}
    />
  );
}

/** The screens that ask her something, in the form's order. */
function askingScreens(catalog: IntakeCatalog, form: CustomForm): readonly CustomFormScreen[] {
  return form.screens.filter(
    (screen) =>
      customFormScreenQuestions(catalog, screen.id).length > 0 ||
      customFormScreenBlocks(catalog, screen.id).length > 0 ||
      customFormScreenConsents(catalog, screen.id).length > 0,
  );
}

function FormWalk({
  responseId,
  form,
  catalog,
  saved,
  isBlocking,
}: {
  readonly responseId: string;
  readonly form: CustomForm;
  readonly catalog: IntakeCatalog;
  readonly saved: CustomAnswerDraft;
  readonly isBlocking: boolean;
}) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const router = useRouter();
  const answer = useAnswerCustomForm();
  const screens = askingScreens(catalog, form);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<FormDraft>({ answers: saved, signatures: {}, consents: {} });
  const [isSending, setIsSending] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const screen = screens[index];
  if (screen === undefined) return <Redirect href={'/' as Href} />;

  async function send(final: FormDraft) {
    const asked = screens.flatMap((each) => customFormScreenQuestions(catalog, each.id));
    const blocks = screens.flatMap((each) => customFormScreenBlocks(catalog, each.id));
    const consents = screens.flatMap((each) => customFormScreenConsents(catalog, each.id));
    setIsSending(true);
    setHasFailed(false);
    const isSent = await answer(responseId, {
      answers: Object.fromEntries(
        asked
          .filter((question) => isCustomQuestionVisible(question, final.answers))
          .map((question) => [question.id, final.answers[question.id] ?? null]),
      ),
      signatures: formSignaturesPayload(blocks, final.signatures, language),
      ...(consents.length === 0
        ? {}
        : {
            consents: Object.fromEntries(
              consents.map((consent) => [consent.key, final.consents[consent.key] === true]),
            ),
          }),
      language,
    });
    setIsSending(false);
    if (!isSent) {
      setHasFailed(true);
      playHaptic('warning');
      return;
    }
    playHaptic('success');
    router.replace('/' as Href);
  }

  return (
    <FormStep
      key={screen.id}
      catalog={catalog}
      screen={screen}
      number={index + 1}
      total={screens.length}
      draft={draft}
      isLast={index === screens.length - 1}
      isSending={isSending}
      failure={hasFailed ? t('customFormFailed') : null}
      onBack={
        index > 0
          ? (next) => {
              setDraft(next);
              setIndex(index - 1);
            }
          : isBlocking
            ? undefined
            : () => router.back()
      }
      onContinue={(next) => {
        setDraft(next);
        if (index < screens.length - 1) {
          setIndex(index + 1);
          return;
        }
        void send(next);
      }}
    />
  );
}

function FormStep({
  catalog,
  screen,
  number,
  total,
  draft,
  isLast,
  isSending,
  failure,
  onBack,
  onContinue,
}: {
  readonly catalog: IntakeCatalog;
  readonly screen: CustomFormScreen;
  readonly number: number;
  readonly total: number;
  readonly draft: FormDraft;
  readonly isLast: boolean;
  readonly isSending: boolean;
  readonly failure: string | null;
  readonly onBack: ((draft: FormDraft) => void) | undefined;
  readonly onContinue: (draft: FormDraft) => void;
}) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const questions = customFormScreenQuestions(catalog, screen.id);
  const [answers, setAnswers] = useState<CustomAnswerDraft>(draft.answers);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const source = { catalog, signatures: draft.signatures, consents: draft.consents };
  const signatures = useSignatureBlocks(screen.id, setIsDrawing, source);
  const consents = useScreenConsents(screen.id, source);
  const intro = textIn(screen.intro, language);

  const current = (checked: CustomAnswerDraft): FormDraft => ({
    answers: { ...draft.answers, ...checked },
    signatures: signatures.drafted(draft.signatures),
    consents: consents.drafted(draft.consents),
  });

  return (
    <WizardFrame
      stepNumber={number}
      totalSteps={total}
      title={textIn(screen.title, language)}
      intro={intro === '' ? undefined : intro}
      scrollEnabled={!isDrawing}
      continueLabel={isLast ? t('customFormSend') : t('continueAction')}
      isContinueBusy={isSending}
      onContinue={() => {
        // The shared checks, as on her Onboarding (RAPP-610).
        const checked = checkCustomAnswers(questions, answers, t);
        setAnswers(checked.answers);
        setErrors(checked.errors);
        const isSigned = signatures.check();
        const isTicked = consents.check();
        if (Object.keys(checked.errors).length > 0 || !isSigned || !isTicked) {
          playHaptic('warning');
          return;
        }
        onContinue(current(checked.answers));
      }}
      onBack={onBack === undefined ? undefined : () => onBack(current(answers))}
    >
      <WizardValidationSummary
        isVisible={Object.keys(errors).length > 0 || signatures.hasErrors || consents.hasErrors}
        message={t('errorSummary')}
      />
      <WizardValidationSummary
        testID="custom-form-failed"
        isVisible={failure !== null}
        message={failure ?? ''}
      />
      <View testID={`custom-form-screen-${screen.id}`} className="gap-lg">
        {signatures.interleave(
          questions.filter((question) => isCustomQuestionVisible(question, answers)),
          (question) => (
            <CustomQuestionField
              key={question.id}
              question={question}
              value={answers[question.id]}
              errorMessage={errors[question.id]}
              onChange={(value) => {
                setAnswers((existing) =>
                  updateCustomAnswer(questions, existing, question.id, value),
                );
                if (errors[question.id] !== undefined) {
                  setErrors((existing) =>
                    Object.fromEntries(
                      Object.entries(existing).filter(([id]) => id !== question.id),
                    ),
                  );
                }
              }}
            />
          ),
          consents.entries,
        )}
      </View>
    </WizardFrame>
  );
}

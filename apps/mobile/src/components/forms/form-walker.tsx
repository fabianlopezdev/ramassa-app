/**
 * Walking a form she fills in (RAPP-700, RAPP-772): a form the team created,
 * the app terms at the end of her Onboarding, and the terms she accepts
 * again. Each screen is drawn with the Onboarding wizard's own pieces: the
 * frame and its progress, the generic field renderer, the answer checks, the
 * blocks (signatures, texts, points) and the consent ticks, each in the order
 * the screen shares. Every question shows her saved answer to confirm or
 * change.
 *
 * `FormWalker` keeps the walk itself: her answers stay on the form until the
 * last screen her answers open sends them (`onSubmit`, the caller's writer).
 * `FormWalkStep` is one screen; her Onboarding walks the terms with it one
 * route per screen, as every wizard step.
 *
 * A screen that depends on an answer (RAPP-715) shows right after the screen
 * asking it, only while her answers so far open it (`@ramassa/shared`'s
 * `formWalkScreens`).
 */

import { FailureNotice } from '@/components/error-code-line';
import { FormAttachments } from '@/components/forms/form-attachments';
import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { useFormBlocks } from '@/components/onboarding/form-blocks';
import { useScreenConsents } from '@/components/onboarding/screen-consents';
import { WizardFrame, type WizardFrameProps } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { checkCustomAnswers } from '@/lib/custom-answer-errors';
import { playHaptic } from '@/lib/haptics/haptics';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import { teamTextIn } from '@ramassa/shared/i18n/localized-content';
import {
  customFormScreenQuestions,
  formScreenTextsIn,
  formWalkScreens,
  isCustomQuestionVisible,
  updateCustomAnswer,
  type CustomForm,
  type CustomFormScreen,
  type FormWalkDraft,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

/** A send that failed: the code staff can act on, and what she reads. */
export interface FormWalkFailure {
  readonly code: AppErrorCode;
  readonly message: string;
}

export interface FormWalkerProps {
  readonly catalog: IntakeCatalog;
  readonly form: Pick<CustomForm, 'screens'>;
  /** Her saved answers by field, to confirm or change. */
  readonly saved: CustomAnswerDraft;
  /** Her ticks as she gave them before (her photo choice on the terms), by consent key. */
  readonly savedConsents?: Readonly<Record<string, boolean>>;
  /** Sends what she gave on the screens she saw; the code of a failure, else null. */
  readonly onSubmit: (
    draft: FormWalkDraft,
    screens: readonly CustomFormScreen[],
  ) => Promise<AppErrorCode | null>;
  /** What she reads when the send failed. */
  readonly failureMessage: string;
  /** The main button of the last screen, when the screen names none. */
  readonly sendLabel: string;
  /** Back on the first screen; undefined when there is nowhere to go. */
  readonly onLeave: (() => void) | undefined;
  /** What a screen shows under its blocks beside the walk: the terms' "Ara no". */
  readonly footer?: (screen: CustomFormScreen, isSending: boolean) => ReactNode;
  /** Above every screen's progress: the staff tablet's own controls (RAPP-773). */
  readonly header?: ReactNode;
  /** A text staff wrote, filled in: the authorization names its season (RAPP-773). */
  readonly fillText?: (text: string) => string;
}

export function FormWalker({
  catalog,
  form,
  saved,
  savedConsents = {},
  onSubmit,
  failureMessage,
  sendLabel,
  onLeave,
  footer,
  header,
  fillText,
}: FormWalkerProps) {
  const shownFor = (answers: CustomAnswerDraft) => formWalkScreens(catalog, form, answers);
  const [draft, setDraft] = useState<FormWalkDraft>({
    answers: saved,
    signatures: {},
    consents: savedConsents,
  });
  const [currentId, setCurrentId] = useState(() => shownFor(saved)[0]?.id);
  const [isSending, setIsSending] = useState(false);
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);
  const screens = shownFor(draft.answers);
  const index = screens.findIndex((each) => each.id === currentId);
  const screen = screens[index];
  if (screen === undefined) return null;

  async function send(final: FormWalkDraft, shown: readonly CustomFormScreen[]) {
    setIsSending(true);
    setFailureCode(null);
    const code = await onSubmit(final, shown);
    setIsSending(false);
    if (code !== null) {
      setFailureCode(code);
      playHaptic('warning');
      return;
    }
    playHaptic('success');
  }

  return (
    <FormWalkStep
      key={screen.id}
      catalog={catalog}
      screen={screen}
      position={{ step: index + 1, total: screens.length }}
      draft={draft}
      // Send on the last screen her answers open, as she answers this one.
      continueLabelFor={(answers) => {
        const shown = shownFor({ ...draft.answers, ...answers });
        return shown[shown.length - 1]?.id === screen.id ? sendLabel : null;
      }}
      isSending={isSending}
      failure={failureCode === null ? null : { code: failureCode, message: failureMessage }}
      footer={footer?.(screen, isSending)}
      header={header}
      fillText={fillText}
      onBack={
        index > 0
          ? (next) => {
              setDraft(next);
              const shown = shownFor(next.answers);
              setCurrentId(
                shown[
                  Math.max(
                    shown.findIndex((each) => each.id === screen.id),
                    1,
                  ) - 1
                ]?.id,
              );
            }
          : onLeave === undefined
            ? undefined
            : () => onLeave()
      }
      onContinue={(next) => {
        setDraft(next);
        // Her answer on this screen may open or close the next ones.
        const shown = shownFor(next.answers);
        const following = shown[shown.findIndex((each) => each.id === screen.id) + 1];
        if (following !== undefined) {
          setCurrentId(following.id);
          return;
        }
        void send(next, shown);
      }}
    />
  );
}

export interface FormWalkStepProps {
  readonly catalog: IntakeCatalog;
  readonly screen: CustomFormScreen;
  /** Its place in the walk, for the progress bar. */
  readonly position: { readonly step: number; readonly total: number };
  readonly draft: FormWalkDraft;
  /** The main button for these answers when the screen names none; null for Continua. */
  readonly continueLabelFor: (answers: CustomAnswerDraft) => string | null;
  readonly isSending: boolean;
  readonly failure: FormWalkFailure | null;
  readonly onBack: ((draft: FormWalkDraft) => void) | undefined;
  readonly onContinue: (draft: FormWalkDraft) => void;
  /** The wizard step it is, for her Onboarding's frame. */
  readonly frameId?: WizardFrameProps['screenId'];
  /** What the screen shows after its blocks: the terms' "Ara no". */
  readonly footer?: ReactNode;
  /** Above the progress: the staff tablet's own controls. */
  readonly header?: ReactNode;
  /** A text staff wrote, filled in (`{{season}}`). */
  readonly fillText?: (text: string) => string;
}

export function FormWalkStep({
  catalog,
  screen,
  position,
  draft,
  continueLabelFor,
  isSending,
  failure,
  onBack,
  onContinue,
  frameId,
  footer,
  header,
  fillText = (text: string) => text,
}: FormWalkStepProps) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const questions = customFormScreenQuestions(catalog, screen.id);
  const [answers, setAnswers] = useState<CustomAnswerDraft>(draft.answers);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const source = { catalog, signatures: draft.signatures, consents: draft.consents };
  const signatures = useFormBlocks(screen.id, setIsDrawing, source);
  const consents = useScreenConsents(screen.id, source);
  // One rule with the admin (RAPP-710): a language never written follows the Catalan.
  const intro = teamTextIn(screen.intro, language, true);
  const own = formScreenTextsIn(screen.texts, language);

  const current = (checked: CustomAnswerDraft): FormWalkDraft => ({
    answers: { ...draft.answers, ...checked },
    signatures: signatures.drafted(draft.signatures),
    consents: consents.drafted(draft.consents),
  });

  return (
    <WizardFrame
      screenId={frameId}
      stepNumber={position.step}
      totalSteps={position.total}
      title={fillText(teamTextIn(screen.title, language, false))}
      intro={intro === '' ? undefined : fillText(intro)}
      scrollEnabled={!isDrawing}
      header={header}
      // The screen's own help line and main button (RAPP-771).
      help={own.help === '' ? own.help : fillText(own.help)}
      continueLabel={fillText(own.continueLabel ?? continueLabelFor(answers) ?? t('continueAction'))}
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
        {/* The authorization's season documents (RAPP-773). */}
        <FormAttachments attachments={screen.attachments ?? []} />
      </View>
      {/* Mounted only while there IS a failure, so it never takes a slot in the gap. */}
      {failure === null ? null : (
        <View testID="custom-form-failed">
          <FailureNotice code={failure.code} message={failure.message} />
        </View>
      )}
      {footer}
    </WizardFrame>
  );
}

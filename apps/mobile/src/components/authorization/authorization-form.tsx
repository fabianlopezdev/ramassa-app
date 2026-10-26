/**
 * The participation authorization form (RAPP-304): the text staff published
 * (in collapsible sections), the Health screen's fields (her health and her
 * emergency contact among them, RAPP-698), each consent, and her signature,
 * or the ticks alone when she cannot draw.
 *
 * The version gives its consents in their order and the wording of the form
 * (RAPP-614); a wording field staff left empty in her language shows the
 * app's own text. The Health screen hides while staff place no field on it.
 *
 * Her own app shows it in the app's language. On a staff tablet (RAPP-305) it
 * is shown in the language she picks, in her script's direction, whatever the
 * staff app's language is.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTitle } from '@/components/auth/auth-title';
import { ConsentRow } from '@/components/authorization/consent-row';
import { SignatureSection } from '@/components/authorization/signature-section';
import { BrandSymbol } from '@/components/forms/data-icon';
import { FormScreen } from '@/components/layout/form-screen';
import { PressableScale } from '@/components/motion/pressable-scale';
import {
  CustomQuestionField,
  type CustomAnswerDraft,
} from '@/components/onboarding/custom-question-field';
import { WizardProgress } from '@/components/onboarding/wizard-progress';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { fontClassForLanguage } from '@/lib/language-font-class';
import { useOnboardingEntrance } from '@/lib/onboarding-entrance';
import { ScreenLanguageContext } from '@/lib/use-language-font-class';
import { useCallback, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  authorizationScreenOrder,
  authorizationSigningSchemaFor,
  authorizationWording,
  HEALTH_DATA_CONSENT,
  isHealthScreenShown,
  numberAuthorizationDocument,
  orderedConsents,
  type AuthorizationConsentKey,
  type AuthorizationContent,
  type AuthorizationSigning,
  type AuthorizationText,
  type AuthorizationTextField,
} from '@ramassa/shared/authorization';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { isRtlLanguage, resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  checkCustomAnswers,
  isCustomQuestionVisible,
  updateCustomAnswer,
  type CustomAnswers,
  type CustomQuestion,
} from '@ramassa/shared/intake-builder';

type Problem = 'consents' | 'healthConsent' | 'signature';

/** Each screen's phase: 1 the document, 2 the Health screen's fields, 3 consents and signature. */
const PHASE_OF_SCREEN = { document: 1, health: 2, consents: 3 } as const;

// Her text runs in her script's direction, whatever the app's is.
const rtlLayout = { direction: 'rtl' } as const;
const ltrLayout = { direction: 'ltr' } as const;

/** Staff text may name the season as the app's text does. */
function withSeason(text: string, seasonName: string): string {
  return text.replace(/\{\{\s*season\s*\}\}/gu, seasonName);
}

export interface AuthorizationFormProps {
  readonly testID: string;
  readonly content: AuthorizationContent;
  readonly seasonName: string;
  readonly language: SupportedLanguage;
  readonly isBusy: boolean;
  readonly hasFailed: boolean;
  readonly onSubmit: (signing: AuthorizationSigning) => void;
  /**
   * The Health screen's fields (RAPP-698): her health, her emergency contact
   * and whatever staff placed there, asked with the generic field renderer.
   */
  readonly questions: readonly CustomQuestion[];
  /** Her saved answers, filled in; none on a tablet. */
  readonly initialAnswers?: CustomAnswers;
  /** The health field's id: a health answer needs the health data consent. */
  readonly healthFieldId?: string | null;
  /** Shown above the title: the tablet's language choice and hand-back (RAPP-305). */
  readonly header?: ReactNode;
  /**
   * Set on a staff tablet, where the app's language may not be hers: the form
   * then lays out in her script's direction. Her own app is already laid out
   * in hers.
   */
  readonly isOtherLanguage?: boolean;
}

export function AuthorizationForm({
  testID,
  content,
  seasonName,
  language,
  isBusy,
  hasFailed,
  onSubmit,
  questions,
  initialAnswers = {},
  healthFieldId = null,
  header,
  isOtherLanguage = false,
}: AuthorizationFormProps) {
  const { i18n } = useTranslation();
  const t = useMemo(() => i18n.getFixedT(language, 'onboarding'), [i18n, language]);
  const fontClass = fontClassForLanguage(language);
  const displayContent = useMemo(() => numberAuthorizationDocument(content), [content]);
  const consentList = useMemo(() => orderedConsents(displayContent), [displayContent]);
  const signingSchema = useMemo(
    () => authorizationSigningSchemaFor(content, healthFieldId),
    [content, healthFieldId],
  );
  // The phases she goes through, in the version's order (RAPP-696): the
  // health one only while staff place a field on it, the signature always last.
  const phases = authorizationScreenOrder(content)
    .filter((screen) => screen !== 'health' || isHealthScreenShown(questions))
    .map((screen) => PHASE_OF_SCREEN[screen]);
  const [phase, setPhase] = useState(phases[0] ?? 1);
  const phaseIndex = Math.max(0, phases.indexOf(phase));
  const words = (field: AuthorizationTextField, values?: { season: string }) =>
    withSeason(
      authorizationWording(content.texts, field, language) ??
        t(AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field], values),
      seasonName,
    );
  const [readDocument, setReadDocument] = useState<{
    content: AuthorizationContent;
    language: SupportedLanguage;
  } | null>(null);
  const hasReachedDocumentEnd =
    readDocument?.content === content && readDocument.language === language;
  const markDocumentEndReached = useCallback(
    () => setReadDocument({ content, language }),
    [content, language],
  );

  const [consents, setConsents] = useState<Partial<Record<AuthorizationConsentKey, boolean>>>({});
  const [answers, setAnswers] = useState<CustomAnswerDraft>(initialAnswers);
  const [answerErrors, setAnswerErrors] = useState<Readonly<Record<string, string>>>({});
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [unableToDraw, setUnableToDraw] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [problems, setProblems] = useState<ReadonlySet<Problem>>(new Set());
  const clearProblem = useCallback((problem: Problem) => {
    setProblems((current) => {
      if (!current.has(problem)) return current;
      const next = new Set(current);
      next.delete(problem);
      return next;
    });
  }, []);

  const text = (value: AuthorizationText) => resolveLocalizedText(value, language)?.text ?? '';

  const submit = () => {
    // Her answers to the Health screen's fields, only those (RAPP-698).
    const given = Object.fromEntries(
      questions.flatMap((question) => {
        const value = answers[question.id];
        return value === undefined ? [] : [[question.id, value]];
      }),
    );
    const parsed = signingSchema.safeParse({
      consents,
      answers: given,
      strokes: unableToDraw ? null : strokes,
      unableToDraw,
    });
    if (!parsed.success) {
      const found = new Set<Problem>();
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'consents') {
          // Her health answer needs its consent even when the consent is optional.
          const isHealthConsent =
            issue.path[1] === HEALTH_DATA_CONSENT &&
            content.consents[HEALTH_DATA_CONSENT]?.required !== true;
          found.add(isHealthConsent ? 'healthConsent' : 'consents');
        }
        if (issue.path[0] === 'strokes') found.add('signature');
      }
      setProblems(found);
      playHaptic('warning');
      return;
    }
    setProblems(new Set());
    onSubmit(parsed.data);
  };

  const problemText = (problem: Problem, key: string) =>
    problems.has(problem) ? (
      <Text
        selectable
        accessibilityLiveRegion="polite"
        className={`text-start text-form text-error ${fontClass}`}
      >
        {t(key)}
      </Text>
    ) : null;

  const layout = isOtherLanguage ? (isRtlLanguage(language) ? rtlLayout : ltrLayout) : undefined;

  return (
    <ScreenLanguageContext.Provider value={isOtherLanguage ? language : null}>
      <AuthorizationPhase
        key={`${phase}-${language}`}
        phase={phase}
        allowEntrance={!isOtherLanguage}
        testID={testID}
        style={layout}
        accessibilityLanguage={language}
        scrollEnabled={!isDrawing}
        onEndReached={phase === 1 ? markDocumentEndReached : undefined}
        navigation={
          <View>
            {header === undefined ? null : <View className="px-lg pt-sm">{header}</View>}
            <WizardProgress
              language={language}
              step={phaseIndex + 1}
              total={phases.length}
              flowLabel={words('flow_label', { season: seasonName })}
              onBack={phaseIndex === 0 ? undefined : () => setPhase(phases[phaseIndex - 1] ?? 1)}
            />
          </View>
        }
        heading={
          <AuthTitle
            title={
              phase === 1
                ? text(content.title)
                : words(phase === 2 ? 'health_title' : 'consents_title')
            }
            subtitle={phase === 1 ? words('intro', { season: seasonName }) : undefined}
            align="start"
          />
        }
        bottomAction={
          <AuthSubmitButton
            testID="authorization-sign"
            label={words(
              phase < 3
                ? 'continue_label'
                : isOtherLanguage
                  ? 'sign_label'
                  : 'sign_and_enter_label',
            )}
            disabled={phase === 1 && !hasReachedDocumentEnd}
            onPress={() => {
              if (phase === 1 && !hasReachedDocumentEnd) return;
              if (phase === 2) {
                // Each field checked by its own rules, as the database will (RAPP-698).
                const checked = checkCustomAnswers(questions, answers, t);
                setAnswers(checked.answers);
                setAnswerErrors(checked.errors);
                if (Object.keys(checked.errors).length > 0) {
                  playHaptic('warning');
                  return;
                }
              }
              if (phase < 3) {
                setProblems(new Set());
                setPhase(phases[phaseIndex + 1] ?? 3);
                return;
              }
              submit();
            }}
            isLoading={isBusy}
          />
        }
      >
        <View className="gap-lg">
          {phase === 1 ? (
            <>
              <View className="gap-lg">
                {displayContent.sections.map((section) => (
                  <AuthorizationSection
                    key={section.key}
                    title={text(section.title)}
                    body={text(section.body)}
                    fontClass={fontClass}
                  />
                ))}
              </View>

              {content.attachments.length === 0 ? null : (
                <View className="gap-sm">
                  <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
                    {words('documents_title')}
                  </Text>
                  {content.attachments.map((attachment) => (
                    <PressableScale
                      key={attachment.url}
                      accessibilityRole="link"
                      accessibilityLabel={text(attachment.label)}
                      onPress={() => void Linking.openURL(attachment.url)}
                      haptic="tapLight"
                      className="min-h-recommended justify-center"
                    >
                      <Text
                        className={`text-start text-form font-semibold text-primary-dark underline ${fontClass}`}
                      >
                        {text(attachment.label)}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              )}
            </>
          ) : null}
          {phase === 2 ? (
            <View testID="authorization-health-fields" className="gap-lg">
              {questions
                .filter((question) => isCustomQuestionVisible(question, answers))
                .map((question) => (
                  <CustomQuestionField
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    errorMessage={answerErrors[question.id]}
                    onChange={(value) => {
                      setAnswers((current) =>
                        updateCustomAnswer(questions, current, question.id, value),
                      );
                      if (answerErrors[question.id] !== undefined) {
                        setAnswerErrors((current) =>
                          Object.fromEntries(
                            Object.entries(current).filter(([id]) => id !== question.id),
                          ),
                        );
                      }
                    }}
                  />
                ))}
            </View>
          ) : null}
          {phase === 3 ? (
            <>
              <View className="gap-sm">
                {consentList.map((consent) => (
                  <ConsentRow
                    key={consent.key}
                    testID={`authorization-consent-${consent.key}`}
                    label={text(consent.label)}
                    required={consent.required}
                    requiredMark={words('required_mark')}
                    checked={consents[consent.key] === true}
                    onToggle={() => {
                      const next = {
                        ...consents,
                        [consent.key]: consents[consent.key] !== true,
                      };
                      setConsents(next);
                      if (
                        consentList.every((choice) => !choice.required || next[choice.key] === true)
                      )
                        clearProblem('consents');
                      if (consent.key === HEALTH_DATA_CONSENT) clearProblem('healthConsent');
                    }}
                  />
                ))}
                {problemText('consents', 'authorizationErrorConsents')}
                {problemText('healthConsent', 'authorizationErrorHealthConsent')}
              </View>

              <SignatureSection
                strokes={strokes}
                onChange={(value) => {
                  setStrokes(value);
                  clearProblem('signature');
                }}
                unableToDraw={unableToDraw}
                onUnableToDrawChange={(value) => {
                  setUnableToDraw(value);
                  clearProblem('signature');
                }}
                onDrawingChange={setIsDrawing}
                language={language}
                hasError={problems.has('signature')}
                texts={{
                  title: authorizationWording(content.texts, 'signature_title', language),
                  prompt: authorizationWording(content.texts, 'signature_prompt', language),
                  hint: authorizationWording(content.texts, 'signature_hint', language),
                  cannotDraw: authorizationWording(content.texts, 'cannot_draw_label', language),
                  cannotDrawHint: authorizationWording(content.texts, 'cannot_draw_hint', language),
                }}
              />
            </>
          ) : null}

          {hasFailed ? (
            <Text
              selectable
              accessibilityLiveRegion="polite"
              className={`text-start text-form text-error ${fontClass}`}
            >
              {t('authorizationSignFailed')}
            </Text>
          ) : null}
        </View>
      </AuthorizationPhase>
    </ScreenLanguageContext.Provider>
  );
}

function AuthorizationPhase({
  phase,
  allowEntrance,
  ...props
}: ComponentProps<typeof FormScreen> & {
  readonly phase: number;
  readonly allowEntrance: boolean;
}) {
  const entrance = useOnboardingEntrance(`season-authorization-${phase}`, allowEntrance);
  return <FormScreen {...props} entrance={entrance} />;
}

function AuthorizationSection({
  title,
  body,
  fontClass,
}: {
  readonly title: string;
  readonly body: string;
  readonly fontClass: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <View style={continuousCorners} className="rounded-md bg-neutral-50">
      <PressableScale
        accessibilityLabel={title}
        isExpanded={isOpen}
        onPress={() => setIsOpen((open) => !open)}
        haptic="selection"
        className="min-h-recommended flex-row items-center gap-md p-md"
      >
        <Text
          accessibilityRole="header"
          className={`flex-1 text-start text-form font-bold text-neutral-900 ${fontClass}`}
        >
          {title}
        </Text>
        <BrandSymbol
          name={{
            ios: isOpen ? 'chevron.up' : 'chevron.down',
            android: isOpen ? 'expand_less' : 'expand_more',
            web: isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down',
          }}
        />
      </PressableScale>
      {isOpen ? (
        <Text
          selectable
          className={`px-md pb-md text-start text-form leading-body text-neutral-800 ${fontClass}`}
        >
          {body}
        </Text>
      ) : null}
    </View>
  );
}

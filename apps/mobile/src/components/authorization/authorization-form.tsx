/**
 * The participation authorization form (RAPP-304): the text staff published
 * (in collapsible sections), the medical answer, an optional emergency contact, each
 * consent, and her signature, or the ticks alone when she cannot draw.
 *
 * Her own app shows it in the app's language. On a staff tablet (RAPP-305) it
 * is shown in the language she picks, in her script's direction, whatever the
 * staff app's language is.
 */

import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { AuthTitle } from '@/components/auth/auth-title';
import { ConsentRow } from '@/components/authorization/consent-row';
import { SignatureSection } from '@/components/authorization/signature-section';
import { BrandSymbol } from '@/components/forms/data-icon';
import { FormScreen } from '@/components/layout/form-screen';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { ChoiceGrid } from '@/components/onboarding/option-grid';
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
  AUTHORIZATION_CONSENTS,
  authorizationSigningSchema,
  numberAuthorizationDocument,
  type AuthorizationConsentKey,
  type AuthorizationContent,
  type AuthorizationSigning,
  type AuthorizationText,
} from '@ramassa/shared/authorization';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { isRtlLanguage, resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';

type Problem = 'consents' | 'health' | 'signature';

// Her text runs in her script's direction, whatever the app's is.
const rtlLayout = { direction: 'rtl' } as const;
const ltrLayout = { direction: 'ltr' } as const;

export interface AuthorizationFormProps {
  readonly testID: string;
  readonly content: AuthorizationContent;
  readonly seasonName: string;
  readonly language: SupportedLanguage;
  readonly isBusy: boolean;
  readonly hasFailed: boolean;
  readonly onSubmit: (signing: AuthorizationSigning) => void;
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
  header,
  isOtherLanguage = false,
}: AuthorizationFormProps) {
  const { i18n } = useTranslation();
  const t = useMemo(() => i18n.getFixedT(language, 'onboarding'), [i18n, language]);
  const fontClass = fontClassForLanguage(language);
  const displayContent = useMemo(() => numberAuthorizationDocument(content), [content]);
  const [phase, setPhase] = useState(1);
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
  const [hasHealthNotes, setHasHealthNotes] = useState<boolean | null>(null);
  const [healthNotes, setHealthNotes] = useState('');
  const [contact, setContact] = useState({ name: '', relation: '', phone: '' });
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
    // "No" is stored as the paper form asks for it, so staff read it in any language.
    const healthInfo = hasHealthNotes === false ? 'No' : hasHealthNotes ? healthNotes : '';
    const parsed = authorizationSigningSchema.safeParse({
      consents,
      healthInfo,
      emergencyContact:
        contact.name.trim() === '' && contact.relation.trim() === '' && contact.phone.trim() === ''
          ? undefined
          : contact,
      strokes: unableToDraw ? null : strokes,
      unableToDraw,
    });
    if (!parsed.success) {
      const found = new Set<Problem>();
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'consents') found.add('consents');
        if (issue.path[0] === 'healthInfo') found.add('health');
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
              step={phase}
              total={3}
              flowLabel={t('seasonAuthorizationFlow', { season: seasonName })}
              onBack={phase === 1 ? undefined : () => setPhase(phase - 1)}
            />
          </View>
        }
        heading={
          <AuthTitle
            title={
              phase === 1
                ? text(content.title)
                : t(phase === 2 ? 'authorizationHealthTitle' : 'authorizationConsentsTitle')
            }
            subtitle={phase === 1 ? t('authorizationIntro', { season: seasonName }) : undefined}
            align="start"
          />
        }
        bottomAction={
          <AuthSubmitButton
            testID="authorization-sign"
            label={t(
              phase < 3
                ? 'continueAction'
                : isOtherLanguage
                  ? 'authorizationSignAction'
                  : 'authorizationSignAndEnterAction',
            )}
            disabled={phase === 1 && !hasReachedDocumentEnd}
            onPress={() => {
              if (phase === 1 && !hasReachedDocumentEnd) return;
              if (
                phase === 2 &&
                (hasHealthNotes === null || (hasHealthNotes && healthNotes.trim() === ''))
              ) {
                setProblems(new Set(['health']));
                playHaptic('warning');
                return;
              }
              if (phase < 3) {
                setProblems(new Set());
                setPhase(phase + 1);
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
                    {t('authorizationDocumentsTitle')}
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
            <>
              <View className="gap-sm">
                <Text className={`text-start text-form text-neutral-800 ${fontClass}`}>
                  {t('authorizationHealthQuestion')}
                </Text>
                <ChoiceGrid maximumColumns={2}>
                  <OptionChip
                    accessibilityRole="radio"
                    testID="authorization-health-no"
                    label={t('authorizationHealthNo')}
                    accessibilityHint={t('authorizationHealthQuestion')}
                    isSelected={hasHealthNotes === false}
                    onPress={() => {
                      setHasHealthNotes(false);
                      clearProblem('health');
                    }}
                  />
                  <OptionChip
                    accessibilityRole="radio"
                    testID="authorization-health-yes"
                    label={t('authorizationHealthYes')}
                    accessibilityHint={t('authorizationHealthQuestion')}
                    isSelected={hasHealthNotes === true}
                    onPress={() => {
                      setHasHealthNotes(true);
                      clearProblem('health');
                    }}
                  />
                </ChoiceGrid>
                {hasHealthNotes === true ? (
                  <AuthTextField
                    testID="authorization-health-notes"
                    label={t('authorizationHealthLabel')}
                    value={healthNotes}
                    onChangeText={(value) => {
                      setHealthNotes(value);
                      clearProblem('health');
                    }}
                    multiline
                    maxLength={4000}
                  />
                ) : null}
                {problemText('health', 'authorizationErrorHealth')}
              </View>

              <View className="gap-sm">
                <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
                  {t('authorizationEmergencyTitle')}
                </Text>
                <AuthTextField
                  testID="authorization-emergency-name"
                  label={t('authorizationEmergencyName')}
                  value={contact.name}
                  onChangeText={(name) => setContact((value) => ({ ...value, name }))}
                  maxLength={200}
                />
                <AuthTextField
                  testID="authorization-emergency-relation"
                  label={t('authorizationEmergencyRelation')}
                  value={contact.relation}
                  onChangeText={(relation) => setContact((value) => ({ ...value, relation }))}
                  maxLength={100}
                />
                <AuthTextField
                  testID="authorization-emergency-phone"
                  label={t('authorizationEmergencyPhone')}
                  value={contact.phone}
                  onChangeText={(phone) => setContact((value) => ({ ...value, phone }))}
                  keyboardType="phone-pad"
                  maxLength={50}
                />
              </View>
            </>
          ) : null}
          {phase === 3 ? (
            <>
              <View className="gap-sm">
                {AUTHORIZATION_CONSENTS.map((consent) => (
                  <ConsentRow
                    key={consent.key}
                    testID={`authorization-consent-${consent.key}`}
                    label={text(displayContent.consents[consent.key].label)}
                    required={consent.required}
                    requiredMark={t('authorizationRequiredMark')}
                    checked={consents[consent.key] === true}
                    onToggle={() => {
                      const next = {
                        ...consents,
                        [consent.key]: consents[consent.key] !== true,
                      };
                      setConsents(next);
                      if (
                        AUTHORIZATION_CONSENTS.every(
                          (choice) => !choice.required || next[choice.key] === true,
                        )
                      )
                        clearProblem('consents');
                    }}
                  />
                ))}
                {problemText('consents', 'authorizationErrorConsents')}
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

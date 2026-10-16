/**
 * The participation authorization form (RAPP-304): the text staff published
 * (each section opens), the medical answer, an optional emergency contact, each
 * consent, and her signature, or the ticks alone when she cannot draw.
 *
 * Her own app shows it in the app's language. On a staff tablet (RAPP-305) it
 * is shown in the language she picks, in her script's direction, whatever the
 * staff app's language is.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { ConsentRow } from '@/components/authorization/consent-row';
import { SignaturePad } from '@/components/equipment/signature-pad';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { fontClassForLanguage } from '@/lib/language-font-class';
import { ScreenLanguageContext } from '@/lib/use-language-font-class';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AUTHORIZATION_CONSENTS,
  authorizationSigningSchema,
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

  const [openSection, setOpenSection] = useState<string | null>(null);
  const [consents, setConsents] = useState<Partial<Record<AuthorizationConsentKey, boolean>>>({});
  const [hasHealthNotes, setHasHealthNotes] = useState<boolean | null>(null);
  const [healthNotes, setHealthNotes] = useState('');
  const [contact, setContact] = useState({ name: '', relation: '', phone: '' });
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [unableToDraw, setUnableToDraw] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [problems, setProblems] = useState<ReadonlySet<Problem>>(new Set());

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
        accessibilityLiveRegion="polite"
        className={`text-start text-sm text-error ${fontClass}`}
      >
        {t(key)}
      </Text>
    ) : null;

  const layout = isOtherLanguage ? (isRtlLanguage(language) ? rtlLayout : ltrLayout) : undefined;

  return (
    <ScreenLanguageContext.Provider value={isOtherLanguage ? language : null}>
      <SafeAreaView
        testID={testID}
        style={layout}
        className="flex-1 bg-neutral-50"
        edges={['top', 'left', 'right']}
      >
        <ScrollView
          scrollEnabled={!isDrawing}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="pb-3xl"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <PageWidth className="gap-lg p-lg">
            {header}
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
              >
                {text(content.title)}
              </Text>
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('authorizationIntro', { season: seasonName })}
              </Text>
            </View>

            <View className="gap-sm">
              {content.sections.map((section) => {
                const isOpen = openSection === section.key;
                return (
                  <View
                    key={section.key}
                    style={continuousCorners}
                    className="rounded-md border border-neutral-200 bg-white"
                  >
                    <PressableScale
                      testID={`authorization-section-${section.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={text(section.title)}
                      onPress={() => setOpenSection(isOpen ? null : section.key)}
                      haptic="tapLight"
                      className="min-h-recommended justify-center p-md"
                    >
                      <Text
                        className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                      >
                        {text(section.title)}
                      </Text>
                    </PressableScale>
                    {isOpen ? (
                      <Text
                        className={`px-md pb-md text-start text-md text-neutral-700 ${fontClass}`}
                      >
                        {text(section.body)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
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
                      className={`text-start text-md font-semibold text-primary-dark underline ${fontClass}`}
                    >
                      {text(attachment.label)}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            )}

            <View className="gap-sm">
              <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
                {t('authorizationHealthTitle')}
              </Text>
              <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                {t('authorizationHealthQuestion')}
              </Text>
              <View className="flex-row flex-wrap gap-sm">
                <OptionChip
                  testID="authorization-health-no"
                  label={t('authorizationHealthNo')}
                  accessibilityHint={t('authorizationHealthQuestion')}
                  isSelected={hasHealthNotes === false}
                  onPress={() => setHasHealthNotes(false)}
                />
                <OptionChip
                  testID="authorization-health-yes"
                  label={t('authorizationHealthYes')}
                  accessibilityHint={t('authorizationHealthQuestion')}
                  isSelected={hasHealthNotes === true}
                  onPress={() => setHasHealthNotes(true)}
                />
              </View>
              {hasHealthNotes === true ? (
                <AuthTextField
                  testID="authorization-health-notes"
                  label={t('authorizationHealthLabel')}
                  value={healthNotes}
                  onChangeText={setHealthNotes}
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

            <View className="gap-sm">
              <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
                {t('authorizationConsentsTitle')}
              </Text>
              {AUTHORIZATION_CONSENTS.map((consent) => (
                <ConsentRow
                  key={consent.key}
                  testID={`authorization-consent-${consent.key}`}
                  label={text(content.consents[consent.key].label)}
                  required={consent.required}
                  requiredMark={t('authorizationRequiredMark')}
                  checked={consents[consent.key] === true}
                  onToggle={() =>
                    setConsents((value) => ({
                      ...value,
                      [consent.key]: value[consent.key] !== true,
                    }))
                  }
                />
              ))}
              {problemText('consents', 'authorizationErrorConsents')}
            </View>

            <View className="gap-sm">
              <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
                {t('authorizationSignatureTitle')}
              </Text>
              {unableToDraw ? null : (
                <>
                  <SignaturePad
                    strokes={strokes}
                    onChange={setStrokes}
                    onDrawingChange={setIsDrawing}
                    prompt={t('authorizationSignaturePrompt')}
                    promptClassName={fontClass}
                    accessibilityLabel={t('authorizationSignatureLabel')}
                  />
                  {strokes === null ? null : (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={t('authorizationClearSignature')}
                      onPress={() => setStrokes(null)}
                      haptic="tapLight"
                      className="min-h-recommended justify-center self-start"
                    >
                      <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                        {t('authorizationClearSignature')}
                      </Text>
                    </PressableScale>
                  )}
                </>
              )}
              <ConsentRow
                testID="authorization-cannot-draw"
                label={t('authorizationCannotDraw')}
                required={false}
                requiredMark=""
                checked={unableToDraw}
                onToggle={() => setUnableToDraw((value) => !value)}
              />
              {unableToDraw ? (
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('authorizationCannotDrawHint')}
                </Text>
              ) : null}
              {problemText('signature', 'authorizationErrorSignature')}
            </View>

            {hasFailed ? (
              <Text
                accessibilityLiveRegion="polite"
                className={`text-start text-md text-error ${fontClass}`}
              >
                {t('authorizationSignFailed')}
              </Text>
            ) : null}
            <PressableScale
              testID="authorization-sign"
              accessibilityRole="button"
              accessibilityLabel={t('authorizationSignAction')}
              onPress={submit}
              isBusy={isBusy}
              isDisabled={isBusy}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {t('authorizationSignAction')}
              </Text>
            </PressableScale>
          </PageWidth>
        </ScrollView>
      </SafeAreaView>
    </ScreenLanguageContext.Provider>
  );
}

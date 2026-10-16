/**
 * Ramassà's participation authorization for the season (RAPP-304).
 *
 * A player without a valid authorization sees only this screen. She reads the
 * text staff published (each section opens), ticks each consent, gives the
 * medical answer, optionally an emergency contact, and draws her signature with
 * her finger. A player who cannot draw (a screen reader, a motor impairment)
 * signs with the ticks alone, and the record says so.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { ConsentRow } from '@/components/authorization/consent-row';
import { ReregistrationSteps } from '@/components/authorization/reregistration-steps';
import { SignaturePad } from '@/components/equipment/signature-pad';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { useAuthorizationStatus, useSignAuthorization } from '@/lib/authorization';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AUTHORIZATION_CONSENTS,
  authorizationSigningSchema,
  type AuthorizationConsentKey,
  type AuthorizationText,
} from '@ramassa/shared/authorization';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { resolveLocalizedText } from '@ramassa/shared/i18n/localized-content';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

type Problem = 'consents' | 'health' | 'signature';

export default function AuthorizationScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const router = useRouter();
  const language = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const status = useAuthorizationStatus(true);
  const sign = useSignAuthorization();

  const [openSection, setOpenSection] = useState<string | null>(null);
  const [consents, setConsents] = useState<Partial<Record<AuthorizationConsentKey, boolean>>>({});
  const [hasHealthNotes, setHasHealthNotes] = useState<boolean | null>(null);
  const [healthNotes, setHealthNotes] = useState('');
  const [contact, setContact] = useState({ name: '', relation: '', phone: '' });
  const [strokes, setStrokes] = useState<SignatureStrokes | null>(null);
  const [unableToDraw, setUnableToDraw] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [problems, setProblems] = useState<ReadonlySet<Problem>>(new Set());
  const [hasFailed, setHasFailed] = useState(false);
  // A returning player checks her details and answers the season questions
  // first (RAPP-306); a new player signs straight away.
  const [hasReregistered, setHasReregistered] = useState(false);

  const text = (value: AuthorizationText) => resolveLocalizedText(value, language)?.text ?? '';

  if (status.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50">
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  const current = status.data;
  if (status.isError || current === null || current === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-neutral-50 p-lg">
        <Text className={`text-center text-md text-neutral-700 ${fontClass}`}>
          {t('authorizationLoadFailed')}
        </Text>
      </SafeAreaView>
    );
  }
  const content = current.content;
  if (current.isReturning && !hasReregistered) {
    return (
      <ReregistrationSteps
        seasonName={current.seasonName}
        onDone={() => setHasReregistered(true)}
      />
    );
  }

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
    setHasFailed(false);
    sign.mutate(
      {
        versionId: current.versionId,
        signing: parsed.data,
        language,
        device: `${Platform.OS} ${String(Platform.Version)}`,
      },
      {
        onSuccess: () => {
          playHaptic('success');
          router.replace('/' as Href);
        },
        onError: () => {
          playHaptic('error');
          setHasFailed(true);
        },
      },
    );
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

  return (
    <SafeAreaView
      testID="authorization-screen"
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
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {text(content.title)}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('authorizationIntro', { season: current.seasonName })}
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
                  setConsents((value) => ({ ...value, [consent.key]: value[consent.key] !== true }))
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
            isBusy={sign.isPending}
            isDisabled={sign.isPending}
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
  );
}

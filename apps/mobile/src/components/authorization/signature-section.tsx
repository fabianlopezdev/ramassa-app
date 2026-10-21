import { ConsentRow } from '@/components/authorization/consent-row';
import { SignaturePad } from '@/components/equipment/signature-pad';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import type { SupportedLanguage } from '@ramassa/shared/i18n';

/** Same signing interaction for app terms and the separate season authorization. */
export function SignatureSection({
  strokes,
  onChange,
  unableToDraw,
  onUnableToDrawChange,
  onDrawingChange,
  hasError = false,
  language,
  testID = 'authorization-cannot-draw',
}: {
  readonly strokes: SignatureStrokes | null;
  readonly onChange: (strokes: SignatureStrokes | null) => void;
  readonly unableToDraw: boolean;
  readonly onUnableToDrawChange: (value: boolean) => void;
  readonly onDrawingChange: (value: boolean) => void;
  readonly hasError?: boolean;
  readonly testID?: string;
  readonly language?: SupportedLanguage;
}) {
  const { t: translate, i18n } = useTranslation('onboarding');
  const t = language === undefined ? translate : i18n.getFixedT(language, 'onboarding');
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
        {t('authorizationSignatureTitle')}
      </Text>
      {unableToDraw ? null : (
        <>
          <SignaturePad
            strokes={strokes}
            onChange={onChange}
            onDrawingChange={onDrawingChange}
            prompt={t('authorizationSignaturePrompt')}
            promptClassName={fontClass}
            accessibilityLabel={t('authorizationSignatureLabel')}
            accessibilityHint={t('authorizationSignatureHint')}
          />
          {strokes === null ? null : (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={t('authorizationClearSignature')}
              onPress={() => onChange(null)}
              haptic="tapLight"
              className="min-h-recommended justify-center self-start"
            >
              <Text className={`text-form font-semibold text-primary-dark ${fontClass}`}>
                {t('authorizationClearSignature')}
              </Text>
            </PressableScale>
          )}
        </>
      )}
      <ConsentRow
        testID={testID}
        label={t('authorizationCannotDraw')}
        required={false}
        requiredMark=""
        checked={unableToDraw}
        onToggle={() => onUnableToDrawChange(!unableToDraw)}
      />
      {unableToDraw ? (
        <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
          {t('authorizationCannotDrawHint')}
        </Text>
      ) : null}
      {hasError ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-error ${fontClass}`}
        >
          {t('authorizationErrorSignature')}
        </Text>
      ) : null}
    </View>
  );
}

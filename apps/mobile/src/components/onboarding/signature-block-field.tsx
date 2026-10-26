/**
 * A signature block of her Onboarding (RAPP-690): the text staff ask her to
 * accept, in her language, and the authorization pad under it. A signature is
 * no question of the Fitxa: the strokes stay in her draft and travel with her
 * registration, where the database keeps the text as she read it. Every block
 * is required where it sits.
 */

import { SignaturePad } from '@/components/equipment/signature-pad';
import { PressableScale } from '@/components/motion/pressable-scale';
import { FieldErrorText } from '@/components/onboarding/field-error-text';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { SignatureStrokes } from '@ramassa/shared/equipment';
import { useLanguage } from '@ramassa/shared/i18n';
import { formBlockText, type FormBlock } from '@ramassa/shared/intake-builder';

export function SignatureBlockField({
  block,
  strokes,
  onChange,
  onDrawingChange,
  errorMessage,
}: {
  readonly block: FormBlock;
  readonly strokes: SignatureStrokes | null;
  readonly onChange: (strokes: SignatureStrokes | null) => void;
  /** The screen stops scrolling while she draws. */
  readonly onDrawingChange?: (isDrawing: boolean) => void;
  readonly errorMessage?: string;
}) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  const testID = `signature-block-${block.id}`;
  return (
    <View className="gap-sm" testID={testID}>
      <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
        {formBlockText(block, language).text}
      </Text>
      <SignaturePad
        strokes={strokes}
        onChange={onChange}
        onDrawingChange={onDrawingChange}
        prompt={t('authorizationSignaturePrompt')}
        promptClassName={fontClass}
        accessibilityLabel={t('authorizationSignatureLabel')}
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
      <FieldErrorText message={errorMessage} />
    </View>
  );
}

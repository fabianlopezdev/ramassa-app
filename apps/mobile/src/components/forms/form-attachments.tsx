/**
 * The season documents of the authorization's document screen (RAPP-304,
 * RAPP-773): each a link she opens, under one heading, in her language.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { useLanguage } from '@ramassa/shared/i18n';
import { teamTextIn } from '@ramassa/shared/i18n/localized-content';
import type { FormAttachment } from '@ramassa/shared/intake-builder';

export function FormAttachments({
  attachments,
}: {
  readonly attachments: readonly FormAttachment[];
}) {
  const { t } = useTranslation('onboarding');
  const { language } = useLanguage();
  const fontClass = useLanguageFontClass();
  if (attachments.length === 0) return null;
  return (
    <View className="gap-sm" testID="form-attachments">
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
        {t('authorizationDocumentsTitle')}
      </Text>
      {attachments.map((attachment) => {
        const label = teamTextIn(attachment.label, language, false);
        return (
          <PressableScale
            key={attachment.url}
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={() => void Linking.openURL(attachment.url)}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text
              className={`text-start text-form font-semibold text-primary-dark underline ${fontClass}`}
            >
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

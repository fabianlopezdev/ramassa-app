import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { CompressedNativeStoryImage } from '@/lib/native-image-compression-core';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const photoStyle = {
  width: tokens.tapTarget.recommended * 2,
  height: tokens.tapTarget.recommended * 2,
} as const;

export const StoryImagePreview = memo(function StoryImagePreview({
  image,
  number,
  title,
  onRemove,
}: {
  readonly image: CompressedNativeStoryImage;
  readonly number: number;
  readonly title: string;
  readonly onRemove: (uri: string) => void;
}) {
  const { t } = useTranslation('knowledge');
  const languageFontClass = useLanguageFontClass();
  const source = useMemo(() => ({ uri: image.uri }), [image.uri]);
  const remove = useCallback(() => onRemove(image.uri), [image.uri, onRemove]);

  return (
    <View className="gap-xs">
      <Image
        accessibilityLabel={t('knowledge:storyPhoto', {
          number,
          title: title || t('knowledge:submissionTitle'),
        })}
        source={source}
        contentFit="cover"
        style={photoStyle}
      />
      <PressableScale
        accessibilityLabel={t('knowledge:removePhoto', { number })}
        onPress={remove}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-min items-center justify-center rounded-md border border-neutral-300 px-sm"
      >
        <Text className={`text-xs text-neutral-700 ${languageFontClass}`}>
          {t('knowledge:imageRemove')}
        </Text>
      </PressableScale>
    </View>
  );
});

import { RaisedActionButton } from '@/components/forms/raised-action-button';
import type { CompressedNativeStoryImage } from '@/lib/native-image-compression-core';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
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
      <RaisedActionButton
        size="compact"
        label={t('knowledge:imageRemove')}
        accessibilityLabel={t('knowledge:removePhoto', { number })}
        onPress={remove}
      />
    </View>
  );
});

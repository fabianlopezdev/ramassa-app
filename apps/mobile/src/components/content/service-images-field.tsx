/**
 * A service's photos on the phone (RAPP-344): up to twelve, in the order
 * players see them, each with a description in Catalan and its translation
 * review, Move up and Move down, and Remove. A chosen photo is uploaded when
 * the service is saved.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import type { PickedPhoto } from '@/lib/content-upload';
import { continuousCorners } from '@/lib/continuous-corners';
import { MAX_SERVICE_IMAGES, type FormImage } from '@/lib/service-draft';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { TranslationReview } from '@ramassa/shared/translation';
import { MultilingualField } from './multilingual-field';

const MAX_SERVICE_IMAGE_ALT_LENGTH = 500;

export interface ImageReviewHandlers {
  readonly onEdit: (key: string, language: SupportedLanguage, text: string) => void;
  readonly onApprove: (key: string, language: SupportedLanguage) => void;
  readonly onReject: (key: string, language: SupportedLanguage) => void;
  readonly onApproveAll: (key: string) => void;
}

function Action({
  testID,
  label,
  onPress,
  isDisabled = false,
  isDestructive = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
  readonly isDestructive?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={isDisabled}
      haptic="tapLight"
      className="min-h-recommended justify-center px-xs"
    >
      <Text
        className={`font-semibold ${
          isDisabled ? 'text-neutral-400' : isDestructive ? 'text-error' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function ServiceImagesField({
  images,
  pendingPhotos,
  reviews,
  handlers,
  onAdd,
  onPick,
  onAltChange,
  onMove,
  onRemove,
}: {
  readonly images: readonly FormImage[];
  /** Keys of images with a photo chosen and not uploaded yet. */
  readonly pendingPhotos: ReadonlySet<string>;
  readonly reviews: Readonly<Record<string, TranslationReview | undefined>>;
  readonly handlers: ImageReviewHandlers;
  readonly onAdd: () => void;
  readonly onPick: (key: string, photo: PickedPhoto) => void;
  readonly onAltChange: (key: string, alt: string) => void;
  readonly onMove: (index: number, offset: -1 | 1) => void;
  readonly onRemove: (key: string) => void;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();

  const pick = async (key: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined)
      onPick(key, { uri: asset.uri, width: asset.width, height: asset.height });
  };

  return (
    <View className="gap-sm" testID="service-images">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('fieldImage')}
      </Text>
      {images.map((image, index) => {
        const isPending = pendingPhotos.has(image.key);
        return (
          <View
            key={image.key}
            testID={`service-image-${index}`}
            style={continuousCorners}
            className="gap-sm rounded-md border border-neutral-200 bg-white px-md py-sm"
          >
            <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
              {isPending
                ? t('imageReady')
                : image.url !== null
                  ? t('imageStored')
                  : t('fieldImage')}
            </Text>
            <Action
              testID={`service-image-choose-${index}`}
              label={t('imageChoose')}
              onPress={() => void pick(image.key)}
            />
            <MultilingualField
              testIDPrefix={`service-image-alt-${index}`}
              label={t('imageAlt')}
              value={image.alt}
              onChangeText={(alt) => onAltChange(image.key, alt)}
              maxLength={MAX_SERVICE_IMAGE_ALT_LENGTH}
              review={reviews[image.key]}
              onEdit={(language, text) => handlers.onEdit(image.key, language, text)}
              onApprove={(language) => handlers.onApprove(image.key, language)}
              onReject={(language) => handlers.onReject(image.key, language)}
              onApproveAll={() => handlers.onApproveAll(image.key)}
            />
            <View className="flex-row flex-wrap gap-sm">
              <Action
                testID={`service-image-up-${index}`}
                label={t('imageMoveUp')}
                onPress={() => onMove(index, -1)}
                isDisabled={index === 0}
              />
              <Action
                testID={`service-image-down-${index}`}
                label={t('imageMoveDown')}
                onPress={() => onMove(index, 1)}
                isDisabled={index === images.length - 1}
              />
              <Action
                testID={`service-image-remove-${index}`}
                label={t('imageRemove')}
                onPress={() => onRemove(image.key)}
                isDestructive
              />
            </View>
          </View>
        );
      })}
      {images.length < MAX_SERVICE_IMAGES ? (
        <Action testID="service-image-add" label={t('imageAdd')} onPress={onAdd} />
      ) : null}
    </View>
  );
}

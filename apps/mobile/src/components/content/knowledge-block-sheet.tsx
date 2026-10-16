/**
 * One source block of a knowledge resource, edited on its own in a sheet
 * (RAPP-343): the design's "one block at a time". A paragraph has its text; a
 * step has a title, instructions, an optional photo and the photo's
 * description. Done hands the block back to the editor; Cancel leaves it as it
 * was. A chosen photo is uploaded when the resource is saved.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PressableScale } from '@/components/motion/pressable-scale';
import type { PickedPhoto } from '@/lib/content-upload';
import { continuousCorners } from '@/lib/continuous-corners';
import type { FormBlock } from '@/lib/knowledge-draft';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLanguageDirection, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH,
  MAX_KNOWLEDGE_IMAGE_ALT_LENGTH,
  MAX_KNOWLEDGE_STEP_TITLE_LENGTH,
} from '@ramassa/shared/knowledge';

const rtlStyle = { writingDirection: 'rtl', textAlign: 'right' } as const;
const ltrStyle = { writingDirection: 'ltr', textAlign: 'left' } as const;

/** What a step's photo becomes: kept, newly chosen, or removed. */
export type StepPhotoChange = PickedPhoto | 'removed' | 'kept';

function BlockForm({
  block,
  language,
  hasPendingPhoto,
  onDone,
  onCancel,
}: {
  readonly block: FormBlock;
  readonly language: SupportedLanguage;
  readonly hasPendingPhoto: boolean;
  readonly onDone: (block: FormBlock, photo: StepPhotoChange) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('knowledge');
  const fontClass = useLanguageFontClass();
  const [draft, setDraft] = useState<FormBlock>(block);
  const [photo, setPhoto] = useState<StepPhotoChange>('kept');
  const direction = getLanguageDirection(language) === 'rtl' ? rtlStyle : ltrStyle;
  const hasPhoto =
    photo !== 'removed' &&
    (photo !== 'kept' || hasPendingPhoto || (draft.type === 'step' && draft.imageUrl !== null));

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  return (
    <ScrollView
      contentContainerClassName="gap-md p-lg"
      keyboardShouldPersistTaps="handled"
      // The page sheet does not move with the keyboard, so the scroll view does.
      automaticallyAdjustKeyboardInsets
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
      >
        {draft.type === 'paragraph' ? t('paragraphText') : t('blockStep')}
      </Text>
      {draft.type === 'paragraph' ? (
        <AuthTextField
          testID="knowledge-block-text"
          label={t('paragraphText')}
          value={draft.text}
          onChangeText={(text) => setDraft({ ...draft, text })}
          maxLength={MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH}
          multiline
          style={direction}
          autoFocus
        />
      ) : (
        <>
          <AuthTextField
            testID="knowledge-block-title"
            label={t('stepTitle')}
            value={draft.title}
            onChangeText={(title) => setDraft({ ...draft, title })}
            maxLength={MAX_KNOWLEDGE_STEP_TITLE_LENGTH}
            style={direction}
            autoFocus
          />
          <AuthTextField
            testID="knowledge-block-text"
            label={t('stepText')}
            value={draft.text}
            onChangeText={(text) => setDraft({ ...draft, text })}
            maxLength={MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH}
            multiline
            style={direction}
          />
          <View className="gap-xs">
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('stepImage')}
            </Text>
            {hasPhoto ? (
              <Text
                testID="knowledge-block-image-state"
                className={`text-start text-sm text-neutral-700 ${fontClass}`}
              >
                {photo !== 'kept' || hasPendingPhoto ? t('imageReady') : t('imageStored')}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-md">
              <PressableScale
                testID="knowledge-block-image-choose"
                accessibilityRole="button"
                accessibilityLabel={t('imageChoose')}
                onPress={() => void pickPhoto()}
                haptic="tapLight"
                className="min-h-recommended justify-center"
              >
                <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                  {t('imageChoose')}
                </Text>
              </PressableScale>
              {hasPhoto ? (
                <PressableScale
                  testID="knowledge-block-image-remove"
                  accessibilityRole="button"
                  accessibilityLabel={t('imageRemove')}
                  onPress={() => {
                    setPhoto('removed');
                    setDraft({ ...draft, imageUrl: null, imageAlt: '' });
                  }}
                  haptic="tapLight"
                  className="min-h-recommended justify-center"
                >
                  <Text className={`font-semibold text-error ${fontClass}`}>
                    {t('imageRemove')}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          </View>
          {hasPhoto ? (
            <AuthTextField
              testID="knowledge-block-alt"
              label={t('stepImageAlt')}
              value={draft.imageAlt}
              onChangeText={(imageAlt) => setDraft({ ...draft, imageAlt })}
              maxLength={MAX_KNOWLEDGE_IMAGE_ALT_LENGTH}
              style={direction}
            />
          ) : null}
        </>
      )}
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID="knowledge-block-done"
          accessibilityRole="button"
          accessibilityLabel={t('blockDone')}
          onPress={() => onDone(draft, photo)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('blockDone')}
          </Text>
        </PressableScale>
        <PressableScale
          testID="knowledge-block-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('blockCancel')}
          onPress={onCancel}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {t('blockCancel')}
          </Text>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

export function KnowledgeBlockSheet({
  block,
  language,
  hasPendingPhoto,
  onDone,
  onCancel,
}: {
  /** The block being edited, or null when the sheet is closed. */
  readonly block: FormBlock | null;
  readonly language: SupportedLanguage;
  readonly hasPendingPhoto: boolean;
  readonly onDone: (block: FormBlock, photo: StepPhotoChange) => void;
  readonly onCancel: () => void;
}) {
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  return (
    <Modal
      visible={block !== null && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView className="flex-1 bg-white" testID="knowledge-block-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          {block === null ? null : (
            <BlockForm
              block={block}
              language={language}
              hasPendingPhoto={hasPendingPhoto}
              onDone={onDone}
              onCancel={onCancel}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * The body of a knowledge resource on the phone (RAPP-343), the native side of
 * the web admin's structured-content editor.
 *
 * The source blocks show as cards in order, with Move up, Move down, Edit and
 * Remove; Edit opens the block on its own (`knowledge-block-sheet.tsx`). The
 * design asks for dragging; Up and Down do the same with one tap each and work
 * with VoiceOver and TalkBack, as on the event categories screen.
 *
 * Once machine drafts exist, one tab per language shows whether its body is
 * approved. The open tab holds that language's blocks, in the source's order
 * and types, with their text to correct (right to left for Arabic and Farsi),
 * and an Approve button. A correction needs approving again.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { FormBlock, FormBlockType } from '@/lib/knowledge-draft';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import {
  MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH,
  MAX_KNOWLEDGE_IMAGE_ALT_LENGTH,
  MAX_KNOWLEDGE_STEP_TITLE_LENGTH,
} from '@ramassa/shared/knowledge';

const rtlStyle = { writingDirection: 'rtl', textAlign: 'right' } as const;
const ltrStyle = { writingDirection: 'ltr', textAlign: 'left' } as const;
const PREVIEW_LENGTH = 140;

function preview(block: FormBlock): string {
  const text = block.type === 'paragraph' ? block.text : `${block.title} ${block.text}`;
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed;
}

function CardAction({
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

export function KnowledgeSourceBlocks({
  blocks,
  pendingPhotos,
  onEdit,
  onMove,
  onRemove,
  onAdd,
}: {
  readonly blocks: readonly FormBlock[];
  /** Positions of steps with a photo chosen and not uploaded yet. */
  readonly pendingPhotos: ReadonlySet<number>;
  readonly onEdit: (index: number) => void;
  readonly onMove: (index: number, offset: -1 | 1) => void;
  readonly onRemove: (index: number) => void;
  readonly onAdd: (type: FormBlockType) => void;
}) {
  const { t } = useTranslation('knowledge');
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm" testID="knowledge-source-blocks">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('fieldBody')}
      </Text>
      {blocks.map((block, index) => {
        const label = block.type === 'paragraph' ? t('paragraphText') : t('blockStep');
        const hasPhoto =
          block.type === 'step' && (block.imageUrl !== null || pendingPhotos.has(index));
        return (
          <View
            // Blocks have no ids; the position is the block, as in the stored body.
            key={`${index}-${block.type}`}
            testID={`knowledge-block-${index}`}
            style={continuousCorners}
            className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
          >
            <Text className={`text-start text-sm font-semibold text-neutral-600 ${fontClass}`}>
              {`${index + 1}. ${label}`}
            </Text>
            <Text className={`text-start text-md text-neutral-900 ${fontClass}`}>
              {preview(block) || t('blockEmpty')}
            </Text>
            {hasPhoto ? (
              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {pendingPhotos.has(index) ? t('imageReady') : t('imageStored')}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-sm">
              <CardAction
                testID={`knowledge-block-${index}-up`}
                label={t('blockMoveUp')}
                onPress={() => onMove(index, -1)}
                isDisabled={index === 0}
              />
              <CardAction
                testID={`knowledge-block-${index}-down`}
                label={t('blockMoveDown')}
                onPress={() => onMove(index, 1)}
                isDisabled={index === blocks.length - 1}
              />
              <CardAction
                testID={`knowledge-block-${index}-edit`}
                label={t('blockEdit')}
                onPress={() => onEdit(index)}
              />
              {blocks.length > 1 ? (
                <CardAction
                  testID={`knowledge-block-${index}-remove`}
                  label={t('removeBlock')}
                  onPress={() => onRemove(index)}
                  isDestructive
                />
              ) : null}
            </View>
          </View>
        );
      })}
      <View className="flex-row flex-wrap gap-md">
        <CardAction
          testID="knowledge-add-paragraph"
          label={t('addParagraph')}
          onPress={() => onAdd('paragraph')}
        />
        <CardAction
          testID="knowledge-add-step"
          label={t('addStep')}
          onPress={() => onAdd('step')}
        />
      </View>
    </View>
  );
}

function TranslatedBlockFields({
  block,
  index,
  language,
  onChange,
}: {
  readonly block: FormBlock;
  readonly index: number;
  readonly language: SupportedLanguage;
  readonly onChange: (block: FormBlock) => void;
}) {
  const { t } = useTranslation('knowledge');
  const direction = getLanguageDirection(language) === 'rtl' ? rtlStyle : ltrStyle;
  const prefix = `knowledge-body-${language}-${index}`;
  if (block.type === 'paragraph') {
    return (
      <AuthTextField
        testID={`${prefix}-text`}
        label={`${index + 1}. ${t('paragraphText')}`}
        value={block.text}
        onChangeText={(text) => onChange({ ...block, text })}
        maxLength={MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH}
        multiline
        style={direction}
      />
    );
  }
  return (
    <View className="gap-sm">
      <AuthTextField
        testID={`${prefix}-title`}
        label={`${index + 1}. ${t('stepTitle')}`}
        value={block.title}
        onChangeText={(title) => onChange({ ...block, title })}
        maxLength={MAX_KNOWLEDGE_STEP_TITLE_LENGTH}
        style={direction}
      />
      <AuthTextField
        testID={`${prefix}-text`}
        label={t('stepText')}
        value={block.text}
        onChangeText={(text) => onChange({ ...block, text })}
        maxLength={MAX_KNOWLEDGE_BLOCK_TEXT_LENGTH}
        multiline
        style={direction}
      />
      {block.imageUrl !== null || block.imageAlt.length > 0 ? (
        <AuthTextField
          testID={`${prefix}-alt`}
          label={t('stepImageAlt')}
          value={block.imageAlt}
          onChangeText={(imageAlt) => onChange({ ...block, imageAlt })}
          maxLength={MAX_KNOWLEDGE_IMAGE_ALT_LENGTH}
          style={direction}
        />
      ) : null}
    </View>
  );
}

export function KnowledgeTranslatedBodies({
  body,
  languages,
  approvedLanguages,
  onChange,
  onApprove,
}: {
  readonly body: Partial<Record<SupportedLanguage, readonly FormBlock[]>>;
  /** The target languages, in order. */
  readonly languages: readonly SupportedLanguage[];
  readonly approvedLanguages: readonly SupportedLanguage[];
  readonly onChange: (language: SupportedLanguage, blocks: readonly FormBlock[]) => void;
  readonly onApprove: (language: SupportedLanguage) => void;
}) {
  const { t } = useTranslation('knowledge');
  const fontClass = useLanguageFontClass();
  const present = languages.filter((language) => body[language] !== undefined);
  const [openLanguage, setOpenLanguage] = useState<SupportedLanguage | null>(null);
  const open = present.find((language) => language === openLanguage) ?? present[0];
  if (open === undefined) return null;
  const blocks = body[open] ?? [];
  const isApproved = approvedLanguages.includes(open);

  return (
    <View
      testID="knowledge-translated-bodies"
      style={continuousCorners}
      className="gap-sm rounded-md border border-neutral-200 bg-neutral-50 p-md"
    >
      {/* One row that scrolls sideways: four tabs side by side fit no phone. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {present.map((language) => (
            <ChoiceOption
              key={language}
              testID={`knowledge-body-tab-${language}`}
              value={language}
              label={`${language.toUpperCase()} · ${t(
                approvedLanguages.includes(language) ? 'reviewStatusApproved' : 'reviewStatusDraft',
              )}`}
              selected={language === open}
              onSelect={setOpenLanguage}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      <Text className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}>
        {t('translationBody', { language: LANGUAGE_NATIVE_NAMES[open] })}
      </Text>
      {blocks.map((block, index) => (
        <TranslatedBlockFields
          key={`${open}-${index}`}
          block={block}
          index={index}
          language={open}
          onChange={(next) =>
            onChange(
              open,
              blocks.map((current, position) => (position === index ? next : current)),
            )
          }
        />
      ))}
      {isApproved ? (
        <Text
          testID={`knowledge-body-approved-${open}`}
          className={`text-start text-sm font-semibold text-success ${fontClass}`}
        >
          {t('bodyApproved')}
        </Text>
      ) : (
        <PressableScale
          testID={`knowledge-body-approve-${open}`}
          accessibilityRole="button"
          accessibilityLabel={t('approveBody', { language: LANGUAGE_NATIVE_NAMES[open] })}
          onPress={() => onApprove(open)}
          haptic="selection"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('approveBody', { language: LANGUAGE_NATIVE_NAMES[open] })}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

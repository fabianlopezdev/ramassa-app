/**
 * A signature block of a form (RAPP-690): the text staff ask her to accept,
 * in her language, and under it the signing every form uses
 * (`SignatureSection`, the season authorization's): the pad, and "No puc
 * signar" when she cannot draw (RAPP-771). A signature is no question of the
 * Fitxa: what she gave stays in her draft and travels with the form, where
 * the database keeps the text as she read it. Every block is required where
 * it sits: strokes or "No puc signar".
 */

import { SignatureSection } from '@/components/authorization/signature-section';
import { FieldErrorText } from '@/components/onboarding/field-error-text';
import { fontClassForLanguage } from '@/lib/language-font-class';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import { useLanguage, type SupportedLanguage } from '@ramassa/shared/i18n';
import { staffTextIn } from '@ramassa/shared/i18n/localized-content';
import {
  formBlockText,
  UNABLE_TO_DRAW,
  type FormSignatureDraft,
  type SignatureFormBlock,
} from '@ramassa/shared/intake-builder';

export function SignatureBlockField({
  block,
  strokes: given,
  onChange,
  onDrawingChange,
  errorMessage,
  language: shownLanguage,
  canSayUnable = true,
}: {
  readonly block: SignatureFormBlock;
  /** Her strokes, "No puc signar", or nothing yet. */
  readonly strokes: FormSignatureDraft | null;
  readonly onChange: (given: FormSignatureDraft | null) => void;
  /** The screen stops scrolling while she draws. */
  readonly onDrawingChange?: (isDrawing: boolean) => void;
  readonly errorMessage?: string;
  /** Her language when it is not the app's: the walk-in tablet (RAPP-691). */
  readonly language?: SupportedLanguage;
  /** The walk-in tablet keeps strokes only until it sends "No puc signar" too. */
  readonly canSayUnable?: boolean;
}) {
  const { language: appLanguage } = useLanguage();
  const appFontClass = useLanguageFontClass();
  const language = shownLanguage ?? appLanguage;
  const fontClass =
    shownLanguage === undefined ? appFontClass : fontClassForLanguage(shownLanguage);
  const isUnable = given === UNABLE_TO_DRAW;
  // A legal form's own signature has its texts (RAPP-773): a text left out
  // shows the app's own; a help staff cleared shows none.
  const own = (field: keyof NonNullable<SignatureFormBlock['texts']>, isOptional: boolean) =>
    staffTextIn(block.texts?.[field], language, isOptional) ?? undefined;
  return (
    <View className="gap-sm" testID={`signature-block-${block.id}`}>
      <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
        {formBlockText(block, language).text}
      </Text>
      <SignatureSection
        strokes={given === null || isUnable ? null : given}
        onChange={onChange}
        unableToDraw={isUnable}
        onUnableToDrawChange={(unable) => onChange(unable ? UNABLE_TO_DRAW : null)}
        onDrawingChange={(isDrawing) => onDrawingChange?.(isDrawing)}
        language={language}
        canSayUnable={canSayUnable}
        texts={{
          title: own('signature_title', false),
          prompt: own('signature_prompt', false),
          hint: own('signature_hint', true),
          cannotDraw: own('cannot_draw_label', false),
          cannotDrawHint: own('cannot_draw_hint', true),
        }}
        testID={`signature-block-${block.id}-cannot-draw`}
      />
      <FieldErrorText message={errorMessage} />
    </View>
  );
}

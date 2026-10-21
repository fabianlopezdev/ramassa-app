import { continuousCorners } from '@/lib/continuous-corners';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/** Shared with the language/document choices; fields omit their fill and depth layer. */
export const FIELD_SHAPE_CLASS_NAME = 'rounded-lg border';
const FIELD_CLASS_NAME = `${FIELD_SHAPE_CLASS_NAME} border-primary px-md py-sm`;
const INVALID_FIELD_CLASS_NAME = `${FIELD_SHAPE_CLASS_NAME} border-error px-md py-sm`;

/** The common surface for native text inputs and field-style picker openers. */
export function useFormFieldAppearance(hasError = false) {
  const { fontScale } = useWindowDimensions();
  const style = useMemo(
    () => ({
      ...continuousCorners,
      minHeight: tokens.formField.minHeight * Math.max(1, fontScale),
    }),
    [fontScale],
  );
  return { className: hasError ? INVALID_FIELD_CLASS_NAME : FIELD_CLASS_NAME, style };
}

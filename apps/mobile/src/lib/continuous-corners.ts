import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/**
 * The iOS "squircle": a corner that eases into the straight edge instead of
 * meeting it at a circular arc. It is what makes a rounded rectangle read as
 * native rather than as a web card, and it costs nothing.
 *
 * A `style` prop rather than a class because NativeWind has no utility for
 * `borderCurve` (contract rule 17). Hoisted here, and imported, so it is one
 * shared object: an inline `style={{ borderCurve: 'continuous' }}` would be a
 * fresh allocation on every render of every rounded surface in the app, which
 * is exactly what the perf rule forbids.
 *
 * Android and web ignore the property, so this is safe to apply unconditionally
 * to anything with a `rounded-*` class. Skip it on capsules (`rounded-full`),
 * where a continuous curve has nothing to ease into.
 */
// Keep the exported type as this exact literal. Annotating it as ViewStyle or
// TextStyle makes it incompatible with the other consumer, while intersecting
// those types makes StyleSheet.compose infer RN's broad view/text/image union.
// The literal is structurally assignable to both without widening either one.
export const continuousCorners = { borderCurve: 'continuous' } as const;

export function composeViewStyles(
  first: StyleProp<ViewStyle>,
  second: StyleProp<ViewStyle>,
): StyleProp<ViewStyle> {
  return StyleSheet.compose(first, second) as StyleProp<ViewStyle>;
}

export function composeContinuousViewStyle(style: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  return composeViewStyles(continuousCorners as ViewStyle, style);
}

export function composeContinuousTextStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  return StyleSheet.compose(continuousCorners as TextStyle, style);
}

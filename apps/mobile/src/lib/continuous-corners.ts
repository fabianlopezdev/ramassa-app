import type { ViewStyle } from 'react-native';

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
export const continuousCorners: ViewStyle = { borderCurve: 'continuous' };

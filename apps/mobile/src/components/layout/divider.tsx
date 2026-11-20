/**
 * The thin line that separates two parts of a screen (RAPP-843): the sections
 * of Inici, the day names and the days of the Activitats calendar. Its colour
 * and thickness are set here, so every line in the app changes together.
 */
import { View } from 'react-native';

/** The colour of every separating line, for a line drawn as a border of its own row. */
export const DIVIDER_COLOR_CLASS_NAME = 'border-neutral-200';

export function Divider({ className }: { readonly className?: string }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      className={`border-b ${DIVIDER_COLOR_CLASS_NAME} ${className ?? ''}`}
    />
  );
}

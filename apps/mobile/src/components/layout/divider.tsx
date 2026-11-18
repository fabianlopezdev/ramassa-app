/**
 * The thin line that separates two parts of a screen (RAPP-843): the sections
 * of Inici, the day names and the days of the Activitats calendar. Its colour
 * and thickness are set here, so every line in the app changes together.
 */
import { View } from 'react-native';

export function Divider({ className }: { readonly className?: string }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      className={`border-b border-neutral-200 ${className ?? ''}`}
    />
  );
}

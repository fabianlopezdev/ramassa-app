/**
 * Her name at the top of Les meves dades (RAPP-888): first and last name, as
 * large and bold as a tab's own title, in a box with the brand border on the
 * secondary colour.
 */
import { RAISED_SHAPE_CLASS_NAME } from '@/components/layout/raised-surface';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

export function ProfileNameBox({
  firstName,
  lastName,
}: {
  readonly firstName: string;
  readonly lastName: string | null;
}) {
  const languageFontClass = useLanguageFontClass();
  const name = [firstName, lastName ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  return (
    <View
      testID="profile-name-box"
      style={continuousCorners}
      className={`${RAISED_SHAPE_CLASS_NAME} border border-primary bg-secondary p-lg`}
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-4xl font-extrabold text-neutral-900 ${languageFontClass}`}
      >
        {name}
      </Text>
    </View>
  );
}

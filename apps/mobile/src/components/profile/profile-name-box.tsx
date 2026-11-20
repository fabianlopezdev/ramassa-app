/**
 * The top of Les meves dades (RAPP-888): a box with the brand border on the
 * secondary colour, holding her photo with its button underneath and, beside
 * them, her first and last name, large and bold.
 */
import { RAISED_SHAPE_CLASS_NAME } from '@/components/layout/raised-surface';
import { ProfilePhotoEditor } from '@/components/profile/profile-photo-editor';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';
import type { ProfileRecordWithFields } from '@ramassa/shared/schemas';

/** The smallest a long name may shrink to so a single word is never split. */
const NAME_MIN_FONT_SCALE = 0.6;
/** Lines the name may take beside the photo. */
const NAME_MAX_LINES = 3;

export function ProfileNameBox({ profile }: { readonly profile: ProfileRecordWithFields }) {
  const languageFontClass = useLanguageFontClass();
  const name = [profile.first_name, profile.last_name ?? '']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  return (
    <View
      testID="profile-name-box"
      style={continuousCorners}
      className={`${RAISED_SHAPE_CLASS_NAME} border border-primary bg-secondary p-md`}
    >
      <ProfilePhotoEditor
        profile={profile}
        beside={
          <Text
            accessibilityRole="header"
            numberOfLines={NAME_MAX_LINES}
            adjustsFontSizeToFit
            minimumFontScale={NAME_MIN_FONT_SCALE}
            className={`text-start text-3xl font-extrabold text-neutral-900 ${languageFontClass}`}
          >
            {name}
          </Text>
        }
      />
    </View>
  );
}

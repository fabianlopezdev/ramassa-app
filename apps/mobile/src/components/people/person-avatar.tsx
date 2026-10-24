/**
 * A person's small round picture (RAPP-639): her photo through the media
 * worker when there is one, her initial on the brand colour underneath, so
 * the initial shows while the photo loads or when it cannot load. One
 * component for chat, forum and articles, with one size per context.
 */
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

/** `small` beside chat bubbles and forum author lines, `medium` on an article. */
export const PERSON_AVATAR_SIZE = { small: 28, medium: 40 } as const;
export type PersonAvatarSize = keyof typeof PERSON_AVATAR_SIZE;

const styles = StyleSheet.create({
  small: {
    width: PERSON_AVATAR_SIZE.small,
    height: PERSON_AVATAR_SIZE.small,
    borderRadius: PERSON_AVATAR_SIZE.small / 2,
  },
  medium: {
    width: PERSON_AVATAR_SIZE.medium,
    height: PERSON_AVATAR_SIZE.medium,
    borderRadius: PERSON_AVATAR_SIZE.medium / 2,
  },
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primary.DEFAULT,
  },
  photo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});

/** The first letter of the name, or nothing for an empty one. */
function personInitial(name: string | null | undefined): string {
  const first = [...(name ?? '').trim()][0];
  return first === undefined ? '' : first.toLocaleUpperCase();
}

export const PersonAvatar = memo(function PersonAvatar({
  name,
  avatarKey,
  size = 'small',
  testID,
}: {
  readonly name: string | null | undefined;
  readonly avatarKey: string | null | undefined;
  readonly size?: PersonAvatarSize;
  readonly testID?: string;
}) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: avatarKey ?? null,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, avatarKey],
  );
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.circle, styles[size]]}
    >
      <Text
        className={`font-semibold text-white ${size === 'small' ? 'text-xs' : 'text-md'}`}
        allowFontScaling={false}
      >
        {personInitial(name)}
      </Text>
      {source === null ? null : (
        <Image
          source={source}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={avatarKey ?? undefined}
          transition={150}
          style={styles.photo}
        />
      )}
    </View>
  );
});

/**
 * An author line: the avatar, then the line's text, centred on one row
 * (RAPP-639). Forum posts and replies and articles use it alike.
 */
export const AuthorLine = memo(function AuthorLine({
  name,
  avatarKey,
  label,
  languageFontClass,
  size = 'small',
  textClassName = 'text-sm font-bold text-primary-dark',
}: {
  readonly name: string | null | undefined;
  readonly avatarKey: string | null | undefined;
  /** The visible text, such as "by Marc". */
  readonly label: string;
  readonly languageFontClass: string;
  readonly size?: PersonAvatarSize;
  readonly textClassName?: string;
}) {
  return (
    <View className="flex-row items-center gap-sm">
      <PersonAvatar name={name} avatarKey={avatarKey} size={size} />
      <Text className={`flex-shrink text-start ${textClassName} ${languageFontClass}`}>
        {label}
      </Text>
    </View>
  );
});

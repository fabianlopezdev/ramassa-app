/**
 * Her photo in the header of every player tab (RAPP-794, RAPP-813): the door to
 * "El meu perfil", now that the profile has left the tab bar. A person icon
 * shows while the photo loads or when she has none (RAPP-819). It has the same
 * raised edge as the cards, so it reads as something to press (RAPP-826).
 * `PlayerTabHeader` places it.
 */
import { PressableDepth } from '@/components/motion/pressable-depth';
import { PersonAvatar } from '@/components/people/person-avatar';
import { usePersonCards } from '@/lib/person-cards';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { tokens } from '@ramassa/shared/tokens';

const wrapperStyle = {
  paddingEnd: tokens.languageChoice.shadowInlineOffset,
  paddingBottom: tokens.languageChoice.shadowBlockOffset,
} as const;
const edgeStyle = {
  position: 'absolute',
  top: tokens.languageChoice.shadowBlockOffset,
  start: tokens.languageChoice.shadowInlineOffset,
  end: 0,
  bottom: 0,
} as const;

export const ProfilePhotoButton = memo(function ProfilePhotoButton() {
  const { t } = useTranslation('profile');
  const { push } = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const ids = useMemo(() => [userId], [userId]);
  const card = usePersonCards(ids).get(userId ?? '');
  const openProfile = useCallback(() => push('/profile' as Href), [push]);
  return (
    <PressableDepth
      testID="player-profile-button"
      accessibilityLabel={t('title')}
      onPress={openProfile}
      haptic="tapLight"
      className="relative"
      style={wrapperStyle}
      faceClassName="rounded-full"
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      shadow={<View pointerEvents="none" className="rounded-full bg-primary" style={edgeStyle} />}
    >
      <PersonAvatar
        name={card?.firstName}
        avatarKey={card?.avatarKey}
        size="header"
        fallback="person"
      />
    </PressableDepth>
  );
});

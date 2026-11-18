/**
 * Her photo in the header of every player tab (RAPP-794, RAPP-813): the door to
 * "El meu perfil", now that the profile has left the tab bar. A person icon
 * shows while the photo loads or when she has none (RAPP-819).
 * `PlayerTabHeader` places it.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { PersonAvatar } from '@/components/people/person-avatar';
import { usePersonCards } from '@/lib/person-cards';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

export const ProfilePhotoButton = memo(function ProfilePhotoButton() {
  const { t } = useTranslation('profile');
  const { push } = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const ids = useMemo(() => [userId], [userId]);
  const card = usePersonCards(ids).get(userId ?? '');
  const openProfile = useCallback(() => push('/profile' as Href), [push]);
  return (
    <PressableScale
      testID="player-profile-button"
      accessibilityRole="button"
      accessibilityLabel={t('title')}
      onPress={openProfile}
      haptic="tapLight"
      className="min-h-min min-w-min items-center justify-center rounded-full"
    >
      <PersonAvatar
        name={card?.firstName}
        avatarKey={card?.avatarKey}
        size="header"
        fallback="person"
      />
    </PressableScale>
  );
});

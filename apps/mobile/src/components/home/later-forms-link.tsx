/**
 * The forms she put off with "Ara no", as one quiet line at the end of the
 * forms section of Inici (RAPP-865): "Per a més tard · 2". It opens her later
 * list, where she can still answer or delete each one.
 *
 * It is on Inici because that is where she put them off and where she looks
 * for them again. It is a line and not a card, with no "Nou" and no part in
 * the Inici count, because she already chose to wait.
 */
import { FORWARD_CHEVRON } from '@/components/icons/direction';
import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export function LaterFormsLink({
  count,
  languageFontClass,
}: {
  readonly count: number;
  readonly languageFontClass: string;
}) {
  const { t } = useTranslation('home');
  const { push } = useRouter();
  const open = useCallback(() => push('/forms-later' as Href), [push]);
  if (count === 0) return null;
  return (
    <PressableScale
      testID="home-forms-later"
      accessibilityRole="link"
      accessibilityLabel={t('later.waiting', { count })}
      onPress={open}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-min flex-row items-center gap-sm self-start rounded-md px-sm"
    >
      <Icon
        name={playerNavIcons.formsLater}
        size={tokens.fontSize.xl}
        color={tokens.colors.neutral[600]}
      />
      <Text className={`text-md font-semibold text-neutral-700 ${languageFontClass}`}>
        {t('later.title')}
        {' · '}
        <Text className="tabular-nums">{count}</Text>
      </Text>
      <Icon name={FORWARD_CHEVRON} size={tokens.fontSize.md} color={tokens.colors.neutral[500]} />
    </PressableScale>
  );
}

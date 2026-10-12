/**
 * In the large-button layout (RAPP-245) each area is a screen of its own, so it
 * needs a way back to the start, at the recommended touch height. Tabs and the
 * sidebar need none.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useTeamLayout } from './team-layout-context';

export function TeamBackToHome() {
  const layout = useTeamLayout();
  const router = useRouter();
  const { t } = useTranslation('nav');
  const languageFontClass = useLanguageFontClass();
  if (layout !== 'home') return null;
  return (
    <PressableScale
      testID="team-back-to-home"
      accessibilityLabel={t('team.backToHome')}
      onPress={() => router.back()}
      haptic="tapLight"
      className="min-h-recommended self-start justify-center"
    >
      <Text className={`font-semibold text-primary-dark ${languageFontClass}`}>
        {t('team.backToHome')}
      </Text>
    </PressableScale>
  );
}

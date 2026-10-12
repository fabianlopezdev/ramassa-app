/**
 * More (RAPP-245): what is not an area of its own. Settings (language and app
 * lock) and sign-out, and Stock for whoever receives, counts or edits
 * material (RAPP-250); later phases add the dashboard, the team and the rest.
 *
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TeamMoreScreen() {
  const { t } = useTranslation('nav');
  const { t: tAuth } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const { t: tParticipants } = useTranslation('participants');
  const hasStock = teamAreas(useAccountAccess().permissions).includes('stock');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
      testID="team-more"
    >
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-md p-lg">
          <TeamBackToHome />
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('team.more')}
          </Text>
          {hasStock ? (
            <PressableScale
              testID="team-more-stock"
              accessibilityRole="button"
              accessibilityLabel={tParticipants('stock.title')}
              onPress={() => push('/stock' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
            >
              <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
                {tParticipants('stock.title')}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            testID="team-more-settings"
            accessibilityRole="button"
            accessibilityLabel={tAuth('teamSettingsTitle')}
            onPress={() => push('/app-lock' as Href)}
            haptic="selection"
            style={continuousCorners}
            className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
          >
            <Text className={`text-start text-md text-neutral-900 ${languageFontClass}`}>
              {tAuth('teamSettingsTitle')}
            </Text>
          </PressableScale>
          <PressableScale
            testID="team-more-sign-out"
            accessibilityRole="button"
            accessibilityLabel={tProfile('signOutAction')}
            onPress={() => void logout()}
            haptic="tapLight"
            className="min-h-recommended justify-center px-md"
          >
            <Text
              className={`text-start text-md font-semibold text-primary-dark ${languageFontClass}`}
            >
              {tProfile('signOutAction')}
            </Text>
          </PressableScale>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

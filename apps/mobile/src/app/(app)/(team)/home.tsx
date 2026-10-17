/**
 * The large-button start (RAPP-245) for a team member with one or two areas on
 * a phone: one button per area, then Settings and sign-out. Easier than a tab
 * bar for a coach whose whole job in the app is taking attendance.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useUnreadMessages } from '@/lib/messaging';
import { useGuardedLogout } from '@/lib/sign-out-guard';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function HomeButton({
  testID,
  label,
  detail,
  onPress,
}: {
  readonly testID: string;
  readonly label: string;
  readonly detail?: string;
  readonly onPress: () => void;
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={detail === undefined ? label : `${label}, ${detail}`}
      onPress={onPress}
      haptic="tapLight"
      style={continuousCorners}
      className="min-h-3xl justify-center gap-xs rounded-md bg-primary px-lg py-md"
    >
      <Text className={`text-start text-xl font-bold text-white ${languageFontClass}`}>
        {label}
      </Text>
      {detail === undefined ? null : (
        <Text className={`text-start text-md text-white ${languageFontClass}`}>{detail}</Text>
      )}
    </PressableScale>
  );
}

export default function TeamHomeButtonsScreen() {
  const signOut = useGuardedLogout();
  const { t } = useTranslation('nav');
  const { t: tAttendance } = useTranslation('attendance');
  const { t: tMessaging } = useTranslation('messaging');
  const { t: tAuth } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const { t: tParticipants } = useTranslation('participants');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const areas = teamAreas(useAccountAccess().permissions);
  const unread = useUnreadMessages().data ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" testID="team-home-buttons">
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-lg p-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('team.homeTitle')}
          </Text>
          {areas.includes('attendance') ? (
            <HomeButton
              testID="team-home-attendance"
              label={tAttendance('title')}
              onPress={() => push('/today' as Href)}
            />
          ) : null}
          {areas.includes('participants') ? (
            <HomeButton
              testID="team-home-participants"
              label={t('team.participants')}
              onPress={() => push('/participants' as Href)}
            />
          ) : null}
          {areas.includes('content') ? (
            <HomeButton
              testID="team-home-content"
              label={t('team.content')}
              onPress={() => push('/content' as Href)}
            />
          ) : null}
          {areas.includes('messages') ? (
            <HomeButton
              testID="team-home-messages"
              label={tMessaging('managementTitle')}
              detail={unread > 0 ? tMessaging('unread', { count: unread }) : undefined}
              onPress={() => push('/messages' as Href)}
            />
          ) : null}
          {areas.includes('stock') ? (
            <HomeButton
              testID="team-home-stock"
              label={tParticipants('stock.title')}
              onPress={() => push('/stock' as Href)}
            />
          ) : null}
          <View className="gap-sm pt-md">
            <PressableScale
              testID="team-home-settings"
              accessibilityRole="button"
              accessibilityLabel={tAuth('teamSettingsTitle')}
              onPress={() => push('/app-lock' as Href)}
              haptic="selection"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
            >
              <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
                {tAuth('teamSettingsTitle')}
              </Text>
            </PressableScale>
            <PressableScale
              testID="team-home-sign-out"
              accessibilityRole="button"
              accessibilityLabel={tProfile('signOutAction')}
              onPress={signOut}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center"
            >
              <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
                {tProfile('signOutAction')}
              </Text>
            </PressableScale>
          </View>
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}

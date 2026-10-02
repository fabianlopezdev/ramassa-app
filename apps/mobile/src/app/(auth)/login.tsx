import { AuthRouterCard } from '@/components/auth/auth-router-card';
import { AUTH_ROUTE_TARGETS } from '@/components/auth/auth-routing';
import { AuthScreen } from '@/components/auth/auth-screen';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function AuthRouterScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();

  return (
    <AuthScreen onBack={router.back}>
      <View className="gap-lg">
        <FadeSlideIn preset="onboarding" index={0} composite>
          <AuthRouterCard
            variant="brand"
            label={t('firstTimeLabel')}
            solarIcon="user-plus"
            symbol={{ ios: 'person.fill.badge.plus', android: 'person_add', web: 'person_add' }}
            onPress={() => router.push(AUTH_ROUTE_TARGETS.firstTime as Href)}
          />
        </FadeSlideIn>
        <FadeSlideIn preset="onboarding" index={1} composite>
          <AuthRouterCard
            variant="brand"
            label={t('returningLabel')}
            solarIcon="user-circle"
            symbol={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
            onPress={() => router.push(AUTH_ROUTE_TARGETS.returning as Href)}
          />
        </FadeSlideIn>
      </View>
    </AuthScreen>
  );
}

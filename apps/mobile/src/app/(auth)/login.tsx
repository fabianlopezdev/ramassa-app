import { AuthRouterCard } from '@/components/auth/auth-router-card';
import { AUTH_ROUTE_TARGETS } from '@/components/auth/auth-routing';
import { AuthScreen } from '@/components/auth/auth-screen';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function AuthRouterScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();

  return (
    <AuthScreen title={t('routerTitle')} subtitle={t('routerSubtitle')} onBack={router.back}>
      <View className="gap-md">
        <AuthRouterCard
          label={t('firstTimeLabel')}
          symbol={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
          onPress={() => router.push(AUTH_ROUTE_TARGETS.firstTime as Href)}
        />
        <AuthRouterCard
          label={t('returningLabel')}
          symbol={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
          onPress={() => router.push(AUTH_ROUTE_TARGETS.returning as Href)}
        />
      </View>
    </AuthScreen>
  );
}

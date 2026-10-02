import { AuthRouterCard } from '@/components/auth/auth-router-card';
import { AUTH_ROUTE_TARGETS } from '@/components/auth/auth-routing';
import { AuthScreen } from '@/components/auth/auth-screen';
import { SupportEmailLink } from '@/components/auth/support-email-link';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function RegistrationMethodScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();

  return (
    <AuthScreen
      title={t('registrationMethodTitle')}
      onBack={router.back}
      centerChoices
      footer={<SupportEmailLink />}
    >
      <View className="gap-lg">
        <FadeSlideIn preset="onboarding" index={0} composite>
          <AuthRouterCard
            variant="brand"
            solarIcon="letter"
            label={t('registeredByEmailLabel')}
            subline={t('registeredByEmailSubline')}
            symbol={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
            onPress={() => router.push(AUTH_ROUTE_TARGETS.registeredByEmail as Href)}
          />
        </FadeSlideIn>
        <FadeSlideIn preset="onboarding" index={1} composite>
          <AuthRouterCard
            variant="brand"
            solarIcon="key"
            label={t('registeredByCodeLabel')}
            subline={t('registeredByCodeSubline')}
            symbol={{ ios: 'key.fill', android: 'key', web: 'key' }}
            onPress={() => router.push(AUTH_ROUTE_TARGETS.registeredByCode as Href)}
          />
        </FadeSlideIn>
      </View>
    </AuthScreen>
  );
}

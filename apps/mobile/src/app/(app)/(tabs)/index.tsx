import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  const { t } = useTranslation(['home', 'common']);
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      {/* Radius and color come from shared tokens (ADR-015): bg-primary and
          rounded-lg resolve to packages/shared/tokens via the NativeWind config. */}
      <View className="rounded-lg bg-primary px-lg py-md">
        <Text className="text-2xl font-bold text-white">{t('common:appName')}</Text>
      </View>
      <Text className={`mt-2 text-xl text-neutral-900 ${languageFontClass}`}>
        {t('home:title')}
      </Text>
      <Text className={`mt-2 text-base text-neutral-500 ${languageFontClass}`}>
        {t('home:subtitle')}
      </Text>
    </View>
  );
}

import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className={`text-lg font-semibold text-neutral-900 ${languageFontClass}`}>
        {t('auth:loginTitle')}
      </Text>
    </View>
  );
}

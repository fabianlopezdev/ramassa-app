import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

type AuthScreenProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly children: ReactNode;
};

export function AuthScreen({ title, subtitle, onBack, children }: AuthScreenProps) {
  const { t } = useTranslation('common');
  const languageFontClass = useLanguageFontClass();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="grow justify-center p-lg"
          keyboardShouldPersistTaps="handled"
        >
          <FormWidth className="gap-xl">
            <View className="gap-md">
              {onBack ? (
                <PressableScale
                  accessibilityLabel={t('back')}
                  accessibilityRole="button"
                  onPress={onBack}
                  haptic="selection"
                  className="min-h-min min-w-min self-start items-center justify-center"
                >
                  <SymbolView
                    name={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_left' }}
                    size={24}
                    tintColor={tokens.colors.primary.dark}
                  />
                </PressableScale>
              ) : null}
              <View className="gap-xs">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
            {children}
          </FormWidth>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

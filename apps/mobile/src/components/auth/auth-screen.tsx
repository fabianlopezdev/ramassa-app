import { AuthBackButton } from '@/components/auth/auth-back-button';
import { FormWidth } from '@/components/layout/content-width';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthScreenProps = {
  readonly title?: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly children: ReactNode;
};

export function AuthScreen({ title, subtitle, onBack, children }: AuthScreenProps) {
  const languageFontClass = useLanguageFontClass();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom', 'left', 'right']}>
      {onBack ? (
        <View testID="auth-navigation" className="px-lg pt-sm pb-sm">
          <AuthBackButton onPress={onBack} />
        </View>
      ) : null}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="auth-scroll-content"
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerClassName="grow justify-center p-lg"
          keyboardShouldPersistTaps="handled"
        >
          <FormWidth className="gap-xl">
            {title || subtitle ? (
              <View className="gap-xs">
                {title ? (
                  <Text
                    accessibilityRole="header"
                    className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
                  >
                    {title}
                  </Text>
                ) : null}
                {subtitle ? (
                  <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {children}
          </FormWidth>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

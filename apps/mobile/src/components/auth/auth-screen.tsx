import { AuthBackButton } from '@/components/auth/auth-back-button';
import { AuthTitle } from '@/components/auth/auth-title';
import { FormScreen } from '@/components/layout/form-screen';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

type AuthScreenProps = {
  readonly title?: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly children: ReactNode;
  readonly bottomAction: ReactNode;
};

export function AuthScreen({ title, subtitle, onBack, children, bottomAction }: AuthScreenProps) {
  const [titleHeight, setTitleHeight] = useState(0);
  return (
    <FormScreen
      headingAnchor={{ height: titleHeight }}
      navigation={
        onBack ? (
          <View testID="auth-navigation" className="px-lg pt-sm pb-sm">
            <AuthBackButton onPress={onBack} />
          </View>
        ) : null
      }
      heading={
        title || subtitle ? (
          <AuthTitle
            title={title}
            subtitle={subtitle}
            onTitleLayout={({ nativeEvent }) => setTitleHeight(nativeEvent.layout.height)}
          />
        ) : null
      }
      bottomAction={bottomAction}
    >
      {children}
    </FormScreen>
  );
}

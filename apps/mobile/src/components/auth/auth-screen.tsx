import { AuthActionFooter } from '@/components/auth/auth-action-footer';
import { AuthBackButton } from '@/components/auth/auth-back-button';
import { AuthTitle } from '@/components/auth/auth-title';
import { FormWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { BlurTargetView } from 'expo-blur';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const viewportStyle = { flex: 1, overflow: 'hidden' } as const;
// NativeWind's remapped flex class overrides the height behavior's flex: 0.
// A native style lets KeyboardAvoidingView shrink its container on Android.
const keyboardContainerStyle = { flex: 1 } as const;

type AuthScreenProps = {
  readonly title?: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  readonly children: ReactNode;
  readonly bottomAction: ReactNode;
};

export function AuthScreen({ title, subtitle, onBack, children, bottomAction }: AuthScreenProps) {
  const [titleHeight, setTitleHeight] = useState(0);
  const [actionHeight, setActionHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const blurTarget = useRef<View | null>(null);
  const { fontScale } = useWindowDimensions();
  const estimatedActionHeight =
    tokens.tapTarget.recommended * Math.max(1, fontScale) + tokens.spacing.md + tokens.spacing.lg;
  const formContentStyle = useMemo(
    () => ({
      // Anchor the title above a centred block, so each login step keeps its
      // title in one place. When space is limited, start at the normal inset
      // and let the form scroll.
      paddingTop: Math.max(
        tokens.spacing.lg,
        viewportHeight / 2 -
          tokens.authForm.titleAnchorBlockHeight / 2 -
          tokens.spacing.xl -
          titleHeight,
      ),
      paddingBottom: Math.max(actionHeight, estimatedActionHeight) + tokens.spacing.lg,
    }),
    [viewportHeight, titleHeight, actionHeight, estimatedActionHeight],
  );
  const heading =
    title || subtitle ? (
      <AuthTitle
        title={title}
        subtitle={subtitle}
        onTitleLayout={({ nativeEvent }) => setTitleHeight(nativeEvent.layout.height)}
      />
    ) : null;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom', 'left', 'right']}>
      {onBack ? (
        <View testID="auth-navigation" className="px-lg pt-sm pb-sm">
          <AuthBackButton onPress={onBack} />
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={keyboardContainerStyle}
        behavior={
          process.env.EXPO_OS === 'ios'
            ? 'padding'
            : process.env.EXPO_OS === 'android'
              ? 'height'
              : undefined
        }
      >
        <View className="flex-1">
          <BlurTargetView
            ref={blurTarget}
            style={viewportStyle}
            onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
          >
            {/* The SafeAreaView above already applies every inset, so the scroll
                view adds none of its own. */}
            <ScrollView
              testID="auth-scroll-content"
              contentInsetAdjustmentBehavior="never"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="grow px-lg"
              contentContainerStyle={formContentStyle}
              onContentSizeChange={(_width, height) => setContentHeight(height)}
              keyboardShouldPersistTaps="handled"
            >
              <FormWidth className="gap-xl">
                <FadeSlideIn preset="onboarding" index={0} composite>
                  {heading}
                </FadeSlideIn>
                <FadeSlideIn preset="onboarding" index={1} composite>
                  {children}
                </FadeSlideIn>
              </FormWidth>
            </ScrollView>
          </BlurTargetView>
          <AuthActionFooter
            blurTarget={blurTarget}
            blurred={viewportHeight > 0 && Math.round(contentHeight) > Math.round(viewportHeight)}
            includeBottomInset={false}
            onLayout={({ nativeEvent }) => setActionHeight(nativeEvent.layout.height)}
          >
            <FadeSlideIn preset="onboarding" index={2} composite>
              {bottomAction}
            </FadeSlideIn>
          </AuthActionFooter>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

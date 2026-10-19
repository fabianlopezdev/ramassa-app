import { AuthActionFooter } from '@/components/auth/auth-action-footer';
import { FormWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { BlurTargetView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const viewportStyle = { flex: 1, overflow: 'hidden' } as const;
// NativeWind's remapped flex class overrides the height behavior's flex: 0.
// A native style lets KeyboardAvoidingView shrink its container on Android.
const keyboardContainerStyle = { flex: 1 } as const;

type FormScreenProps = {
  readonly entrance?: 'staggered' | 'none';
  readonly navigation?: ReactNode;
  readonly heading: ReactNode;
  readonly children: ReactNode;
  readonly bottomAction: ReactNode;
  /** Login anchors its heading near the middle; longer wizard forms start at the top. */
  readonly headingAnchor?: { readonly height: number };
};

/** Shared safe area, keyboard handling, scroll clearance and entrance motion for onboarding forms. */
export function FormScreen({
  navigation,
  heading,
  children,
  bottomAction,
  headingAnchor,
  entrance = 'staggered',
}: FormScreenProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(
      process.env.EXPO_OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      process.env.EXPO_OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [actionHeight, setActionHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const blurTarget = useRef<View | null>(null);
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = keyboardVisible ? 0 : insets.bottom;
  const estimatedActionHeight =
    tokens.tapTarget.recommended * Math.max(1, fontScale) +
    tokens.spacing.md +
    tokens.spacing.lg +
    bottomInset;
  const headingHeight = headingAnchor?.height;
  const formContentStyle = useMemo(
    () => ({
      // Anchor the title above a centred block, so each login step keeps its
      // title in one place. When space is limited, start at the normal inset
      // and let the form scroll.
      paddingTop:
        headingHeight === undefined
          ? tokens.spacing.lg
          : Math.max(
              tokens.spacing.lg,
              (viewportHeight - bottomInset) / 2 -
                tokens.authForm.titleAnchorBlockHeight / 2 -
                tokens.spacing.xl -
                headingHeight,
            ),
      paddingBottom: Math.max(actionHeight, estimatedActionHeight) + tokens.spacing.lg,
    }),
    [viewportHeight, headingHeight, actionHeight, estimatedActionHeight, bottomInset],
  );
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      {navigation}
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
            {/* The footer owns the bottom inset so its blur and the scrolling
                content extend behind the home indicator without a white strip. */}
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
                <FormEntrance entrance={entrance} index={0}>
                  {heading}
                </FormEntrance>
                <FormEntrance entrance={entrance} index={1}>
                  {children}
                </FormEntrance>
              </FormWidth>
            </ScrollView>
          </BlurTargetView>
          <AuthActionFooter
            includeBottomInset={!keyboardVisible}
            blurTarget={blurTarget}
            blurred={viewportHeight > 0 && Math.round(contentHeight) > Math.round(viewportHeight)}
            onLayout={({ nativeEvent }) => setActionHeight(nativeEvent.layout.height)}
          >
            <FormEntrance entrance={entrance} index={2}>
              {bottomAction}
            </FormEntrance>
          </AuthActionFooter>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormEntrance({
  entrance,
  index,
  children,
}: {
  readonly entrance: 'staggered' | 'none';
  readonly index: number;
  readonly children: ReactNode;
}) {
  if (entrance === 'none') return <View>{children}</View>;
  return (
    <FadeSlideIn preset="onboarding" index={index} composite>
      {children}
    </FadeSlideIn>
  );
}

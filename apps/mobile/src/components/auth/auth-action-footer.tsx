import { FormWidth } from '@/components/layout/content-width';
import { BlurView } from 'expo-blur';
import { useMemo, type ReactNode, type RefObject } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const blurStyle = { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 } as const;

/** Same bottom action surface on language selection and every login form. */
export function AuthActionFooter({
  children,
  blurTarget,
  blurred,
  onLayout,
  includeBottomInset = true,
  testID = 'auth-action-footer',
}: {
  readonly children: ReactNode;
  readonly blurTarget: RefObject<View | null>;
  readonly blurred: boolean;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly includeBottomInset?: boolean;
  readonly testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const style = useMemo(
    () => ({ paddingBottom: tokens.spacing.lg + (includeBottomInset ? insets.bottom : 0) }),
    [includeBottomInset, insets.bottom],
  );
  return (
    <View
      testID={testID}
      className="absolute bottom-0 start-0 end-0 overflow-hidden px-lg pt-md"
      style={style}
      onLayout={onLayout}
    >
      {blurred ? (
        <BlurView
          pointerEvents="none"
          style={blurStyle}
          tint="light"
          intensity={tokens.onboarding.footerBlurIntensity}
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
        />
      ) : null}
      <FormWidth>{children}</FormWidth>
    </View>
  );
}

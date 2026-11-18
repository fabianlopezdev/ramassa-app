import {
  outlinedSurfaceClassName,
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { useMemo, type ReactNode } from 'react';
import {
  useWindowDimensions,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const FACE_CLASS = `relative overflow-hidden ${outlinedSurfaceClassName()} px-lg`;

interface SelectionChoiceSurfaceProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly accessibilityLanguage?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly testID?: string;
  readonly isSelected?: boolean;
  readonly onPress: () => void;
  readonly className?: string;
  readonly contentClassName: string;
  readonly rowStyle?: StyleProp<ViewStyle>;
}

/** One raised picker surface for full-width cards and compact option buttons. */
export function SelectionChoiceSurface({
  children,
  label,
  accessibilityHint,
  accessibilityLanguage,
  accessibilityRole = 'button',
  testID,
  isSelected,
  onPress,
  className,
  contentClassName,
  rowStyle,
}: SelectionChoiceSurfaceProps) {
  const { fontScale } = useWindowDimensions();
  const defaultRowStyle = useMemo(
    () => ({
      ...continuousCorners,
      minHeight:
        tokens.formField.minHeight * Math.max(1, fontScale) -
        tokens.languageChoice.shadowBlockOffset,
    }),
    [fontScale],
  );
  return (
    <PressableDepth
      testID={testID}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityLanguage={accessibilityLanguage}
      accessibilityRole={accessibilityRole}
      isSelected={isSelected}
      onPress={onPress}
      haptic="selection"
      style={raisedSurfaceWrapperStyle}
      className={`relative ${className ?? ''}`}
      faceStyle={rowStyle ?? defaultRowStyle}
      faceClassName={`${FACE_CLASS} ${contentClassName}`}
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      shadow={<RaisedSurfaceEdge />}
    >
      <SelectionTransition
        active={isSelected === true}
        duration="base"
        className="absolute inset-0 bg-secondary"
        style={continuousCorners}
      />
      {children}
    </PressableDepth>
  );
}

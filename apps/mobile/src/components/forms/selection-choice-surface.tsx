import {
  outlinedSurfaceClassName,
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
  RaisedToneWash,
  useRaisedChoiceFaceStyle,
  type RaisedTone,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { type AccessibilityRole, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

interface SelectionChoiceSurfaceProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly accessibilityHint?: string;
  readonly accessibilityLanguage?: string;
  readonly accessibilityRole?: AccessibilityRole;
  readonly testID?: string;
  readonly isSelected?: boolean;
  /**
   * The yellow wash that marks the chosen face. Off where the content shows
   * the choice itself, such as a rating's filled stars (RAPP-963).
   */
  readonly isWashedWhenSelected?: boolean;
  readonly onPress: () => void;
  readonly className?: string;
  /** The face's side padding; a grid tile takes less (RAPP-854). */
  readonly paddingClassName?: string;
  readonly contentClassName: string;
  readonly rowStyle?: StyleProp<ViewStyle>;
  /** A colour for the face (RAPP-845), as a pale wash. */
  readonly tone?: RaisedTone;
  /** The corners of face and edge; a small icon button takes smaller ones (RAPP-884). */
  readonly shapeClassName?: string;
  /** How far past its edges a touch still counts, for a small button. */
  readonly hitSlop?: Insets;
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
  isWashedWhenSelected = true,
  onPress,
  className,
  paddingClassName = 'px-lg',
  contentClassName,
  rowStyle,
  tone,
  shapeClassName,
  hitSlop,
}: SelectionChoiceSurfaceProps) {
  const defaultRowStyle = useRaisedChoiceFaceStyle();
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
      faceClassName={`relative overflow-hidden ${outlinedSurfaceClassName(shapeClassName)} ${paddingClassName} ${contentClassName}`}
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      hitSlop={hitSlop}
      shadow={<RaisedSurfaceEdge shapeClassName={shapeClassName} />}
    >
      <RaisedToneWash tone={tone} />
      <SelectionTransition
        active={isSelected === true && isWashedWhenSelected}
        duration="base"
        className="absolute inset-0 bg-secondary"
        style={continuousCorners}
      />
      {children}
    </PressableDepth>
  );
}

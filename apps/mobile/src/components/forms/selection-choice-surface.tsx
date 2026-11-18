import {
  outlinedSurfaceClassName,
  RaisedSurfaceEdge,
  raisedSurfaceWrapperStyle,
  raisedToneClassNames,
  RaisedToneWash,
  useRaisedChoiceFaceStyle,
  type RaisedTone,
} from '@/components/layout/raised-surface';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ReactNode } from 'react';
import { type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

function faceClassName(tone: RaisedTone | undefined): string {
  return `relative overflow-hidden ${outlinedSurfaceClassName(undefined, tone)} px-lg`;
}

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
  /** A colour instead of the brand (RAPP-845): a pale face, and a full fill when chosen. */
  readonly tone?: RaisedTone;
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
  tone,
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
      faceClassName={`${faceClassName(tone)} ${contentClassName}`}
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      shadow={<RaisedSurfaceEdge tone={tone} />}
    >
      <RaisedToneWash tone={tone} />
      <SelectionTransition
        active={isSelected === true}
        duration="base"
        className={`absolute inset-0 ${tone === undefined ? 'bg-secondary' : raisedToneClassNames(tone).fill}`}
        style={continuousCorners}
      />
      {children}
    </PressableDepth>
  );
}

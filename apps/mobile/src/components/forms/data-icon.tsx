import { Icon, type IconName, type IconWeight } from '@/components/icons/icon';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

// The icon takes its colour from a text colour class, so it follows the
// organization's brand like the text beside it.
const ThemedIcon = cssInterop(Icon, {
  className: { target: false, nativeStyleToProp: { color: true } },
});

const circleStyle = {
  width: tokens.tapTarget.min,
  height: tokens.tapTarget.min,
  borderRadius: tokens.radius.full,
  flexShrink: 0,
} as const;

/** An icon in the brand's dark tone. */
export function BrandIcon({
  name,
  size = tokens.spacing.lg,
  weight,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly weight?: IconWeight;
}) {
  return <ThemedIcon name={name} size={size} weight={weight} className="text-primary-dark" />;
}

/** Shared readable data/privacy icon with a soft tint from the dashboard palette. */
export function DataIcon({ name }: { readonly name: IconName }) {
  return (
    <View
      style={circleStyle}
      className="items-center justify-center bg-secondary/20"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BrandIcon name={name} />
    </View>
  );
}

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const ThemedSymbol = cssInterop(SymbolView, {
  className: { target: false, nativeStyleToProp: { color: 'tintColor' } },
});

const circleStyle = {
  width: tokens.tapTarget.min,
  height: tokens.tapTarget.min,
  borderRadius: tokens.radius.full,
  flexShrink: 0,
} as const;
export function BrandSymbol({
  name,
  size = tokens.spacing.lg,
  weight,
}: Pick<SymbolViewProps, 'name' | 'size' | 'weight'>) {
  return (
    <ThemedSymbol
      accessible={false}
      name={name}
      size={size}
      weight={weight}
      className="text-primary-dark"
    />
  );
}

/** Shared readable data/privacy icon with a soft tint from the dashboard palette. */
export function DataIcon({ name }: { readonly name: SymbolViewProps['name'] }) {
  return (
    <View
      style={circleStyle}
      className="items-center justify-center bg-secondary/20"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BrandSymbol name={name} />
    </View>
  );
}

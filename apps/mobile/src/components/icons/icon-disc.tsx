import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { Icon, type IconName, type IconWeight } from '@/components/icons/icon';
import { useMemo } from 'react';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * An icon in a pale circle (RAPP-854): the picture at the start of a raised
 * tile, such as an Ajuda service category. The circle is a wash of the brand's
 * light shade, or the `wash` given, such as the category's own colour
 * (RAPP-856). Decorative, so the tile's own label names it.
 */
export function IconDisc({
  name,
  wash,
  weight = 'linear',
  size = tokens.fontSize['2xl'],
}: {
  readonly name: IconName;
  readonly wash?: string;
  readonly weight?: IconWeight;
  readonly size?: number;
}) {
  const brandColor = useBrandColor();
  const washStyle = useMemo(
    () => (wash === undefined ? undefined : { backgroundColor: wash }),
    [wash],
  );
  return (
    <View
      accessible={false}
      style={washStyle}
      className={`items-center justify-center rounded-full p-sm ${
        wash === undefined ? 'bg-primary-light/20' : ''
      }`}
    >
      <Icon name={name} weight={weight} size={size} color={brandColor} />
    </View>
  );
}

import { useBrandColor } from '@/components/branding/organization-branding-provider';
import { Icon, type IconName, type IconWeight } from '@/components/icons/icon';
import { View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

/**
 * An icon in a pale circle of the brand's light shade (RAPP-854): the picture at the
 * top of a raised tile, such as an Ajuda service category. Decorative, so the
 * tile's own label names it.
 */
export function IconDisc({
  name,
  weight = 'linear',
  size = tokens.fontSize['2xl'],
}: {
  readonly name: IconName;
  readonly weight?: IconWeight;
  readonly size?: number;
}) {
  const brandColor = useBrandColor();
  return (
    <View
      accessible={false}
      className="items-center justify-center rounded-full bg-primary-light/20 p-sm"
    >
      <Icon name={name} weight={weight} size={size} color={brandColor} />
    </View>
  );
}

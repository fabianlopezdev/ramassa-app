import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { tokens } from '@ramassa/shared/tokens';
import key from '../../../assets/icons/solar/key.svg';
import letter from '../../../assets/icons/solar/letter.svg';
import userCircle from '../../../assets/icons/solar/user-circle.svg';
import userPlus from '../../../assets/icons/solar/user-plus.svg';

const ThemedImage = cssInterop(Image, {
  className: { target: 'style', nativeStyleToProp: { color: 'tintColor' } },
});
const icons = {
  'user-plus': userPlus,
  'user-circle': userCircle,
  letter,
  key,
} as const;
const iconStyle = {
  width: tokens.authChoice.iconSize,
  height: tokens.authChoice.iconSize,
} as const;
export type AuthChoiceIconName = keyof typeof icons;

/** Solar by 480 Design, CC BY 4.0. Attribution travels with the bundled assets. */
export function AuthChoiceIcon({ name }: { readonly name: AuthChoiceIconName }) {
  return (
    <ThemedImage
      source={icons[name]}
      style={iconStyle}
      className="shrink-0 text-primary"
      contentFit="contain"
      accessible={false}
      transition={0}
    />
  );
}

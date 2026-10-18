/**
 * The layout direction for the native tab bars (RAPP-531).
 *
 * On iOS the native tab bar follows the phone's own language and ignores React
 * Native's `forceRTL`, so a player whose phone is in English and who chose
 * Arabic or Persian in the app saw every screen mirrored except the tab bar.
 * react-native-screens takes an explicit direction for the tab host; passing
 * the one React Native uses keeps the bar in step with the screens. On Android
 * the same prop sets the native layout direction.
 */
export function nativeTabsDirection(isRtl: boolean): 'rtl' | 'ltr' {
  return isRtl ? 'rtl' : 'ltr';
}

/** For `<NativeTabs unstable_nativeProps={nativeTabsHostProps(I18nManager.isRTL)}>`. */
export function nativeTabsHostProps(isRtl: boolean) {
  return { direction: nativeTabsDirection(isRtl) } as const;
}

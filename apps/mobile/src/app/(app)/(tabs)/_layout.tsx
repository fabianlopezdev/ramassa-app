import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';

/**
 * The player navigation shell (RAPP-16): five bottom tabs, the SPEC's whole
 * primary IA (max 2 nav levels).
 *
 * NativeTabs (not JS tabs) on purpose: the native tab bar gives platform-correct
 * screen-reader labels, RTL mirroring (ar/fa), and >=48dp targets for free,
 * which is exactly what the WCAG requirement and RAPP-70's premium bar ask for.
 * Every tab carries BOTH an icon and a text label (SPEC UX rule: icon-only
 * fails low-literacy users, text-only fails non-native speakers). Labels come
 * from the `nav` i18n namespace so all five languages translate and the
 * no-literal-string lint rule is satisfied. Android caps native tabs at 5, so
 * these five are the ceiling.
 */
export default function TabsLayout() {
  const { t } = useTranslation('nav');
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="events">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.events')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community">
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="groups" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.community')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="services">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" md="category" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.services')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="person" />
        <NativeTabs.Trigger.Label>{t('nav:tabs.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

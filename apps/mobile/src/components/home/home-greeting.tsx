/**
 * The top of Inici (RAPP-907): the club's logo, then "Hola," and her first
 * name on two lines, in the place the other tabs keep for their name. The tab
 * bar still calls the tab Inici.
 *
 * The name line keeps its height while her card loads, so the row does not
 * jump when the name arrives.
 */
import { PublicOrganizationLogo } from '@/components/branding/public-organization-logo';
import { useOwnPersonCard } from '@/lib/person-cards';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

const NAME_LINE_WHILE_LOADING = ' ';

export function HomeGreeting() {
  const { t } = useTranslation('home');
  const languageFontClass = useLanguageFontClass();
  const firstName = useOwnPersonCard()?.firstName?.trim() || null;
  const greeting = t('greeting');
  return (
    <View testID="home-greeting" className="flex-1 flex-row items-center gap-sm">
      <PublicOrganizationLogo variant="header" />
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={firstName === null ? greeting : `${greeting} ${firstName}`}
        className="flex-1"
      >
        <Text className={`text-start text-xl font-semibold text-neutral-600 ${languageFontClass}`}>
          {greeting}
        </Text>
        <Text
          testID="home-greeting-name"
          className={`text-start text-3xl font-extrabold text-neutral-900 ${languageFontClass}`}
        >
          {firstName ?? NAME_LINE_WHILE_LOADING}
        </Text>
      </View>
    </View>
  );
}

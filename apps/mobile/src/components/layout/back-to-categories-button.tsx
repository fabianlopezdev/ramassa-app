/**
 * The way back from an open category to the category tiles of an Ajuda
 * section (RAPP-806, RAPP-870): the small raised button (RAPP-867) with the
 * grid icon. It is a state of the tab, so it stays an in-page control. Serveis
 * and Guies share it.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { useTranslation } from 'react-i18next';

export function BackToCategoriesButton({
  testID,
  onPress,
}: {
  readonly testID: string;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation('playerServices');
  return (
    <RaisedActionButton
      testID={testID}
      size="compact"
      icon="grid"
      label={t('backCategories')}
      onPress={onPress}
    />
  );
}

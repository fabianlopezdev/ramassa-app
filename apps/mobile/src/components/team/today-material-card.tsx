/**
 * Today's material section (RAPP-249): items whose stock went below zero
 * because a handover was never blocked by stock. Each asks for a count; the
 * count screen itself is the stock count work that follows.
 */
import { continuousCorners } from '@/lib/continuous-corners';
import { useStockAlerts } from '@/lib/handover';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export function TodayMaterialCard() {
  const { t } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const fontClass = useLanguageFontClass();
  const alerts = useStockAlerts(true).data ?? [];
  return (
    <View
      testID="today-material"
      style={continuousCorners}
      className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
        {t('material.stockTitle')}
      </Text>
      {alerts.length === 0 ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('material.stockFine')}
        </Text>
      ) : (
        alerts.map((alert) => (
          <Text
            key={alert.id}
            testID={`today-stock-alert-${alert.itemKey}`}
            className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
          >
            {t('material.stockAlert', {
              item:
                alert.size === null
                  ? tEquipment(alert.itemKey)
                  : `${tEquipment(alert.itemKey)} ${alert.size}`,
            })}
          </Text>
        ))
      )}
    </View>
  );
}

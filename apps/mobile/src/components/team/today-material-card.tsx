/**
 * Today's material section (RAPP-249): items whose stock went below zero
 * because a handover was never blocked by stock. Each asks for a count. For
 * whoever has the Stock area it opens Stock (RAPP-250); a coach who only
 * hands material out sees the lines without a link.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useStockAlerts } from '@/lib/handover';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

const cardClass = 'gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm';

export function TodayMaterialCard() {
  const { t } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const hasStock = teamAreas(useAccountAccess().permissions).includes('stock');
  const alerts = useStockAlerts(true).data ?? [];
  const lines = alerts.map((alert) => ({
    id: alert.id,
    itemKey: alert.itemKey,
    text: t('material.stockAlert', {
      item:
        alert.size === null
          ? tEquipment(alert.itemKey)
          : `${tEquipment(alert.itemKey)} ${alert.size}`,
    }),
  }));
  const details = lines.length === 0 ? [t('material.stockFine')] : lines.map((line) => line.text);

  const body = (
    <>
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
        {t('material.stockTitle')}
      </Text>
      {lines.length === 0 ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('material.stockFine')}
        </Text>
      ) : (
        lines.map((line) => (
          <Text
            key={line.id}
            testID={`today-stock-alert-${line.itemKey}`}
            className={`text-start text-md font-semibold text-neutral-800 ${fontClass}`}
          >
            {line.text}
          </Text>
        ))
      )}
    </>
  );

  return hasStock ? (
    <PressableScale
      testID="today-material"
      accessibilityRole="button"
      accessibilityLabel={[t('material.stockTitle'), ...details].join(', ')}
      onPress={() => push('/stock' as Href)}
      haptic="selection"
      style={continuousCorners}
      className={`min-h-recommended ${cardClass}`}
    >
      {body}
    </PressableScale>
  ) : (
    <View testID="today-material" style={continuousCorners} className={cardClass}>
      {body}
    </View>
  );
}

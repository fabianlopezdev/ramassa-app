/**
 * Today's late checkouts (RAPP-252): material lent to a staff member that is
 * past its return date. The storeroom sees every late one and opens Stock;
 * a staff member sees the ones she has.
 */
import { useCheckoutDate } from '@/components/equipment/staff-checkouts';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useItemLabel } from '@/lib/item-label';
import { useOpenCheckouts } from '@/lib/stock';
import { teamAreas } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

const cardClass = 'gap-xs rounded-md border border-error bg-white px-md py-sm';

export function TodayCheckoutsCard() {
  const { t } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const fontClass = useLanguageFontClass();
  const formatDate = useCheckoutDate();
  const { push } = useRouter();
  const userId = useAuth().user?.id ?? null;
  const hasStock = teamAreas(useAccountAccess().permissions).includes('stock');
  const late = (useOpenCheckouts().data ?? []).filter((row) => row.isOverdue);
  if (late.length === 0) return null;

  const lines = late.map((row) => {
    const item =
      row.size === null ? itemLabel(row.itemKey) : `${itemLabel(row.itemKey)} ${row.size}`;
    const values = {
      item,
      quantity: row.quantity,
      name: row.staffName,
      date: formatDate(row.expectedReturnOn),
    };
    return {
      id: row.id,
      text:
        row.staffId === userId ? t('checkout.todayMine', values) : t('checkout.todayRow', values),
    };
  });
  const body = (
    <>
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
        {t('checkout.todayTitle')}
      </Text>
      {lines.map((line) => (
        <Text key={line.id} className={`text-start text-md font-semibold text-error ${fontClass}`}>
          {line.text}
        </Text>
      ))}
    </>
  );

  const card = hasStock ? (
    <PressableScale
      testID="today-checkouts"
      accessibilityRole="button"
      accessibilityLabel={[t('checkout.todayTitle'), ...lines.map((line) => line.text)].join(', ')}
      onPress={() => push('/stock' as Href)}
      haptic="selection"
      style={continuousCorners}
      className={`min-h-recommended ${cardClass}`}
    >
      {body}
    </PressableScale>
  ) : (
    <View testID="today-checkouts" style={continuousCorners} className={cardClass}>
      {body}
    </View>
  );
  return <View className="pt-md">{card}</View>;
}

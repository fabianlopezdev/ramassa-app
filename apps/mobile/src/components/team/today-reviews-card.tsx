/**
 * Today's service reviews section (RAPP-345): how many services partner
 * entities sent are waiting, one tap to the queue in Content.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { useServiceReviewCount } from '@/lib/content-service-reviews';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function TodayReviewsCard() {
  const { t } = useTranslation('services');
  const languageFontClass = useLanguageFontClass();
  const { navigate } = useRouter();
  const waiting = useServiceReviewCount().data ?? 0;
  const detail =
    waiting > 0 ? t('reviewQueueSummary', { count: waiting }) : t('reviewQueueEmptyTitle');
  return (
    <PressableScale
      testID="today-reviews"
      accessibilityRole="button"
      accessibilityLabel={`${t('reviewQueueTitle')}, ${detail}`}
      // A new time on every tap, so the Content tab switches even when it is already open.
      onPress={() =>
        navigate({
          pathname: '/content',
          params: { kind: 'reviews', at: String(Date.now()) },
        } as Href)
      }
      haptic="selection"
      style={continuousCorners}
      className="min-h-recommended justify-center gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
        {t('reviewQueueTitle')}
      </Text>
      <Text
        className={`text-start text-md ${
          waiting > 0 ? 'font-semibold text-primary-dark' : 'text-neutral-600'
        } ${languageFontClass}`}
      >
        {detail}
      </Text>
    </PressableScale>
  );
}

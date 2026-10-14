/**
 * Approving an entity's pending service (RAPP-345): the service form in
 * approval mode. Saving publishes it with the reviewer's corrections and an
 * optional comment the entity sees, then goes back to the queue item.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ServiceForm } from '@/components/content/service-form';
import { useServiceReview } from '@/lib/content-service-reviews';
import { useContentServiceCategories } from '@/lib/content-services';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ServiceApproveScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const review = useServiceReview(id, null);
  const categories = useContentServiceCategories();
  const { t } = useTranslation('services');
  if (review.data === undefined || categories.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {review.isError || categories.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('reviewLoadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('reviewEditTitle')} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <ServiceForm
      serviceId={id}
      detail={review.data.detail}
      categories={categories.data}
      isApproval
    />
  );
}

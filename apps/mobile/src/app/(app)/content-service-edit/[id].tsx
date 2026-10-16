/** Writing a service on the phone (RAPP-344); the form is `service-form.tsx`. */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { ServiceForm } from '@/components/content/service-form';
import { useContentService, useContentServiceCategories } from '@/lib/content-services';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ServiceEditScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const detail = useContentService(isNew ? '' : id);
  const categories = useContentServiceCategories();
  const { t } = useTranslation('services');
  if ((!isNew && detail.data === undefined) || categories.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {detail.isError || categories.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('loadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('editTitle')} />
        )}
      </SafeAreaView>
    );
  }
  return (
    <ServiceForm
      serviceId={id}
      detail={isNew ? undefined : detail.data}
      categories={categories.data}
    />
  );
}

/**
 * A new service submission from the phone (RAPP-414), as the web portal's new
 * service page: the form with the categories and the contacts she used
 * before. Once sent, the submission opens.
 */
import { EntityServiceForm } from '@/components/entity/entity-service-form';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { screenContentClassName } from '@/components/layout/screen-spacing';
import { useEntityServiceCategories, useOwnServiceContacts } from '@/lib/entity-services';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EntityServiceNewScreen() {
  const { t } = useTranslation('entity-services');
  const { replace } = useRouter();
  const categories = useEntityServiceCategories();
  const contacts = useOwnServiceContacts();

  return (
    <SafeAreaView
      testID="entity-service-new-screen"
      className="flex-1 bg-neutral-50"
      edges={['left', 'right']}
    >
      <NativeScreenHeader title={t('newTitle')} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PageWidth className={screenContentClassName}>
          {categories.data === undefined || contacts.data === undefined ? null : (
            <EntityServiceForm
              categories={categories.data}
              contacts={contacts.data}
              onSaved={(serviceId) => replace(`/entity-service/${serviceId}` as Href)}
            />
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

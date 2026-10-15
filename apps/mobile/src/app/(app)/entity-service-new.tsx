/**
 * A new service submission from the phone (RAPP-414), as the web portal's new
 * service page: the form with the categories and the contacts she used
 * before. Once sent, the submission opens.
 */
import { EntityServiceForm } from '@/components/entity/entity-service-form';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useEntityServiceCategories, useOwnServiceContacts } from '@/lib/entity-services';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EntityServiceNewScreen() {
  const { t } = useTranslation('entity-services');
  const fontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const categories = useEntityServiceCategories();
  const contacts = useOwnServiceContacts();

  return (
    <SafeAreaView
      testID="entity-service-new-screen"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="entity-service-back"
            accessibilityLabel={t('backToList')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('backToList')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('newTitle')}
          </Text>
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

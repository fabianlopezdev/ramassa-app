import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { GalleryGrid } from '@/components/gallery/gallery-grid';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  content: { padding: tokens.spacing.md, paddingBottom: tokens.spacing['3xl'] },
});

/** Kept for existing links; Comunitat renders the same grid as its Galeria segment. */
export default function GalleryScreen() {
  const { t } = useTranslation('gallery');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const openUpload = useCallback(() => push('/gallery/upload' as Href), [push]);
  const header = useMemo(
    () => (
      <PageWidth className="pb-lg">
        <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
          {t('intro')}
        </Text>
      </PageWidth>
    ),
    [languageFontClass, t],
  );

  return (
    <ActionScreen
      action={<AuthSubmitButton testID="gallery-upload" label={t('upload')} onPress={openUpload} />}
    >
      <NativeScreenHeader title={t('title')} />
      <GalleryGrid header={header} contentContainerStyle={styles.content} />
    </ActionScreen>
  );
}

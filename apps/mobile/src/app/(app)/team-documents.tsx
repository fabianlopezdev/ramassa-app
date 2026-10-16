/**
 * Internal documents on the phone (RAPP-406), for `settings.documents`
 * holders, as the documents tab of the web admin's Settings: a private area
 * for insurance, inventory and the organization's resources. The list follows
 * the search as it is typed; Open hands a document to the share sheet, and
 * Upload a document adds one from the phone's files (PDF, Word or a photo, 10
 * MB at most).
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { documentSize } from '@/lib/document-file';
import { playHaptic } from '@/lib/haptics/haptics';
import { useDocumentActions, useInternalDocuments } from '@/lib/team-documents';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';

const SEARCH_DELAY_MS = 300;

export default function TeamDocumentsScreen() {
  const { t, i18n } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  );
  const documents = useInternalDocuments(query);
  const { open, add } = useDocumentActions(t('documentsTitle'));
  const language = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const dates = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: MADRID_TIME_ZONE }),
    [language],
  );
  const sizes = useMemo(
    () => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }),
    [language],
  );

  // The search waits for a short pause in typing, so each key is not a request.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const failed = () => {
    playHaptic('error');
    setNotice({ ok: false, text: t('actionError') });
  };
  const rows = documents.data ?? [];

  return (
    <SafeAreaView
      testID="team-documents"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-documents-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('documentsTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('documentsIntro')}
            </Text>
          </View>

          <View className="gap-xs">
            <PressableScale
              testID="documents-upload"
              accessibilityRole="button"
              accessibilityLabel={t('documentUpload')}
              onPress={() => {
                setNotice(null);
                add.mutate(undefined, {
                  onSuccess: (added) => {
                    if (!added) return;
                    playHaptic('success');
                    setNotice({ ok: true, text: t('documentUploaded') });
                  },
                  onError: failed,
                });
              }}
              isBusy={add.isPending}
              isDisabled={add.isPending}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {add.isPending ? t('working') : t('documentUpload')}
              </Text>
            </PressableScale>
            <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
              {t('documentHelp')}
            </Text>
          </View>

          {notice === null ? null : (
            <Text
              testID="documents-notice"
              accessibilityLiveRegion="polite"
              className={`text-start text-md ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
            >
              {notice.text}
            </Text>
          )}

          <AuthTextField
            testID="documents-search"
            label={t('documentSearch')}
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            returnKeyType="search"
            maxLength={120}
          />

          {documents.isError ? (
            <Text className={`text-start text-md text-error ${fontClass}`}>{t('actionError')}</Text>
          ) : documents.data !== undefined && rows.length === 0 ? (
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('documentsEmpty')}
            </Text>
          ) : (
            <View className="gap-sm">
              {rows.map((document) => (
                <View
                  key={document.id}
                  testID={`document-${document.id}`}
                  style={continuousCorners}
                  className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                >
                  <Text className="text-start text-md font-bold text-neutral-900" numberOfLines={2}>
                    {document.name}
                  </Text>
                  <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                    {[
                      document.uploader_name,
                      dates.format(new Date(document.created_at)),
                      documentSize(document.file_size, sizes),
                    ].join(' · ')}
                  </Text>
                  <PressableScale
                    testID={`document-open-${document.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('download')}, ${document.name}`}
                    onPress={() => {
                      setNotice(null);
                      open.mutate(document, { onError: failed });
                    }}
                    isBusy={open.isPending && open.variables?.id === document.id}
                    isDisabled={open.isPending}
                    haptic="tapLight"
                    className="min-h-recommended justify-center self-start px-xs"
                  >
                    <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                      {t('download')}
                    </Text>
                  </PressableScale>
                </View>
              ))}
            </View>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

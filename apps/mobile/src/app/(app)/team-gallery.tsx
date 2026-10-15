/**
 * Gallery moderation on the phone (RAPP-381), for `gallery.moderate` holders:
 * every gallery photo and video, newest first, with what players see marked
 * apart from what is hidden. A tap opens the item with its caption, who shared
 * it and when, who can see it and its reports, and the team's actions: hide
 * it or show it again, or remove it with its files (asks first).
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { useAppLock } from '@/components/auth/app-lock';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { filterGallery, type GalleryFilter } from '@/lib/gallery-filter';
import { playHaptic } from '@/lib/haptics/haptics';
import { resolveMediaImageSource } from '@/lib/media-source';
import { mobileClientEnv } from '@/lib/supabase';
import { useGalleryModerationActions, useTeamGallery } from '@/lib/team-gallery';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { MediaItemRow } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';

const FILTERS: readonly GalleryFilter[] = ['all', 'visible', 'hidden'];
const FILTER_KEYS = {
  all: 'filterAll',
  visible: 'filterVisible',
  hidden: 'filterHidden',
} as const satisfies Record<GalleryFilter, string>;
const TABLET_WIDTH = 768;
const styles = StyleSheet.create({
  tile: { aspectRatio: 1 },
  large: { width: '100%', aspectRatio: 4 / 3 },
});
const keyExtractor = (item: MediaItemRow) => item.id;
const listContentStyle = {
  paddingHorizontal: tokens.spacing.md,
  paddingBottom: tokens.spacing['3xl'],
} as const;

function useItemSource(item: MediaItemRow, preferFile: boolean) {
  const { session } = useAuth();
  return useMemo(
    () =>
      resolveMediaImageSource({
        // A video shows its thumbnail; a photo shows itself when large.
        objectKeyOrUrl:
          preferFile && item.file_type === 'image'
            ? item.file_url
            : (item.thumbnail_url ?? item.file_url),
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken: session?.access_token,
      }),
    [item.file_type, item.file_url, item.thumbnail_url, preferFile, session?.access_token],
  );
}

function stateKey(item: MediaItemRow): string | null {
  if (item.moderation_state === 'hidden') return 'stateHidden';
  if (item.moderation_state === 'hidden_pending_review') return 'statePending';
  return null;
}

function Tile({ item, onOpen }: { readonly item: MediaItemRow; readonly onOpen: () => void }) {
  const { t } = useTranslation('gallery');
  const fontClass = useLanguageFontClass();
  const source = useItemSource(item, false);
  const state = stateKey(item);
  return (
    <PressableScale
      testID={`team-gallery-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        t('openItem', { name: item.uploader_first_name }),
        state === null ? null : t(state),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onOpen}
      haptic="selection"
      style={[styles.tile, continuousCorners]}
      className="m-xs flex-1 overflow-hidden rounded-md bg-neutral-200"
    >
      {source === null ? null : (
        <Image source={source} contentFit="cover" style={StyleSheet.absoluteFill} />
      )}
      {state === null && item.file_type === 'image' ? null : (
        <View className="absolute bottom-xs start-xs flex-row gap-xs">
          {item.file_type === 'video' ? (
            <View className="rounded-full bg-neutral-900/80 px-sm py-xs">
              <Text className={`text-xs font-semibold text-white ${fontClass}`}>
                {t('moderationVideo')}
              </Text>
            </View>
          ) : null}
          {state === null ? null : (
            <View className="rounded-full bg-error px-sm py-xs">
              <Text className={`text-xs font-semibold text-white ${fontClass}`}>{t(state)}</Text>
            </View>
          )}
        </View>
      )}
    </PressableScale>
  );
}

function ItemSheet({
  item,
  onClose,
}: {
  readonly item: MediaItemRow | null;
  readonly onClose: () => void;
}) {
  const { isCovered } = useAppLock();
  return (
    <Modal
      visible={item !== null && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" testID="team-gallery-sheet">
        {item === null ? null : <ItemDetail item={item} onClose={onClose} />}
      </SafeAreaView>
    </Modal>
  );
}

function ItemDetail({
  item,
  onClose,
}: {
  readonly item: MediaItemRow;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation('gallery');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const source = useItemSource(item, true);
  const { setState, remove } = useGalleryModerationActions();
  const [hasFailed, setHasFailed] = useState(false);
  const isVisible = item.moderation_state === 'visible';
  const state = stateKey(item);
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(item.created_at));
  const done = {
    onSuccess: () => {
      playHaptic('success');
      onClose();
    },
    onError: () => {
      playHaptic('error');
      setHasFailed(true);
    },
  };
  const confirmRemove = () => {
    const go = () => remove.mutate(item.id, done);
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('deleteTitle')}\n${t('deleteBody')}`)) go();
      return;
    }
    Alert.alert(t('deleteTitle'), t('deleteBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView contentContainerClassName="gap-md p-lg">
      <PressableScale
        testID="team-gallery-sheet-close"
        accessibilityRole="button"
        accessibilityLabel={tCommon('close')}
        onPress={onClose}
        haptic="tapLight"
        className="min-h-recommended self-end justify-center"
      >
        <Text className={`font-semibold text-primary-dark ${fontClass}`}>{tCommon('close')}</Text>
      </PressableScale>
      <View style={[styles.large, continuousCorners]} className="overflow-hidden bg-neutral-100">
        {source === null ? null : (
          <Image
            source={source}
            accessibilityLabel={item.caption ?? t('mediaBy', { name: item.uploader_first_name })}
            contentFit="contain"
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      {item.caption === null ? null : (
        <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
          {item.caption}
        </Text>
      )}
      <View className="gap-xs">
        <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
          {t('mediaBy', { name: item.uploader_first_name })}
        </Text>
        <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
          {date}
        </Text>
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {`${t('privacy')} ${t(`privacyLevels.${item.privacy_level}`)}`}
        </Text>
        {state === null ? null : (
          <Text
            testID="team-gallery-sheet-state"
            className={`text-start text-sm font-semibold text-error ${fontClass}`}
          >
            {t(state)}
          </Text>
        )}
        {item.flag_count === 0 ? null : (
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {t('moderationReports', { count: item.flag_count })}
          </Text>
        )}
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID={isVisible ? 'team-gallery-hide' : 'team-gallery-show'}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? t('moderationHide') : t('moderationShow')}
          onPress={() =>
            setState.mutate({ id: item.id, state: isVisible ? 'hidden' : 'visible' }, done)
          }
          isBusy={setState.isPending}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {isVisible ? t('moderationHide') : t('moderationShow')}
          </Text>
        </PressableScale>
        <PressableScale
          testID="team-gallery-remove"
          accessibilityRole="button"
          accessibilityLabel={t('delete')}
          onPress={confirmRemove}
          isBusy={remove.isPending}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md border border-error bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
            {t('delete')}
          </Text>
        </PressableScale>
      </View>
      {hasFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {t('moderationFailed')}
        </Text>
      ) : null}
    </ScrollView>
  );
}

export default function TeamGalleryScreen() {
  const { t } = useTranslation('gallery');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { width } = useWindowDimensions();
  const gallery = useTeamGallery();
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const items = useMemo(() => filterGallery(gallery.data ?? [], filter), [filter, gallery.data]);
  const openItem = gallery.data?.find((item) => item.id === openId) ?? null;
  const columns = width >= TABLET_WIDTH ? 4 : 2;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MediaItemRow>) => (
      <Tile item={item} onOpen={() => setOpenId(item.id)} />
    ),
    [],
  );

  const header = (
    <View className="gap-md px-lg pb-md pt-lg">
      <PressableScale
        testID="team-gallery-back"
        accessibilityLabel={tCommon('back')}
        onPress={back}
        haptic="tapLight"
        className="min-h-recommended self-start justify-center"
      >
        <Text className={`font-semibold text-primary-dark ${fontClass}`}>{tCommon('back')}</Text>
      </PressableScale>
      <View className="gap-xs">
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
        >
          {t('moderationTitle')}
        </Text>
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('moderationIntro')}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-sm">
          {FILTERS.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`team-gallery-filter-${candidate}`}
              value={candidate}
              label={t(FILTER_KEYS[candidate])}
              selected={candidate === filter}
              onSelect={setFilter}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
      {gallery.isSuccess ? (
        <Text
          testID="team-gallery-total"
          className={`text-start text-sm text-neutral-600 ${fontClass}`}
        >
          {t('moderationTotal', { count: items.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      testID="team-gallery"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      {gallery.isPending ? (
        <>
          {header}
          <AnnouncementFeedSkeleton accessibilityLabel={t('moderationTitle')} />
        </>
      ) : gallery.isError ? (
        <>
          {header}
          <Text className={`px-lg text-start text-md text-error ${fontClass}`}>
            {t('loadFailed')}
          </Text>
        </>
      ) : (
        <FlashList
          key={columns}
          data={items}
          numColumns={columns}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text className={`px-lg py-xl text-center text-md text-neutral-600 ${fontClass}`}>
              {t('empty')}
            </Text>
          }
          contentContainerStyle={listContentStyle}
        />
      )}
      <ItemSheet item={openItem} onClose={() => setOpenId(null)} />
    </SafeAreaView>
  );
}

/**
 * Participants (RAPP-247, full list since RAPP-280): the roster with search,
 * status chips and a filter sheet, a page at a time as she scrolls. On a
 * tablet it is a table with sortable columns, and her card opens beside it.
 * Everything comes through `list_participants`, so the database decides per
 * person which fields come back and which filters apply.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
} from '@/components/announcements/feed-states';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ParticipantCard } from '@/components/participants/participant-card';
import {
  ParticipantFilterSheet,
  SORT_LABEL_KEYS,
} from '@/components/participants/participant-filter-sheet';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  activeSheetFilters,
  nextSort,
  type ParticipantListSearch,
} from '@/lib/participant-filters';
import { useParticipantList } from '@/lib/participant-lookup';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import {
  participantSearchSchema,
  type ParticipantListRow,
  type ParticipantSortColumn,
} from '@ramassa/shared/participants';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ROWS: readonly ParticipantListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
const listPaneStyle = { flex: 1 } as const;
// The card beside the table: two fifths of the screen, within readable bounds.
const DETAIL_MIN = 320;
const DETAIL_MAX = 480;
const keyExtractor = (row: ParticipantListRow) => row.id;
// One width per column, shared by the header and the rows so they line up.
// Cells are Views with a zero basis, so every row splits the width the same way.
// A new sort or filter starts at the top. FlashList keeps the old rows in view by default.
const listPosition = { disabled: true } as const;
const nameColumnStyle = { flexGrow: 1.5, flexShrink: 1, flexBasis: 0 } as const;
const columnStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0 } as const;
/** A table this wide shows every column; narrower, the essential three. */
const WIDE_TABLE = 640;

const DEFAULT_SEARCH: ParticipantListSearch = (({ page, ...rest }) => {
  void page;
  return rest;
})(participantSearchSchema.parse({}));

function ParticipantRow({
  row,
  onOpen,
  isSelected,
}: {
  readonly row: ParticipantListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const name = `${row.first_name} ${row.last_name}`;
  const detail = [row.city, row.reference_entity].filter(Boolean).join(' · ');
  const label = [name, detail, row.is_active ? null : t('rowInactive')].filter(Boolean).join(', ');
  return (
    <PressableScale
      testID={`participant-result-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onOpen(row.id)}
      haptic="selection"
      isSelected={isSelected}
      style={continuousCorners}
      className={`min-h-recommended justify-center gap-xs rounded-md border bg-white px-md py-sm ${
        isSelected ? 'border-primary' : 'border-neutral-200'
      }`}
    >
      <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
        <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>{name}</Text>
        {row.is_active ? null : (
          <Text className={`text-sm font-semibold text-neutral-600 ${fontClass}`}>
            {t('rowInactive')}
          </Text>
        )}
      </View>
      {detail.length > 0 ? (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{detail}</Text>
      ) : null}
    </PressableScale>
  );
}

function TableRow({
  row,
  onOpen,
  isSelected,
  wide,
  joined,
}: {
  readonly row: ParticipantListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
  readonly wide: boolean;
  readonly joined: string;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const name = `${row.last_name}, ${row.first_name}`;
  const cell = `text-start text-md text-neutral-800 ${fontClass}`;
  return (
    <PressableScale
      testID={`participant-result-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        row.city,
        row.reference_entity,
        row.is_active ? null : t('rowInactive'),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() => onOpen(row.id)}
      haptic="selection"
      isSelected={isSelected}
      className={`min-h-recommended flex-row items-center gap-md border-b border-neutral-200 px-md ${
        isSelected ? 'bg-neutral-100' : 'bg-white'
      }`}
    >
      <View style={nameColumnStyle}>
        <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
          {name}
        </Text>
      </View>
      <View style={columnStyle}>
        <Text className={cell}>{row.city ?? ''}</Text>
      </View>
      <View style={columnStyle}>
        <Text className={cell}>{row.reference_entity ?? ''}</Text>
      </View>
      {wide ? (
        <View style={columnStyle}>
          <Text className={cell}>{row.is_active ? t('rowActive') : t('rowInactive')}</Text>
        </View>
      ) : null}
      {wide ? (
        <View style={columnStyle}>
          <Text className={cell}>{joined}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

export default function ParticipantListScreen() {
  const { t, i18n } = useTranslation('participants');
  const { t: tNav } = useTranslation('nav');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { permissions } = useAccountAccess();
  const canInvite = permissions.has('participants.invite');
  const canHandleRgpd = permissions.has('rgpd.erase');
  const isSplit = useTeamLayout() === 'sidebar';
  const [search, setSearch] = useState<ParticipantListSearch>(DEFAULT_SEARCH);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const detailStyle = useMemo(
    () => ({ width: Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Math.round(windowWidth * 0.4))) }),
    [windowWidth],
  );
  // Typing does not fetch on every letter.
  const deferredQ = useDeferredValue(search.q);
  const query = useMemo(() => ({ ...search, q: deferredQ }), [deferredQ, search]);
  const list = useParticipantList(query);
  const listRef = useRef<FlashListRef<ParticipantListRow>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query]);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? EMPTY_ROWS,
    [list.data],
  );
  const total = list.data?.pages[0]?.total ?? 0;
  const sheetCount = activeSheetFilters(search);
  const wide = tableWidth >= WIDE_TABLE;
  const joinedFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );

  const open = useCallback(
    (id: string) => (isSplit ? setSelectedId(id) : push(`/participant/${id}` as Href)),
    [isSplit, push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ParticipantListRow>) =>
      isSplit ? (
        <TableRow
          row={item}
          onOpen={open}
          isSelected={item.id === selectedId}
          wide={wide}
          joined={joinedFormat.format(new Date(item.created_at))}
        />
      ) : (
        <ParticipantRow row={item} onOpen={open} isSelected={item.id === selectedId} />
      ),
    [isSplit, joinedFormat, open, selectedId, wide],
  );

  const sortHeader = (
    column: ParticipantSortColumn,
    widthStyle: typeof columnStyle | typeof nameColumnStyle,
  ) => {
    const label = t(SORT_LABEL_KEYS[column]);
    const sorted = search.sort === column;
    const direction = t(search.dir === 'asc' ? 'list.dirAsc' : 'list.dirDesc');
    return (
      <View style={widthStyle}>
        <PressableScale
          testID={`participant-sort-${column}`}
          accessibilityRole="button"
          accessibilityLabel={
            sorted
              ? t('list.sortedBy', { column: label, direction })
              : t('list.sortBy', { column: label })
          }
          onPress={() => setSearch((current) => ({ ...current, ...nextSort(current, column) }))}
          haptic="selection"
          className="min-h-recommended justify-center"
        >
          <Text
            className={`text-start text-sm font-bold ${sorted ? 'text-primary-dark' : 'text-neutral-700'} ${fontClass}`}
          >
            {sorted ? `${label} ${search.dir === 'asc' ? '↑' : '↓'}` : label}
          </Text>
        </PressableScale>
      </View>
    );
  };

  const header = (
    <View className="gap-sm px-lg pb-md pt-lg">
      <TeamBackToHome />
      <View className="flex-row flex-wrap items-center justify-between gap-sm">
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
        >
          {tNav('team.participants')}
        </Text>
        <View className="flex-row flex-wrap gap-md">
          {canHandleRgpd ? (
            <PressableScale
              testID="participants-deletion-requests"
              accessibilityRole="button"
              accessibilityLabel={t('deletionRequestsTitle')}
              onPress={() => push('/deletion-requests' as Href)}
              haptic="tapLight"
              className="min-h-recommended justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('deletionRequestsTitle')}
              </Text>
            </PressableScale>
          ) : null}
          {canInvite ? (
            <PressableScale
              testID="participants-invites"
              accessibilityRole="button"
              accessibilityLabel={t('invitesAction')}
              onPress={() => push('/participant-invites' as Href)}
              haptic="tapLight"
              className="min-h-recommended justify-center"
            >
              <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                {t('invitesAction')}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-sm">
        <TextInput
          testID="participant-search"
          value={search.q}
          onChangeText={(q) => setSearch((current) => ({ ...current, q }))}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={tokens.colors.neutral[600]}
          accessibilityLabel={t('searchLabel')}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          style={continuousCorners}
          className={`min-h-recommended flex-1 rounded-md border border-neutral-300 bg-white px-md text-md text-neutral-900 ${fontClass}`}
        />
        {list.isFetching && !list.isFetchingNextPage ? (
          <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-sm"
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('filterStatus')}
          className="flex-row gap-sm"
        >
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <ChoiceOption
              key={status}
              testID={`participant-status-${status}`}
              value={status}
              label={
                status === 'all'
                  ? t('optionAll')
                  : t(status === 'active' ? 'statusActive' : 'statusInactive')
              }
              selected={search.status === status}
              onSelect={(value) => setSearch((current) => ({ ...current, status: value }))}
              languageFontClass={fontClass}
            />
          ))}
        </View>
        <PressableScale
          testID="participant-filters"
          accessibilityRole="button"
          accessibilityLabel={
            sheetCount > 0
              ? t('list.filtersActionCount', { count: sheetCount })
              : t('list.filtersAction')
          }
          onPress={() => setSheetOpen(true)}
          haptic="selection"
          style={continuousCorners}
          className={`min-h-recommended items-center justify-center rounded-md border px-md ${
            sheetCount > 0 ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'
          }`}
        >
          <Text
            className={`font-semibold ${sheetCount > 0 ? 'text-white' : 'text-neutral-800'} ${fontClass}`}
          >
            {sheetCount > 0
              ? t('list.filtersActionCount', { count: sheetCount })
              : t('list.filtersAction')}
          </Text>
        </PressableScale>
      </ScrollView>
      <View className="flex-row flex-wrap items-center justify-between gap-sm">
        <Text
          testID="participant-total"
          className={`text-start text-sm text-neutral-600 ${fontClass}`}
        >
          {list.isSuccess ? t('summary', { count: total }) : ''}
        </Text>
        {sheetCount > 0 || search.status !== 'all' || search.q.length > 0 ? (
          <PressableScale
            testID="participant-clear-filters"
            accessibilityRole="button"
            accessibilityLabel={t('clearFilters')}
            onPress={() => setSearch(DEFAULT_SEARCH)}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('clearFilters')}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );

  const body = list.isError ? (
    <AnnouncementFeedError
      message={t('loadFailed')}
      retryLabel={tErrors('retry')}
      code={toAppError(list.error).code}
      languageFontClass={fontClass}
      onRetry={() => void list.refetch()}
      isLoading={list.isFetching}
    />
  ) : list.isSuccess && rows.length === 0 ? (
    <AnnouncementEmptyState
      title={t('emptyTitle')}
      body={t('emptyBody')}
      languageFontClass={fontClass}
    />
  ) : (
    <FlashList
      ref={listRef}
      accessibilityRole="list"
      accessibilityLabel={tNav('team.participants')}
      maintainVisibleContentPosition={listPosition}
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={`${selectedId}-${wide}`}
      contentContainerStyle={isSplit ? undefined : listContentStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      ItemSeparatorComponent={isSplit ? undefined : RowSeparator}
      ListFooterComponent={
        list.isFetchingNextPage ? (
          <ActivityIndicator
            accessibilityLabel={t('list.loadingMore')}
            color={tokens.colors.primary.DEFAULT}
          />
        ) : null
      }
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit ? (
        <View className="flex-1 flex-row">
          <View
            style={listPaneStyle}
            onLayout={(event: LayoutChangeEvent) => setTableWidth(event.nativeEvent.layout.width)}
          >
            {header}
            <View className="flex-row items-center gap-md border-b border-neutral-300 px-md">
              {sortHeader('last_name', nameColumnStyle)}
              {sortHeader('city', columnStyle)}
              {sortHeader('reference_entity', columnStyle)}
              {wide ? (
                <View style={columnStyle}>
                  <Text className={`text-start text-sm font-bold text-neutral-700 ${fontClass}`}>
                    {t('columnStatus')}
                  </Text>
                </View>
              ) : null}
              {wide ? sortHeader('created_at', columnStyle) : null}
            </View>
            {body}
          </View>
          <View style={detailStyle} className="border-s border-neutral-200 bg-white">
            {selectedId === null ? (
              <View className="flex-1 items-center justify-center p-lg">
                <Text className={`text-center text-md text-neutral-600 ${fontClass}`}>
                  {t('selectParticipant')}
                </Text>
              </View>
            ) : (
              <ParticipantCard key={selectedId} participantId={selectedId} />
            )}
          </View>
        </View>
      ) : (
        <PageWidth className="flex-1">
          {header}
          {body}
        </PageWidth>
      )}
      <ParticipantFilterSheet
        visible={sheetOpen}
        search={search}
        onChange={setSearch}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

function RowSeparator() {
  return <View className="h-sm" />;
}

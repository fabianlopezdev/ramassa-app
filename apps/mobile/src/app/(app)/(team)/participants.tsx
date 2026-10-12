/**
 * Quick participant lookup (RAPP-247): type a name, town or entity and open
 * her card. On a tablet the card opens beside the results. The full
 * participant screens (notes, activity, invites, deletion) are phase 3.
 */
import { AnnouncementEmptyState } from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ParticipantCard } from '@/components/participants/participant-card';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { continuousCorners } from '@/lib/continuous-corners';
import { LOOKUP_MIN_LENGTH, useParticipantLookup } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ParticipantListRow } from '@ramassa/shared/participants';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_ROWS: readonly ParticipantListRow[] = [];
const listContentStyle = {
  paddingHorizontal: tokens.spacing.lg,
  paddingBottom: tokens.spacing['3xl'],
} as const;
const listPaneStyle = { flex: 2, minWidth: 280, maxWidth: 400 } as const;
const detailPaneStyle = { flex: 3 } as const;
const keyExtractor = (row: ParticipantListRow) => row.id;

function ParticipantResult({
  row,
  onOpen,
  isSelected,
}: {
  readonly row: ParticipantListRow;
  readonly onOpen: (id: string) => void;
  readonly isSelected: boolean;
}) {
  const languageFontClass = useLanguageFontClass();
  const name = `${row.first_name} ${row.last_name}`;
  const detail = [row.city, row.reference_entity].filter(Boolean).join(' · ');
  return (
    <PressableScale
      testID={`participant-result-${row.id}`}
      accessibilityRole="button"
      accessibilityLabel={detail.length > 0 ? `${name}, ${detail}` : name}
      onPress={() => onOpen(row.id)}
      haptic="selection"
      isSelected={isSelected}
      style={continuousCorners}
      className={`min-h-recommended justify-center gap-xs rounded-md border bg-white px-md py-sm ${
        isSelected ? 'border-primary' : 'border-neutral-200'
      }`}
    >
      <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
        {name}
      </Text>
      {detail.length > 0 ? (
        <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>{detail}</Text>
      ) : null}
    </PressableScale>
  );
}

export default function ParticipantLookupScreen() {
  const { t } = useTranslation('participants');
  const { t: tNav } = useTranslation('nav');
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isSplit = useTeamLayout() === 'sidebar';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isFetching } = useParticipantLookup(query);
  const isSearching = query.trim().length >= LOOKUP_MIN_LENGTH;
  const rows = isSearching ? (data?.rows ?? EMPTY_ROWS) : EMPTY_ROWS;

  const open = useCallback(
    (id: string) => (isSplit ? setSelectedId(id) : push(`/participant/${id}` as Href)),
    [isSplit, push],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ParticipantListRow>) => (
      <ParticipantResult row={item} onOpen={open} isSelected={item.id === selectedId} />
    ),
    [open, selectedId],
  );

  const list = (
    <PageWidth className="flex-1">
      <View className="gap-sm px-lg pb-md pt-lg">
        <TeamBackToHome />
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
        >
          {tNav('team.participants')}
        </Text>
        <View className="flex-row items-center gap-sm">
          <TextInput
            testID="participant-search"
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={tokens.colors.neutral[600]}
            accessibilityLabel={t('searchLabel')}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            style={continuousCorners}
            className={`min-h-recommended flex-1 rounded-md border border-neutral-300 bg-white px-md text-md text-neutral-900 ${languageFontClass}`}
          />
          {isFetching ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null}
        </View>
      </View>
      {!isSearching ? (
        <Text
          className={`px-lg text-start text-md text-neutral-600 ${languageFontClass}`}
          testID="participant-lookup-start"
        >
          {t('lookupStart')}
        </Text>
      ) : rows.length === 0 && !isFetching ? (
        <AnnouncementEmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          languageFontClass={languageFontClass}
        />
      ) : (
        <FlashList
          accessibilityRole="list"
          accessibilityLabel={tNav('team.participants')}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={selectedId}
          contentContainerStyle={listContentStyle}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={ResultSeparator}
        />
      )}
    </PageWidth>
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit ? (
        <View className="flex-1 flex-row">
          <View style={listPaneStyle}>{list}</View>
          <View style={detailPaneStyle} className="border-s border-neutral-200 bg-white">
            {selectedId === null ? (
              <View className="flex-1 items-center justify-center p-lg">
                <Text className={`text-center text-md text-neutral-600 ${languageFontClass}`}>
                  {t('selectParticipant')}
                </Text>
              </View>
            ) : (
              <ParticipantCard key={selectedId} participantId={selectedId} />
            )}
          </View>
        </View>
      ) : (
        list
      )}
    </SafeAreaView>
  );
}

function ResultSeparator() {
  return <View className="h-sm" />;
}

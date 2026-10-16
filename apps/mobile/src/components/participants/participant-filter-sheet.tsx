/**
 * The participant list's filter sheet (RAPP-280): entity, nationality,
 * dependants and the sort order. Status sits on the list as chips, because it
 * is the filter used most. Nationality and dependants are Personal fields:
 * the sheet offers them only when the database returned options for them,
 * and the database ignores them for a caller who may not read them.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import type { ParticipantListSearch } from '@/lib/participant-filters';
import { useParticipantFilterOptions } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PARTICIPANT_SORT_COLUMNS, type ParticipantSortColumn } from '@ramassa/shared/participants';

const ALL = '__all__';

export const SORT_LABEL_KEYS: Readonly<Record<ParticipantSortColumn, string>> = {
  last_name: 'columnName',
  first_name: 'columnName',
  city: 'columnCity',
  nationality: 'columnNationality',
  reference_entity: 'columnEntity',
  created_at: 'columnJoined',
};

// First name and last name read the same in a picker; the list sorts by surname.
const SHEET_SORTS = PARTICIPANT_SORT_COLUMNS.filter((column) => column !== 'first_name');

function Group({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-sm"
      >
        {children}
      </View>
    </View>
  );
}

export function ParticipantFilterSheet({
  visible,
  search,
  onChange,
  onClose,
}: {
  readonly visible: boolean;
  readonly search: ParticipantListSearch;
  readonly onChange: (next: ParticipantListSearch) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const options = useParticipantFilterOptions().data;
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const set = (patch: Partial<ParticipantListSearch>) => onChange({ ...search, ...patch });

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" testID="participant-filter-sheet">
        <ScrollView contentContainerClassName="gap-lg p-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('list.filtersTitle')}
          </Text>
          {(options?.entities.length ?? 0) > 0 ? (
            <Group label={t('filterEntity')}>
              {[ALL, ...(options?.entities ?? [])].map((entity) => (
                <ChoiceOption
                  key={entity}
                  testID={`filter-entity-${entity}`}
                  value={entity}
                  label={entity === ALL ? t('optionAll') : entity}
                  selected={(search.entity ?? ALL) === entity}
                  onSelect={(value) => set({ entity: value === ALL ? null : value })}
                  languageFontClass={fontClass}
                />
              ))}
            </Group>
          ) : null}
          {(options?.nationalities.length ?? 0) > 0 ? (
            <Group label={t('filterNationality')}>
              {[ALL, ...(options?.nationalities ?? [])].map((nationality) => (
                <ChoiceOption
                  key={nationality}
                  testID={`filter-nationality-${nationality}`}
                  value={nationality}
                  label={nationality === ALL ? t('optionAll') : nationality}
                  selected={(search.nationality ?? ALL) === nationality}
                  onSelect={(value) => set({ nationality: value === ALL ? null : value })}
                  languageFontClass={fontClass}
                />
              ))}
            </Group>
          ) : null}
          {(options?.nationalities.length ?? 0) > 0 ? (
            <Group label={t('filterDependents')}>
              {(['all', 'with', 'without'] as const).map((choice) => (
                <ChoiceOption
                  key={choice}
                  testID={`filter-dependents-${choice}`}
                  value={choice}
                  label={
                    choice === 'all'
                      ? t('optionAll')
                      : t(choice === 'with' ? 'dependentsWith' : 'dependentsWithout')
                  }
                  selected={search.dependents === choice}
                  onSelect={(value) => set({ dependents: value })}
                  languageFontClass={fontClass}
                />
              ))}
            </Group>
          ) : null}
          <Group label={t('list.sortLabel')}>
            {SHEET_SORTS.map((column) => (
              <ChoiceOption
                key={column}
                testID={`filter-sort-${column}`}
                value={column}
                label={t(SORT_LABEL_KEYS[column])}
                selected={search.sort === column}
                onSelect={(value) => set({ sort: value })}
                languageFontClass={fontClass}
              />
            ))}
          </Group>
          <Group label={t('list.dirLabel')}>
            {(['asc', 'desc'] as const).map((dir) => (
              <ChoiceOption
                key={dir}
                testID={`filter-dir-${dir}`}
                value={dir}
                label={t(dir === 'asc' ? 'list.dirAsc' : 'list.dirDesc')}
                selected={search.dir === dir}
                onSelect={(value) => set({ dir: value })}
                languageFontClass={fontClass}
              />
            ))}
          </Group>
          <PressableScale
            testID="filter-done"
            accessibilityRole="button"
            accessibilityLabel={t('list.filtersDone')}
            onPress={onClose}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('list.filtersDone')}
            </Text>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

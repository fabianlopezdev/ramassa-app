/**
 * Data exports and the audit log on the phone (RAPP-401), as the web admin's
 * Data page. Exports, for the `export.*` holders: participants, attendance or
 * events the person may export, over an optional period, as a default export
 * or a full one with a reason and a confirmation. The step-up comes first,
 * then the CSV opens in the system share sheet. The audit log, for
 * `audit.view` holders: the entries newest first, filtered by action, target
 * type and period, a page at a time.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateField } from '@/components/content/date-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { teamScreens } from '@/lib/account-area';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useAuditLog, useDataExport } from '@/lib/team-data';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DATA_EXPORT_DATASETS, type DataExportRequest } from '@ramassa/shared/data-exports';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import type { PermissionCode } from '@ramassa/shared/permissions';

type Dataset = DataExportRequest['dataset'];

const DATASET_KEYS: Readonly<Record<Dataset, string>> = {
  participants: 'exportParticipants',
  custom_answers: 'exportCustomAnswers',
  attendance: 'exportAttendance',
  events: 'exportEvents',
};
const DATASET_PERMISSIONS: Readonly<Record<Dataset, readonly PermissionCode[]>> = {
  participants: ['export.participants', 'export.participants_sensitive'],
  // Answers to the questions staff added (RAPP-307), on the participants' permissions.
  custom_answers: ['export.participants', 'export.participants_sensitive'],
  attendance: ['export.attendance'],
  events: ['export.events'],
};
const REASON_MIN = 10;
const REASON_MAX = 500;

interface AuditFilters {
  readonly action: string;
  readonly targetType: string;
  readonly start: string;
  readonly end: string;
}

const NO_FILTERS: AuditFilters = { action: '', targetType: '', start: '', end: '' };

function Section({
  testID,
  title,
  intro,
  children,
}: {
  readonly testID?: string;
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      testID={testID}
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {intro === undefined ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{intro}</Text>
      )}
      {children}
    </View>
  );
}

function ActionButton({
  testID,
  label,
  onPress,
  isBusy = false,
  isDisabled = false,
  isPrimary = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isBusy?: boolean;
  readonly isDisabled?: boolean;
  readonly isPrimary?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      isDisabled={isDisabled}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        isPrimary
          ? isDisabled
            ? 'bg-neutral-200'
            : 'bg-primary'
          : 'border border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${
          isPrimary ? (isDisabled ? 'text-neutral-500' : 'text-white') : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

function Exports({ permissions }: { readonly permissions: ReadonlySet<PermissionCode> }) {
  const { t } = useTranslation('admin');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const datasets = DATA_EXPORT_DATASETS.filter((dataset) =>
    DATASET_PERMISSIONS[dataset].some((code) => permissions.has(code)),
  );
  const [dataset, setDataset] = useState<Dataset>(datasets[0] ?? 'participants');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  );
  const exportData = useDataExport(t('exportTitle'));
  // The database also asks for participants.view_sensitive for a full
  // participant export; the other datasets have no sensitive columns.
  const canExportFull =
    dataset !== 'participants' ||
    (permissions.has('export.participants_sensitive') &&
      permissions.has('participants.view_sensitive'));
  const canDefault = dataset !== 'participants' || permissions.has('export.participants');

  const run = (scope: 'default' | 'full') => {
    setNotice(null);
    exportData.mutate(
      {
        dataset,
        scope,
        ...(start === '' ? {} : { startDate: start }),
        ...(end === '' ? {} : { endDate: end }),
        ...(scope === 'full' ? { reason, confirmed: isConfirmed } : { confirmed: false }),
      },
      {
        onSuccess: (rows) => {
          playHaptic('success');
          setNotice({ ok: true, text: t('exportShared', { count: rows }) });
          if (scope === 'full') {
            setReason('');
            setIsConfirmed(false);
          }
        },
        onError: (error) => {
          playHaptic('error');
          const code = toAppError(error).code;
          setNotice({
            ok: false,
            text: code === 'AUTH-9' ? tErrors('AUTH-9') : t('exportFailed'),
          });
        },
      },
    );
  };

  return (
    <Section testID="data-exports" title={t('exportTitle')} intro={t('exportDescription')}>
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('exportDataset')}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {datasets.map((candidate) => (
          <ChoiceOption
            key={candidate}
            testID={`data-dataset-${candidate}`}
            value={candidate}
            label={t(DATASET_KEYS[candidate])}
            selected={candidate === dataset}
            onSelect={(next) => {
              setNotice(null);
              setDataset(next);
            }}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('exportPeriod')}
      </Text>
      <DateField
        testID="data-export-start"
        label={t('filterStartDate')}
        value={start}
        onChange={setStart}
      />
      <DateField
        testID="data-export-end"
        label={t('filterEndDate')}
        value={end}
        onChange={setEnd}
      />
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {t('exportPhoneNote')}
      </Text>

      {canDefault ? (
        <View className="gap-sm rounded-md bg-neutral-50 p-md">
          <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
            {t('exportDefaultTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('exportDefaultDescription')}
          </Text>
          <ActionButton
            testID="data-export-default"
            label={t('exportShare')}
            onPress={() => run('default')}
            isBusy={exportData.isPending}
            isDisabled={exportData.isPending}
            isPrimary
          />
        </View>
      ) : null}

      {canExportFull ? (
        <View className="gap-sm rounded-md border border-error p-md">
          <Text className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}>
            {t('exportFullTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('exportFullDescription')}
          </Text>
          <AuthTextField
            testID="data-export-reason"
            label={t('exportReason')}
            value={reason}
            onChangeText={setReason}
            maxLength={REASON_MAX}
            multiline
          />
          <View className="flex-row flex-wrap">
            <ChoiceOption
              testID="data-export-confirm"
              value="confirm"
              label={t('exportFullConfirm')}
              selected={isConfirmed}
              onSelect={() => setIsConfirmed((current) => !current)}
              languageFontClass={fontClass}
            />
          </View>
          <ActionButton
            testID="data-export-full"
            label={t('exportFullShare')}
            onPress={() => run('full')}
            isBusy={exportData.isPending}
            isDisabled={exportData.isPending || !isConfirmed || reason.trim().length < REASON_MIN}
          />
        </View>
      ) : null}

      {notice === null ? null : (
        <Text
          testID="data-export-notice"
          accessibilityLiveRegion="polite"
          className={`text-start text-sm ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
        >
          {notice.text}
        </Text>
      )}
    </Section>
  );
}

function AuditLog() {
  const { t, i18n } = useTranslation('admin');
  const fontClass = useLanguageFontClass();
  const [draft, setDraft] = useState<AuditFilters>(NO_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(NO_FILTERS);
  const audit = useAuditLog(
    {
      ...(applied.action.trim() === '' ? {} : { action: applied.action.trim() }),
      ...(applied.targetType.trim() === '' ? {} : { targetType: applied.targetType.trim() }),
      ...(applied.start === '' ? {} : { startDate: applied.start }),
      ...(applied.end === '' ? {} : { endDate: applied.end }),
    },
    true,
  );
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: MADRID_TIME_ZONE,
      }),
    [i18n.resolvedLanguage],
  );
  const rows = audit.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <Section testID="data-audit" title={t('auditTitle')} intro={t('auditRetention')}>
      <AuthTextField
        testID="audit-filter-action"
        label={t('auditAction')}
        value={draft.action}
        onChangeText={(action) => setDraft((current) => ({ ...current, action }))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={120}
      />
      <AuthTextField
        testID="audit-filter-target-type"
        label={t('auditTargetType')}
        value={draft.targetType}
        onChangeText={(targetType) => setDraft((current) => ({ ...current, targetType }))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={120}
      />
      <DateField
        testID="audit-filter-start"
        label={t('filterStartDate')}
        value={draft.start}
        onChange={(start) => setDraft((current) => ({ ...current, start }))}
      />
      <DateField
        testID="audit-filter-end"
        label={t('filterEndDate')}
        value={draft.end}
        onChange={(end) => setDraft((current) => ({ ...current, end }))}
      />
      <ActionButton
        testID="audit-filter-apply"
        label={t('auditApply')}
        onPress={() => setApplied(draft)}
      />
      {audit.isError ? (
        <Text className={`text-start text-md text-error ${fontClass}`}>{t('auditFailed')}</Text>
      ) : audit.data === undefined ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('auditLoading')}
        </Text>
      ) : rows.length === 0 ? (
        <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
          {t('auditEmpty')}
        </Text>
      ) : (
        <View className="gap-sm">
          {rows.map((row) => (
            <View
              key={row.id}
              testID={`audit-row-${row.id}`}
              style={continuousCorners}
              className="gap-xs rounded-md bg-neutral-50 p-md"
            >
              <View className="flex-row flex-wrap items-center justify-between gap-sm">
                <Text className="text-start text-md font-semibold text-neutral-900">
                  {row.action}
                </Text>
                <Text className={`text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                  {format.format(new Date(row.created_at))}
                </Text>
              </View>
              <Text className={`text-start text-sm text-neutral-800 ${fontClass}`}>
                {`${t('auditActor')}: ${row.actor_name}`}
              </Text>
              <Text className="text-start text-xs text-neutral-600">
                {`${row.target_type} ${row.target_id}`}
              </Text>
              {row.changes === null ? null : (
                <Text className="text-start text-xs text-neutral-600">
                  {JSON.stringify(row.changes)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
      {audit.hasNextPage ? (
        <ActionButton
          testID="audit-load-more"
          label={t('auditLoadMore')}
          onPress={() => void audit.fetchNextPage()}
          isBusy={audit.isFetchingNextPage}
          isDisabled={audit.isFetchingNextPage}
        />
      ) : null}
    </Section>
  );
}

export default function TeamDataScreen() {
  const { t: tCommon } = useTranslation('common');
  const { t: tNav } = useTranslation('nav');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { permissions } = useAccountAccess();
  const team = teamScreens(permissions);

  return (
    <SafeAreaView
      testID="team-data"
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
            testID="team-data-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {tNav('staff.data')}
          </Text>
          {team.dataExports ? <Exports permissions={permissions} /> : null}
          {team.auditLog ? <AuditLog /> : null}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}

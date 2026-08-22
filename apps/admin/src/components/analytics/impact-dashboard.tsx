import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import type { ImpactReport, ImpactReportFilters } from '@ramassa/shared/analytics';
import { resolveLocalizedText, type SupportedLanguage } from '@ramassa/shared/i18n';
import { ImpactReport as ImpactReportView } from './impact-report';

export interface ImpactCategoryOption {
  readonly id: string;
  readonly name: ImpactReport['categories'][number]['categoryName'];
}

export interface ImpactEntityOption {
  readonly id: string;
  readonly name: string;
}

export function ImpactDashboard({
  report,
  categoryOptions = report.availableFilters.categories,
  entityOptions = report.availableFilters.entities,
  onFiltersChange,
}: {
  readonly report: ImpactReport;
  readonly categoryOptions?: readonly ImpactCategoryOption[];
  readonly entityOptions?: readonly ImpactEntityOption[];
  readonly onFiltersChange: (filters: ImpactReportFilters) => void;
}) {
  const { t, i18n } = useTranslation('admin');
  const language = (i18n?.resolvedLanguage ?? 'ca') as SupportedLanguage;

  function submitFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const categoryId = String(data.get('categoryId') ?? '');
    const collaboratingEntityId = String(data.get('collaboratingEntityId') ?? '');
    onFiltersChange({
      startDate: String(data.get('startDate')),
      endDate: String(data.get('endDate')),
      ...(categoryId.length > 0 ? { categoryId } : {}),
      ...(collaboratingEntityId.length > 0 ? { collaboratingEntityId } : {}),
    });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form
        key={`${report.period.startDate}:${report.period.endDate}:${report.filters.categoryId ?? ''}:${report.filters.collaboratingEntityId ?? ''}`}
        className="impact-no-print grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2 xl:grid-cols-5"
        data-testid="impact-report-filters"
        onSubmit={submitFilters}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterStartDate')}
          <Input name="startDate" type="date" defaultValue={report.period.startDate} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterEndDate')}
          <Input name="endDate" type="date" defaultValue={report.period.endDate} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterCategory')}
          <select
            name="categoryId"
            defaultValue={report.filters.categoryId ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('filterAllCategories')}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {resolveLocalizedText(category.name, language)?.text ?? category.name.ca}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t('filterEntity')}
          <select
            name="collaboratingEntityId"
            defaultValue={report.filters.collaboratingEntityId ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('filterAllEntities')}</option>
            {entityOptions.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">{t('filterApply')}</Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            {t('impactPrint')}
          </Button>
        </div>
      </form>
      <ImpactReportView report={report} />
    </div>
  );
}

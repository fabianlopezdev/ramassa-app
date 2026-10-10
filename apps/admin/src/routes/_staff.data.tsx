import { RequireAuth } from '@/components/auth/require-auth';
import { DataExportWorkspace } from '@/components/data/data-export-workspace';
import { dataExportSearchSchema } from '@/lib/data-export-search';
import { DATA_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/data')({
  ssr: false,
  validateSearch: dataExportSearchSchema,
  component: DataPage,
});

function DataPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={DATA_PERMISSIONS}>
      <DataExportWorkspace
        search={search}
        onSearchChange={(next) => void navigate({ search: next })}
      />
    </RequireAuth>
  );
}

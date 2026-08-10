import { ServiceReviewDetail } from '@/components/content/service-review-detail';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchAdminService,
  fetchServiceCategories,
  fetchServiceReviewNotification,
} from '@ramassa/shared/services';
import { fetchServiceSubmissionComments } from '@ramassa/shared/services/entity';

const serviceReviewDetailSearchSchema = z.object({
  notification: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_staff/content/services/reviews/$serviceId')({
  ssr: false,
  validateSearch: serviceReviewDetailSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const [detail, categories, comments, notification] = await Promise.all([
      fetchAdminService(supabase, params.serviceId),
      fetchServiceCategories(supabase),
      fetchServiceSubmissionComments(supabase, params.serviceId),
      deps.notification === undefined
        ? Promise.resolve(null)
        : fetchServiceReviewNotification(supabase, deps.notification),
    ]);
    if (notification !== null && notification.serviceId !== params.serviceId) {
      throw new AppError('DB-1');
    }
    return { detail, categories, comments, notification };
  },
  component: ServiceReviewPage,
});

function ServiceReviewPage() {
  return <ServiceReviewDetail {...Route.useLoaderData()} />;
}

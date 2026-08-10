import type { Database } from '../types/database';

type CommentInsert = Database['public']['Tables']['service_submission_comments']['Insert'];
type NotificationInsert =
  Database['public']['Tables']['service_submission_notifications']['Insert'];

const ORGANIZATION_ID = '5eed0000-0000-4000-8000-000000000000';
const ENTITY_ID = '5eed0000-0000-4000-8000-000000000004';
const SERVICE_ID = '5eed0000-0000-4000-800a-000000000001';
const FIXTURE_TIMESTAMP = '2026-08-10T18:00:00+00:00';

export function buildServiceSubmissionComment(
  overrides: Partial<CommentInsert> = {},
): CommentInsert {
  return {
    id: '5eed0000-0000-4000-800d-000000000001',
    org_id: ORGANIZATION_ID,
    service_id: SERVICE_ID,
    author_id: ENTITY_ID,
    author_role: 'entity',
    body: 'Podem confirmar la data?',
    is_internal: false,
    created_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function buildServiceSubmissionNotification(
  overrides: Partial<NotificationInsert> = {},
): NotificationInsert {
  return {
    id: '5eed0000-0000-4000-800e-000000000001',
    org_id: ORGANIZATION_ID,
    service_id: SERVICE_ID,
    kind: 'published_edit',
    created_by: ENTITY_ID,
    created_at: FIXTURE_TIMESTAMP,
    read_at: null,
    read_by: null,
    ...overrides,
  };
}

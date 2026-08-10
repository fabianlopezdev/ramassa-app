import { expect, test } from 'bun:test';
import {
  buildServiceSubmissionComment,
  buildServiceSubmissionNotification,
} from './entity-service-factories';

test('entity service factories produce public comments and published-edit notifications', () => {
  expect(buildServiceSubmissionComment({ body: 'Dubte Àgora' })).toMatchObject({
    body: 'Dubte Àgora',
    author_role: 'entity',
    is_internal: false,
  });
  expect(buildServiceSubmissionNotification()).toMatchObject({
    kind: 'published_edit',
    read_at: null,
    read_by: null,
  });
});

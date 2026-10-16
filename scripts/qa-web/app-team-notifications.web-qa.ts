/**
 * Notifications in the app (RAPP-385), through the web build: a seeded
 * template's five languages are approved, a custom group shows exactly how
 * many participants and devices it reaches, the send goes out in each
 * recipient's language, the message is saved as a template, and the history
 * shows the send. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const TEMPLATE = '5eed0000-0000-4000-8033-000000000001';
const GROUP = '5eed0000-0000-4000-8034-000000000001';
const templateName = `App ${Date.now().toString(36)}`;
let sendId = '';

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

// Earlier specs let the local dispatcher prune the seed's fake push tokens,
// so the audience step would count fewer devices (see targeted-notifications).
test.beforeAll(() => {
  queryDatabase(`
    insert into public.push_tokens (id, user_id, token, platform, device_id)
    select
      ('5eed0000-0000-4000-8000-' || lpad((900 + ordinal)::text, 12, '0'))::uuid,
      profile.id,
      'ExponentPushToken[seed-' || lpad(ordinal::text, 4, '0') || ']',
      case when ordinal % 2 = 0 then 'android' else 'ios' end,
      'seed-device-' || lpad(ordinal::text, 4, '0')
    from (
      select id, right(id::text, 12)::int as ordinal
      from public.profiles
      where role = 'player' and id::text like '5eed0000-0000-4000-8000-%'
    ) as profile
    on conflict do nothing;
  `);
});

test.afterAll(() => {
  queryDatabase(`
    delete from public.audit_log
     where action = 'targeted_notification_sent' and target_id = nullif(${sql(sendId)}, '')::uuid;
    delete from public.push_publications
     where content_type = 'targeted_notification' and content_id = nullif(${sql(sendId)}, '')::uuid;
    delete from public.targeted_notification_sends where id = nullif(${sql(sendId)}, '')::uuid;
    delete from public.notification_templates where name = ${sql(templateName)};
  `);
});

async function openNotifications(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-notifications').click({ timeout: 30_000 });
  await expect(page.getByTestId(`notification-template-${TEMPLATE}`)).toBeVisible({
    timeout: 30_000,
  });
}

test('a reviewed template goes to an exact group in each language, then is saved again', async ({
  page,
}) => {
  await openNotifications(page);
  await page.getByTestId(`notification-template-${TEMPLATE}`).click();
  await expect(page.getByTestId('notification-title-source')).not.toHaveValue('');

  // Not before every language is approved.
  await page.getByTestId('notification-audience-kind-custom_group').click();
  await page.getByTestId(`notification-audience-value-${GROUP}`).click();
  await expect(page.getByTestId('notification-confirmation')).toHaveText(
    'Confirm send to 5 recipients on 5 devices.',
    { timeout: 30_000 },
  );
  await page.getByTestId('notification-send').click();
  await expect(page.getByTestId('notification-notice')).toHaveText(
    'Approve all four translations before sending or saving a template.',
  );

  await page.getByTestId('notification-title-approve-all').click();
  await page.getByTestId('notification-body-approve-all').click();
  await page.getByTestId('notification-send').click();
  await expect(page.getByTestId('notification-notice')).toHaveText(
    'Notification queued for delivery.',
    { timeout: 30_000 },
  );
  sendId = queryDatabase(`
    select id from public.targeted_notification_sends
     where created_at > now() - interval '5 minutes' order by created_at desc limit 1;
  `).trim();
  expect(
    queryDatabase(`
      select send.recipient_count || '|' || count(delivery.id) || '|' ||
             string_agg(delivery.language, ',' order by delivery.language)
        from public.targeted_notification_sends as send
        join public.push_publications as publication
          on publication.content_type = 'targeted_notification' and publication.content_id = send.id
        join public.push_deliveries as delivery on delivery.publication_id = publication.id
       where send.id = ${sql(sendId)}
       group by send.recipient_count;
    `).trim(),
  ).toBe('5|5|ar,ca,en,es,fa');
  await expect(page.getByTestId(`notification-history-${sendId}`)).toContainText('Recipients: 5', {
    timeout: 30_000,
  });

  await page.getByTestId('notification-template-name').fill(templateName);
  await page.getByTestId('notification-template-category-transactional').click();
  await page.getByTestId('notification-save-template').click();
  await expect(page.getByTestId('notification-notice')).toHaveText('Template saved.', {
    timeout: 30_000,
  });
  expect(
    queryDatabase(`
      select category || '|' || (select count(*) from jsonb_object_keys(title))
        from public.notification_templates where name = ${sql(templateName)};
    `).trim(),
  ).toBe('transactional|5');
});

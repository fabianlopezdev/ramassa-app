import { expect, test } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const runTag = `rapp59-${Date.now().toString(36)}`;
const templateName = `${runTag} <script>alert(59)</script> Наталія`;
const groupName = `مجموعة ${runTag} Наталія`;
const arabicParticipantId = '5eed0000-0000-4000-8000-000000000011';
const farsiParticipantId = '5eed0000-0000-4000-8000-000000000016';
const accentedParticipantId = '5eed0000-0000-4000-8000-000000000024';
let sendId = '';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

test.afterAll(() => {
  queryDatabase(`
    begin;
    delete from public.audit_log
     where action = 'targeted_notification_sent'
       and target_id = nullif(${sqlLiteral(sendId)}, '')::uuid;
    delete from public.push_publications
     where content_type = 'targeted_notification'
       and content_id = nullif(${sqlLiteral(sendId)}, '')::uuid;
    delete from public.targeted_notification_sends
     where id = nullif(${sqlLiteral(sendId)}, '')::uuid;
    delete from public.notification_templates where name = ${sqlLiteral(templateName)};
    delete from public.custom_notification_groups where name = ${sqlLiteral(groupName)};
    commit;
  `);
});

test('staff reviews a template, curates a group, confirms an exact audience, and sees history', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, STAFF_EMAIL);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page
    .getByTestId('notification-template-picker')
    .selectOption('5eed0000-0000-4000-8033-000000000001');
  await expect(page.getByTestId('notification-title-source')).toHaveValue(
    'Recordatori de l’entrenament setmanal',
  );
  await expect(page.getByTestId('notification-title-draft-ar')).toHaveValue(
    'تذكير بالتدريب الأسبوعي',
  );
  await page.getByTestId('notification-title-approve-all').click();
  await page.getByTestId('notification-body-approve-all').click();

  await page.getByLabel('Template name').fill(templateName);
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByText('Template saved.', { exact: true })).toBeVisible();
  expect(
    queryDatabase(
      `select (select count(*) from jsonb_object_keys(template.title)) || '|' || (template.title->>'ar')
         from public.notification_templates as template where template.name = ${sqlLiteral(templateName)}`,
    ),
  ).toBe('5|تذكير بالتدريب الأسبوعي');

  const arabicName = queryDatabase(
    `select first_name || ' ' || last_name from public.profiles where id = ${sqlLiteral(arabicParticipantId)}::uuid`,
  );
  expect(arabicName.length).toBeGreaterThan(2);
  await page.getByTestId('notification-group-search').fill(arabicName.slice(0, 2));
  await expect(page.getByTestId(`notification-group-member-${arabicParticipantId}`)).toBeVisible();

  const accentedName = queryDatabase(
    `select first_name || ' ' || last_name from public.profiles where id = ${sqlLiteral(accentedParticipantId)}::uuid`,
  );
  expect(accentedName).toContain('í');
  await page.getByTestId('notification-group-search').fill('maria');
  await expect(
    page.getByTestId(`notification-group-member-${accentedParticipantId}`),
  ).toBeVisible();

  await page.getByTestId('notification-group-search').fill('<script>alert(59)</script>');
  await expect(page.getByTestId('notification-group-empty')).toBeVisible();

  await page.getByTestId('notification-group-search').fill('');
  await page.getByLabel('Group name').fill(groupName);
  await page.getByTestId(`notification-group-member-${arabicParticipantId}`).check();
  await page.getByTestId(`notification-group-member-${farsiParticipantId}`).check();
  await page.getByRole('button', { name: 'Save group', exact: true }).click();
  await expect(page.getByText('Group saved.', { exact: true })).toBeVisible();
  expect(
    queryDatabase(
      `select count(*) from public.custom_notification_group_members as membership
       join public.custom_notification_groups as group_row on group_row.id = membership.group_id
       where group_row.name = ${sqlLiteral(groupName)}`,
    ),
  ).toBe('2');

  const savedGroupId = queryDatabase(
    `select id from public.custom_notification_groups where name = ${sqlLiteral(groupName)}`,
  );
  await page.goto('/dashboard');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(
    page
      .getByTestId('notification-template-picker')
      .locator('option')
      .filter({ hasText: templateName }),
  ).toHaveCount(1);
  await expect(page.getByTestId(`notification-group-${savedGroupId}`)).toContainText(groupName);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(
    page
      .getByTestId('notification-template-picker')
      .locator('option')
      .filter({ hasText: templateName }),
  ).toHaveCount(1);
  await expect(page.getByTestId(`notification-group-${savedGroupId}`)).toContainText(groupName);

  await page
    .getByTestId('notification-template-picker')
    .selectOption('5eed0000-0000-4000-8033-000000000001');
  await page.getByTestId('notification-title-approve-all').click();
  await page.getByTestId('notification-body-approve-all').click();

  await page.getByTestId('notification-audience-kind').selectOption('custom_group');
  await page
    .getByTestId('notification-audience-value')
    .selectOption('5eed0000-0000-4000-8034-000000000001');
  await expect(page.getByTestId('notification-confirmation')).toContainText(
    'Confirm send to 5 recipients on 5 devices.',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await expect(page.getByText('Notification queued for delivery.', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  sendId = queryDatabase(
    `select id from public.targeted_notification_sends
      where created_at > now() - interval '5 minutes'
      order by created_at desc limit 1`,
  );
  expect(sendId).not.toBe('');
  expect(
    queryDatabase(
      `select send.recipient_count || '|' || count(delivery.id) || '|' ||
              string_agg(delivery.language, ',' order by delivery.language)
         from public.targeted_notification_sends as send
         join public.push_publications as publication
           on publication.content_type = 'targeted_notification' and publication.content_id = send.id
         join public.push_deliveries as delivery on delivery.publication_id = publication.id
        where send.id = ${sqlLiteral(sendId)}
        group by send.recipient_count`,
    ),
  ).toBe('5|5|ar,ca,en,es,fa');
  await expect(page.getByTestId('notification-history')).toContainText('Recipients: 5');
});

test('an entity contact is routed away from targeted notifications', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/notifications');

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toBe('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('notification-template-picker')).toHaveCount(0);
});

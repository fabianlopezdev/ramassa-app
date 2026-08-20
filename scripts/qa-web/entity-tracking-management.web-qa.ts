import { expect, test, type Page } from '@playwright/test';
import {
  ENTITY_EMAIL,
  OTHER_ENTITY_EMAIL,
  queryDatabase,
  SEED_PASSWORD,
  signIn,
  signOut,
} from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const RUN_TAG = `rapp55${Date.now().toString(36)}`;
const ENTITY_NAME = `Fundació QA ${RUN_TAG}`;
const COLLABORATOR_EMAIL = `collaborator.${RUN_TAG}@example.test`;
const CREATED_PASSWORD = SEED_PASSWORD;
const MAILPIT_URL = 'http://127.0.0.1:54324';

let createdEntityId = '';
let collaboratorProfileId = '';
let createdReferralId = '';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function latestMagicLink(email: string): Promise<string> {
  let messageId = '';
  await expect
    .poll(async () => {
      const response = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      if (!response.ok) return '';
      const body = (await response.json()) as { messages?: Array<{ ID?: string }> };
      messageId = body.messages?.[0]?.ID ?? '';
      return messageId;
    })
    .not.toBe('');

  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`);
  const message = (await response.json()) as { HTML?: string; Text?: string };
  const content = `${message.HTML ?? ''}\n${message.Text ?? ''}`.replaceAll('&amp;', '&');
  const link = content
    .match(/https?:\/\/[^\s"'<>]+/g)
    ?.find((candidate) => candidate.includes('/auth/v1/verify'));
  if (link === undefined) throw new Error(`No magic link found for ${email}`);
  return link;
}

async function passwordLoginIsDenied(page: Page, email: string): Promise<boolean> {
  await signOut(page);
  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(usePassword).toBeVisible();
  await usePassword.click();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(CREATED_PASSWORD);
  await page.locator('button[type="submit"]').click();
  const refusal = page.getByText(
    /correu o contrasenya incorrectes|incorrect email or password|correo o contraseña incorrectos/i,
  );
  await expect(refusal).toBeVisible({ timeout: 20_000 });
  return true;
}

async function openCreatedEntity(page: Page): Promise<void> {
  await page.goto('/settings');
  await page
    .getByRole('combobox', { name: /select entity|selecciona una entitat|selecciona una entidad/i })
    .selectOption(createdEntityId);
}

test.describe.serial('entity tracking, impact, events and administration', () => {
  test.afterAll(() => {
    if (createdEntityId.length === 0) return;
    queryDatabase(`
      begin;
      delete from auth.refresh_tokens where user_id = nullif(${sqlLiteral(collaboratorProfileId)}, '');
      delete from auth.sessions where user_id = nullif(${sqlLiteral(collaboratorProfileId)}, '')::uuid;
      delete from public.audit_log
       where target_id in (
         nullif(${sqlLiteral(createdEntityId)}, '')::uuid,
         nullif(${sqlLiteral(collaboratorProfileId)}, '')::uuid
       );
      delete from public.entity_invitations
       where collaborating_entity_id = ${sqlLiteral(createdEntityId)}::uuid;
      delete from public.entity_referrals
       where id = nullif(${sqlLiteral(createdReferralId)}, '')::uuid;
      delete from public.profiles
       where id = nullif(${sqlLiteral(collaboratorProfileId)}, '')::uuid;
      delete from auth.identities
       where user_id = nullif(${sqlLiteral(collaboratorProfileId)}, '')::uuid;
      delete from auth.users
       where id = nullif(${sqlLiteral(collaboratorProfileId)}, '')::uuid;
      delete from public.collaborating_entities
       where id = ${sqlLiteral(createdEntityId)}::uuid;
      commit;
    `);
  });

  test('each entity sees only its own tracking, with exact impact and suppression', async ({
    page,
  }) => {
    await signIn(page, ENTITY_EMAIL);
    await page.goto('/portal');

    const expectedTracking = Number(
      queryDatabase(`
        select count(*) from public.entity_referrals
        where collaborating_entity_id = '5eed0000-0000-4000-8030-000000000001'
          and referred_profile_id is not null
      `),
    );
    const otherEntityName = queryDatabase(`
      select referred_first_name || ' ' || referred_last_name
      from public.entity_referrals
      where collaborating_entity_id = '5eed0000-0000-4000-8030-000000000002'
        and referred_profile_id is not null
      limit 1
    `);
    await expect(page.getByTestId('entity-tracking-row')).toHaveCount(expectedTracking);
    await expect(page.getByRole('columnheader', { name: /status|estat|estado/i })).toBeVisible();
    await expect(page.getByTestId('entity-impact-referred')).toContainText(
      String(expectedTracking),
    );
    await expect(page.getByText(otherEntityName, { exact: true })).toHaveCount(0);

    await signIn(page, OTHER_ENTITY_EMAIL);
    await page.goto('/portal');
    await expect(page.getByTestId('entity-impact-suppressed')).toBeVisible();
    await expect(page.getByTestId('entity-impact-referred')).toHaveCount(0);
    await expect(page.getByTestId('entity-trend-table')).toHaveCount(0);
  });

  test('entity events expose only published upcoming read-only records', async ({ page }) => {
    await signIn(page, ENTITY_EMAIL);
    await page.goto('/portal/events');
    const expectedCount = Number(
      queryDatabase(`
        select count(*) from public.events
        where status = 'published'
          and published_at <= now()
          and (expires_at is null or expires_at > now())
          and starts_at >= now()
      `),
    );
    await expect(page.getByTestId('entity-event-card')).toHaveCount(expectedCount);
    await expect(page.getByRole('button', { name: /sign up|inscriu|inscribir/i })).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
  });

  test('admin creates an entity and a collaborator accepts a real invitation', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/settings');
    await page.getByLabel(/entity name|nom de l'entitat|nombre de la entidad/i).fill(ENTITY_NAME);
    await page.getByRole('button', { name: /add entity|afegeix entitat|añadir entidad/i }).click();
    await expect(page.getByRole('status')).toContainText(
      /entity added|entitat afegida|entidad añadida/i,
    );

    createdEntityId = queryDatabase(
      `select id from public.collaborating_entities where name = ${sqlLiteral(ENTITY_NAME)}`,
    );
    expect(createdEntityId).not.toBe('');
    await expect(
      page.getByRole('combobox', {
        name: /select entity|selecciona una entitat|selecciona una entidad/i,
      }),
    ).toHaveValue(createdEntityId);

    await page.getByLabel(/first name|^nom$|^nombre$/i).fill('Núria');
    await page.getByLabel(/last name|cognoms|apellidos/i).fill(`Soler ${RUN_TAG}`);
    await page.getByLabel(/email|correu electrònic|correo electrónico/i).fill(COLLABORATOR_EMAIL);
    await page
      .getByRole('button', { name: /send invitation|envia la invitació|enviar invitación/i })
      .click();
    await expect(page.getByRole('status')).toContainText(
      /invitation sent|invitació enviada|invitación enviada/i,
    );

    collaboratorProfileId = queryDatabase(
      `select profile_id from public.entity_invitations where email = ${sqlLiteral(COLLABORATOR_EMAIL)}`,
    );
    expect(collaboratorProfileId).not.toBe('');
    queryDatabase(`
      update auth.users
      set encrypted_password = extensions.crypt(
        ${sqlLiteral(CREATED_PASSWORD)},
        extensions.gen_salt('bf')
      ), updated_at = now()
      where id = ${sqlLiteral(collaboratorProfileId)}::uuid
    `);

    const magicLink = await latestMagicLink(COLLABORATOR_EMAIL);
    const collaboratorContext = await browser.newContext({ locale: 'en-GB' });
    const collaboratorPage = await collaboratorContext.newPage();
    await collaboratorPage.goto(magicLink);
    await expect(collaboratorPage).toHaveURL(/\/portal(?:\/)?$/, { timeout: 30_000 });
    expect(
      queryDatabase(
        `select collaborating_entity_id from public.profiles where id = ${sqlLiteral(collaboratorProfileId)}::uuid`,
      ),
    ).toBe(createdEntityId);
    expect(
      queryDatabase(
        `select (accepted_at is not null)::text from public.entity_invitations
          where profile_id = ${sqlLiteral(collaboratorProfileId)}::uuid`,
      ),
    ).toBe('true');
    await expect(collaboratorPage.getByTestId('entity-impact-suppressed')).toBeVisible();

    await collaboratorPage.goto('/portal/referrals/new');
    await collaboratorPage.locator('#referral-first-name').fill('Samira');
    await collaboratorPage.locator('#referral-last-name').fill(`QA ${RUN_TAG}`);
    await collaboratorPage.locator('#referral-documentation').selectOption('in_progress');
    await collaboratorPage.getByTestId('referral-submit').click();
    await expect(collaboratorPage).toHaveURL(/\/portal\/referrals\/[0-9a-f-]+$/, {
      timeout: 30_000,
    });
    createdReferralId = queryDatabase(
      `select id from public.entity_referrals
        where collaborating_entity_id = ${sqlLiteral(createdEntityId)}::uuid
          and referred_last_name = ${sqlLiteral(`QA ${RUN_TAG}`)}`,
    );
    expect(createdReferralId).not.toBe('');
    expect(
      queryDatabase(
        `select entity_user_id || '|' || collaborating_entity_id
          from public.entity_referrals where id = ${sqlLiteral(createdReferralId)}::uuid`,
      ),
    ).toBe(`${collaboratorProfileId}|${createdEntityId}`);

    await collaboratorContext.close();
  });

  test('collaborator removal and entity deactivation deny access while history remains', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const activeContext = await browser.newContext({ locale: 'en-GB' });
    const activePage = await activeContext.newPage();
    await signIn(activePage, COLLABORATOR_EMAIL);
    await activePage.goto('/portal');
    await expect(activePage.getByTestId('entity-impact-suppressed')).toBeVisible();

    await signIn(page, ADMIN_EMAIL);
    await openCreatedEntity(page);
    await page
      .getByRole('button', { name: /remove access|retira l'accés|retirar acceso/i })
      .click();
    await expect(
      page.getByText(/will no longer be able|ja no podrà accedir|ya no podrá acceder/i),
    ).toBeVisible();
    expect(
      queryDatabase(
        `select is_active::text from public.profiles where id = ${sqlLiteral(collaboratorProfileId)}::uuid`,
      ),
    ).toBe('true');
    await page
      .getByRole('button', {
        name: /confirm access removal|confirma la retirada d'accés|confirmar retirada de acceso/i,
      })
      .click();
    await expect
      .poll(() =>
        queryDatabase(
          `select is_active::text from public.profiles where id = ${sqlLiteral(collaboratorProfileId)}::uuid`,
        ),
      )
      .toBe('false');
    await expect(page.getByRole('status')).toContainText(
      /collaborator access removed|accés de la col·laboradora retirat|acceso de la colaboradora retirado/i,
    );
    await activePage.reload();
    await expect(activePage.getByTestId('entity-impact-suppressed')).toHaveCount(0);

    await page
      .getByRole('button', { name: /restore access|restaura l'accés|restaurar acceso/i })
      .click();
    await expect
      .poll(() =>
        queryDatabase(
          `select is_active::text from public.profiles where id = ${sqlLiteral(collaboratorProfileId)}::uuid`,
        ),
      )
      .toBe('true');
    await expect(page.getByRole('status')).toContainText(
      /collaborator access restored|accés de la col·laboradora restaurat|acceso de la colaboradora restaurado/i,
    );
    const referralCountBefore = queryDatabase(
      `select count(*) from public.entity_referrals where collaborating_entity_id = ${sqlLiteral(createdEntityId)}::uuid`,
    );
    expect(referralCountBefore).toBe('1');
    await expect(page.getByTestId('managed-entity-referrals')).toContainText(referralCountBefore);
    await page
      .getByRole('button', { name: /deactivate entity|desactiva l'entitat|desactivar entidad/i })
      .click();
    await expect(
      page.getByText(
        /collaborators will lose access|col·laboradores perdran l'accés|colaboradoras perderán el acceso/i,
      ),
    ).toBeVisible();
    expect(
      queryDatabase(
        `select is_active::text from public.collaborating_entities where id = ${sqlLiteral(createdEntityId)}::uuid`,
      ),
    ).toBe('true');
    await page
      .getByRole('button', {
        name: /confirm entity deactivation|confirma la desactivació|confirmar desactivación de la entidad/i,
      })
      .click();
    await expect
      .poll(() =>
        queryDatabase(
          `select is_active::text from public.collaborating_entities where id = ${sqlLiteral(createdEntityId)}::uuid`,
        ),
      )
      .toBe('false');
    await expect(page.getByRole('status')).toContainText(
      /entity deactivated|entitat desactivada|entidad desactivada/i,
    );
    expect(
      queryDatabase(
        `select count(*) from public.entity_referrals where collaborating_entity_id = ${sqlLiteral(createdEntityId)}::uuid`,
      ),
    ).toBe(referralCountBefore);
    await expect(page.getByTestId('managed-entity-referrals')).toContainText(referralCountBefore);

    await activeContext.close();
    expect(await passwordLoginIsDenied(page, COLLABORATOR_EMAIL)).toBe(true);
  });
});

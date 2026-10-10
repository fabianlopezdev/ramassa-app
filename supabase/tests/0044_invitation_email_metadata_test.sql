-- Staff and entity invitations carry what the invitation email shows (RAPP-225).
-- Run with: bunx supabase test db
--
-- The auth server renders one template for every code email. While the
-- account's user metadata holds `invitation`, that template shows the
-- invitation wording (who invited her, to which organization and entity, in
-- which language). What these assertions defend:
--   1. A staff invitation and an entity invitation each write that key.
--   2. The language follows the organization, with Catalan for a language the
--      staff side does not offer.
--   3. Her first sign-in removes the key and keeps any other metadata, so later
--      code emails are the ordinary sign-in email.
--   4. Nobody can call the helper functions directly.

begin;
select plan(11);

create temporary table admin_name as
select concat_ws(' ', first_name, last_name) as full_name
from public.profiles where id = '5eed0000-0000-4000-8000-000000000001';

-- A staff invitation ----------------------------------------------------------------

update public.organizations set default_language = 'es'
where id = '5eed0000-0000-4000-8000-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ select * from public.invite_staff_member('invited.staff@example.test', 'Pau', 'Prova', 'staff') $$,
  'an admin invites a staff member'
);

reset role;

select is(
  (select raw_user_meta_data -> 'invitation' from auth.users where email = 'invited.staff@example.test'),
  jsonb_build_object(
    'kind', 'staff',
    'org_name', (select name from public.organizations where id = '5eed0000-0000-4000-8000-000000000000'),
    'inviter_name', (select full_name from admin_name),
    'language', 'es'
  ),
  'her account carries the invitation, in the organization language'
);

-- An entity invitation, in a language the staff side does not offer -------------------

update public.organizations set default_language = 'ar'
where id = '5eed0000-0000-4000-8000-000000000000';

set local role authenticated;
set local request.jwt.claims = '{"sub": "5eed0000-0000-4000-8000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ select * from public.invite_entity_collaborator(
       '5eed0000-0000-4000-8030-000000000001', 'invited.entity@example.test', 'Núria', 'Prova'
     ) $$,
  'an admin invites an entity collaborator'
);

reset role;

select is(
  (select raw_user_meta_data #>> '{invitation,kind}' from auth.users where email = 'invited.entity@example.test'),
  'entity',
  'the entity invitation says it is one'
);
select is(
  (select raw_user_meta_data #>> '{invitation,entity_name}' from auth.users where email = 'invited.entity@example.test'),
  'Creu Roja Osona',
  'and names the entity'
);
select is(
  (select raw_user_meta_data #>> '{invitation,language}' from auth.users where email = 'invited.entity@example.test'),
  'ca',
  'a language the staff side does not offer falls back to Catalan'
);

-- Her first sign-in ---------------------------------------------------------------------

update auth.users
   set raw_user_meta_data = raw_user_meta_data || '{"kept": true}'::jsonb
 where email = 'invited.staff@example.test';
update auth.users set last_sign_in_at = now() where email = 'invited.staff@example.test';

select ok(
  (select not (raw_user_meta_data ? 'invitation') from auth.users where email = 'invited.staff@example.test'),
  'her first sign-in removes the invitation, so later emails are ordinary sign-in emails'
);
select is(
  (select raw_user_meta_data -> 'kept' from auth.users where email = 'invited.staff@example.test'),
  'true'::jsonb,
  'and keeps her other metadata'
);

-- The helpers are internal ---------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'private.invitation_email_details(uuid, uuid, text, text)', 'execute'),
  'a signed-in user cannot read invitation details directly'
);
select ok(
  not has_function_privilege('authenticated', 'private.mark_staff_invitation_email()', 'execute'),
  'nor run the staff trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'private.clear_invitation_email_on_first_sign_in()', 'execute'),
  'nor the sign-in trigger function'
);

select * from finish();
rollback;

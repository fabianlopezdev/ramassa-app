-- Text and points blocks on every form screen (RAPP-770).
--
-- WHY
--
-- Phase 0 of moving the legal forms (the app terms, the season authorization)
-- onto the form builders. A screen of her Onboarding (an app screen or a
-- Ramassà screen) and a screen of a form the team created already take a
-- signature block among their fields and consents. Staff also need to show
-- her a text to read and a list of points, in their place among the rest, in
-- five languages. The app terms already draw both on their own screens; this
-- makes them blocks of any form, so the later phases can move those screens
-- onto the same engine.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `form_blocks` takes three kinds:
--        - `signature`: the text she accepts (`body`, Catalan required) and a
--          box she signs in, as before;
--        - `text`: a text she reads (`body`, Catalan required) under an
--          optional heading (`title`);
--        - `points`: one to eight points (`points`), each a title and a text,
--          by the same rule as the app terms' points (`private.form_points_valid`,
--          which `private.app_terms_content_valid` now reads too).
--      `settings` (an object, empty by default) holds what a later kind needs.
--      `private.form_block_content_valid` checks each row by its kind.
--   2. `save_form_block` takes the kind, the heading and the points. The
--      four-argument call stays and saves a signature, as before. A text or
--      points block goes on an Onboarding screen or a form she fills in; the
--      entity form keeps its signatures only. A hidden screen takes a text or
--      points block: it asks nothing.
--   3. Every reader that asks for a signature reads signature blocks only:
--      `private.unsigned_form_blocks`, `private.save_form_signatures`, the
--      walk-in tablet's `private.live_onboarding_blocks`, the block loop of
--      `complete_custom_form`, and `private.screen_must_show` (a text or
--      points block never keeps a screen from being hidden).
--   4. `intake_catalog` and `private.custom_form_content` send the kind, the
--      heading and the points. A form version published before this names no
--      kind: its blocks read as signatures.
--   5. The Onboarding setup file carries every block with its kind; a file
--      from before reads as signatures.
--   6. `remove_form_block` audits what it removed, the erasure registry names
--      the new kinds, and the setup import names a refused block plainly.
--
-- AN OLDER APP BUILD
--
-- It reads the kind of every block and leaves out a kind it does not know,
-- so it never draws a text or points block and never asks a signature for
-- one. The database asks signatures for signature blocks only, so she always
-- finishes. Her phone draws the new blocks from the next update.
--
-- Docs: https://www.postgresql.org/docs/current/sql-altertable.html
-- and https://www.postgresql.org/docs/current/ddl-constraints.html

-- 1. The kinds of block ------------------------------------------------------------------------------------

-- The points of a block or of the app terms' introduction: one to eight, each
-- a title and a text, in five languages with the Catalan written.
create or replace function private.form_points_valid(p_points jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_points) = 'array'
    and jsonb_array_length(p_points) between 1 and 8
    and not exists (
      select 1 from jsonb_array_elements(p_points) point
       where jsonb_typeof(point) <> 'object'
          or point - array['title', 'body'] <> '{}'::jsonb
          or not private.localized_text_valid(point -> 'title')
          or not private.localized_text_valid(point -> 'body')
          or length(btrim(coalesce(point -> 'title' ->> 'ca', ''))) = 0
          or length(btrim(coalesce(point -> 'body' ->> 'ca', ''))) = 0),
    false);
$$;
revoke all on function private.form_points_valid(jsonb) from public, anon, authenticated;

-- The app terms read the same points rule (RAPP-613): one rule for both.
create or replace function private.app_terms_content_valid(p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content - array['title', 'body', 'intro_title', 'intro', 'points', 'accept_label',
                          'media_label', 'media_hint'] = '{}'::jsonb
    and (select bool_and(
           private.localized_text_valid(p_content -> field)
           and length(btrim(coalesce(p_content -> field ->> 'ca', ''))) > 0)
           from unnest(array['title', 'body', 'intro_title', 'intro', 'accept_label',
                             'media_label', 'media_hint']) field)
    and private.form_points_valid(p_content -> 'points'),
    false);
$$;

-- What a block holds, by its kind.
create or replace function private.form_block_content_valid(
  p_kind text, p_body jsonb, p_title jsonb, p_points jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(case p_kind
    when 'signature' then
      private.catalan_text_valid(p_body) and p_title is null and p_points is null
    when 'text' then
      private.catalan_text_valid(p_body) and p_points is null
      and (p_title is null or private.localized_text_valid(p_title))
    when 'points' then
      p_body is null and p_title is null and private.form_points_valid(p_points)
    else false end, false);
$$;
revoke all on function private.form_block_content_valid(text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

alter table public.form_blocks
  add column title jsonb,
  add column points jsonb,
  add column settings jsonb not null default '{}'::jsonb;
alter table public.form_blocks alter column body drop not null;
alter table public.form_blocks
  drop constraint form_blocks_kind_check,
  drop constraint form_blocks_body_check,
  add constraint form_blocks_kind_check check (kind in ('signature', 'text', 'points')),
  add constraint form_blocks_content_valid check (private.form_block_content_valid(kind, body, title, points)),
  add constraint form_blocks_settings_object check (jsonb_typeof(settings) = 'object');

comment on table public.form_blocks is
  'A block of a form (RAPP-690, RAPP-770): a signature with the text to accept, a text to read, or a list of points, on an Onboarding screen, a form''s screen or the entity form.';
comment on column public.form_blocks.body is
  'The text in five languages, Catalan required: what she accepts (signature) or reads (text). Null on a points block.';
comment on column public.form_blocks.title is
  'A text block''s heading in five languages (RAPP-770); null when it has none.';
comment on column public.form_blocks.points is
  'A points block''s points (RAPP-770): one to eight, each {title, body} in five languages, as the app terms'' points.';
comment on column public.form_blocks.settings is
  'What a kind of block needs beyond its texts (RAPP-770); empty today.';

-- 2. Saving a block ----------------------------------------------------------------------------------------

-- Adds a block (`p_id` null) or saves its texts. A block keeps its kind and
-- stays where it was added.
create or replace function public.save_form_block(
  p_id uuid, p_surface text, p_screen_key text, p_kind text, p_body jsonb, p_title jsonb, p_points jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  block_kind text := coalesce(p_kind, 'signature');
  block_body jsonb := private.json_value_or_null(p_body);
  block_title jsonb := private.json_value_or_null(p_title);
  block_points jsonb := private.json_value_or_null(p_points);
  form_id uuid;
  saved_id uuid;
begin
  if block_kind not in ('signature', 'text', 'points') then
    raise check_violation using message = 'a block is a signature, a text or points';
  end if;
  if not private.form_block_content_valid(block_kind, block_body, block_title, block_points) then
    raise check_violation using message = case block_kind
      when 'signature' then 'a signature needs its text in Catalan'
      when 'text' then 'a text needs its text in Catalan'
      else 'points need a title and a text in Catalan, one to eight of them' end;
  end if;
  if p_id is null then
    if p_surface is null or p_surface not in ('onboarding', 'entity_form', 'custom_form') then
      raise check_violation using message = 'a block goes on an onboarding screen, the entity form or a form';
    end if;
    if p_surface = 'entity_form' and block_kind <> 'signature' then
      raise check_violation using message = 'the entity form holds signature blocks only';
    end if;
    if p_surface = 'onboarding' then
      -- An app screen or one of the app's follow-ups (RAPP-720).
      if p_screen_key is null or not (
           private.is_onboarding_app_screen(p_screen_key)
           or (private.is_uuid_text(p_screen_key)
               and exists (select 1 from public.intake_screens s
                            where s.id = p_screen_key::uuid and s.org_id = actor_org
                              and not s.is_archived))) then
        raise no_data_found using message = 'no such screen';
      end if;
    elsif p_surface = 'custom_form' then
      form_id := private.custom_form_of_screen(actor_org, p_screen_key);
      if form_id is null then
        raise no_data_found using message = 'no such screen';
      end if;
      if exists (select 1 from public.custom_forms f where f.id = form_id and f.filled_by <> 'player') then
        raise check_violation using message = 'a block goes on a form she fills in';
      end if;
    elsif p_screen_key is not null then
      raise check_violation using message = 'only an onboarding block names a screen';
    end if;
    -- A text or points block asks nothing, so a hidden screen takes one.
    if block_kind = 'signature' and private.screen_is_hidden(actor_org, p_surface, p_screen_key) then
      raise check_violation using message = 'a hidden screen holds no signature';
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, custom_form_id, kind, body, title, points, sort_order)
    values (actor_org, p_surface, p_screen_key, form_id, block_kind, block_body, block_title, block_points,
            private.next_form_position(actor_org, p_surface, p_screen_key))
    returning id into saved_id;
  else
    update public.form_blocks b
       set body = block_body, title = block_title, points = block_points, updated_at = now()
     where b.id = p_id and b.org_id = actor_org and b.kind = block_kind
    returning b.id into saved_id;
    if saved_id is null then
      raise no_data_found using message = 'no such block';
    end if;
  end if;
  -- The texts as saved, every time: the audit log is the history of the block.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_save', 'form_block', saved_id,
          jsonb_build_object('created', p_id is null, 'kind', block_kind, 'body', block_body,
                             'title', block_title, 'points', block_points));
  return saved_id;
end;
$$;
revoke all on function public.save_form_block(uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_block(uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated;

-- The call from before RAPP-770: a signature block and its text.
create or replace function public.save_form_block(p_id uuid, p_surface text, p_screen_key text, p_body jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.save_form_block(p_id, p_surface, p_screen_key, 'signature', p_body, null, null);
$$;

-- 3. Only a signature block asks for a signature -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.unsigned_form_blocks(p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(b.id order by b.screen_key, b.sort_order), array[]::uuid[])
    from public.form_blocks b
   where b.org_id = p_org_id
     -- A text or points block asks nothing (RAPP-770).
     and b.kind = 'signature'
     and b.surface = case p_surface when 'wizard' then 'onboarding' else 'entity_form' end
     and (b.surface <> 'onboarding'
          or not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived))
     -- A block on a screen that does not open for her is not asked (RAPP-715).
     and (b.surface <> 'onboarding' or p_profile_id is null
          or private.screen_opens_for(p_profile_id, b.org_id, 'onboarding', b.screen_key))
     and not exists (
       select 1 from public.form_signatures g
        where g.block_id = b.id
          -- The text she signed is still the block's text in the language she read (RAPP-691).
          and g.body = b.body ->> g.language
          and case p_surface when 'wizard' then g.profile_id = p_profile_id
                             else g.referral_id = p_referral_id end);
$function$;

create or replace function private.save_form_signatures(
  p_org_id uuid, p_surface text, p_profile_id uuid, p_referral_id uuid, p_signer uuid,
  p_signer_name text, p_signatures jsonb, p_custom_form_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry record;
  block public.form_blocks;
  shown_language text;
  shown text;
  saved integer := 0;
begin
  if p_signatures is null or p_signatures = 'null'::jsonb then
    return 0;
  end if;
  if jsonb_typeof(p_signatures) <> 'object' then
    raise check_violation using message = 'signatures are sent by block';
  end if;
  for entry in select key, value from jsonb_each(p_signatures) loop
    if not private.is_uuid_text(entry.key) or jsonb_typeof(entry.value) <> 'object'
       or entry.value - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(entry.value -> 'strokes')
       or coalesce(entry.value ->> 'language', '') not in ('ca', 'es', 'en', 'ar', 'fa') then
      raise check_violation using message = 'a signature is its strokes and the language it was shown in';
    end if;
    block := null;
    -- Only a signature block takes a signature (RAPP-770); any other is left out.
    select * into block from public.form_blocks b
     where b.id = entry.key::uuid and b.org_id = p_org_id and b.kind = 'signature'
       and b.surface = case p_surface when 'wizard' then 'onboarding'
                                      when 'custom_form' then 'custom_form' else 'entity_form' end
       and (p_surface <> 'custom_form' or b.custom_form_id = p_custom_form_id);
    if block.id is null then
      continue;
    end if;
    shown_language := case when length(btrim(coalesce(block.body ->> (entry.value ->> 'language'), ''))) > 0
                           then entry.value ->> 'language' else 'ca' end;
    shown := block.body ->> shown_language;
    insert into public.form_signatures (
      org_id, profile_id, referral_id, surface, block_id, screen_key, body, language,
      signer_kind, signer_user_id, signer_name, strokes, custom_form_id)
    values (
      p_org_id, p_profile_id, p_referral_id, p_surface, block.id, block.screen_key, shown, shown_language,
      case when p_surface in ('wizard', 'custom_form') then 'player' else 'entity' end, p_signer,
      coalesce(nullif(btrim(p_signer_name), ''), '-'), entry.value -> 'strokes',
      case when p_surface = 'custom_form' then p_custom_form_id end);
    saved := saved + 1;
  end loop;
  return saved;
end;
$$;

-- The walk-in tablet asks the signature blocks of the live screens (RAPP-691).
create or replace function private.live_onboarding_blocks(p_org_id uuid)
returns setof public.form_blocks
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.form_blocks b
   where b.org_id = p_org_id and b.surface = 'onboarding' and b.kind = 'signature'
     and (not private.is_uuid_text(b.screen_key)
          or exists (select 1 from public.intake_screens s
                      where s.id = b.screen_key::uuid and s.org_id = b.org_id and not s.is_archived));
$$;

-- What keeps a screen shown (RAPP-711): a required field or consent, or a
-- signature block. A text or points block asks nothing, so staff may still
-- hide its screen (RAPP-770).
create or replace function private.screen_must_show(p_org_id uuid, p_surface text, p_screen_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_screen_key is not null and (
    exists (select 1 from public.field_placements p
              join public.profile_fields f on f.id = p.field_id and not f.is_archived
             where p.org_id = p_org_id and p.surface = p_surface and p.screen_key = p_screen_key
               and p.required)
    or exists (select 1 from public.consent_placements p
                 join public.consents c on c.id = p.consent_id and not c.is_archived
                where p.org_id = p_org_id and p.surface = p_surface and p.screen_key = p_screen_key
                  and p.required)
    or exists (select 1 from public.form_blocks b
                where b.org_id = p_org_id and b.surface = p_surface and b.screen_key = p_screen_key
                  and b.kind = 'signature'));
$$;

-- 4. What her phone and the team read ----------------------------------------------------------------------

-- A form's content, as each published version keeps it: every block with its kind.
CREATE OR REPLACE FUNCTION private.custom_form_content(p_form_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', f.name, 'mandatory', f.mandatory, 'deadline', f.deadline,
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'intro', s.intro,
                                          'sort_order', s.sort_order,
                                          -- The answer that opens it (RAPP-715).
                                          'show_when_field_id', s.show_when_field_id,
                                          'show_when_values', to_jsonb(s.show_when_values))
                       order by s.sort_order, s.created_at)
        from public.custom_form_screens s
       where s.form_id = f.id and not s.is_archived
         -- A hidden screen, and the follow-ups of a hidden screen, are left out.
         and not private.screen_is_hidden(f.org_id, 'custom_form', s.id::text)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required, 'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order)
        from public.field_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'screen_key', b.screen_key, 'kind', b.kind,
                                          'body', b.body, 'title', b.title, 'points', b.points,
                                          'sort_order', b.sort_order)
                       order by b.screen_key, b.sort_order)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = f.id
         and private.custom_form_screen_live(b.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', b.screen_key)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'consent_id', p.consent_id, 'screen_key', p.screen_key,
                                          'sort_order', p.sort_order, 'required', p.required)
                       order by p.screen_key, p.sort_order)
        from public.consent_placements p
       where p.surface = 'custom_form' and p.custom_form_id = f.id
         and private.custom_form_screen_live(p.screen_key)
         and not private.screen_is_hidden(f.org_id, 'custom_form', p.screen_key)), '[]'::jsonb))
    from public.custom_forms f where f.id = p_form_id;
$function$;

-- Her answers to a form: only its signature blocks ask for a signature.
CREATE OR REPLACE FUNCTION public.complete_custom_form(p_response_id uuid, payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  response public.custom_form_responses;
  form public.custom_forms;
  live public.custom_form_versions;
  content jsonb;
  shown_language text;
  ticks jsonb := coalesce(nullif(payload -> 'consents', 'null'::jsonb), '{}'::jsonb);
  signatures jsonb := coalesce(nullif(payload -> 'signatures', 'null'::jsonb), '{}'::jsonb);
  block jsonb;
  given jsonb;
  block_language text;
  asked record;
begin
  select * into her from public.profiles where id = caller;
  select * into response from public.custom_form_responses where id = p_response_id for update;
  if her.id is null or her.role <> 'player' or response.id is null or response.profile_id <> caller then
    raise insufficient_privilege using message = 'a form is answered by the player it asks';
  end if;
  select * into form from public.custom_forms where id = response.form_id;
  select * into live from private.custom_form_live_version(form.id);
  if form.filled_by <> 'player' or form.is_archived or live.id is null then
    raise insufficient_privilege using message = 'this form is not asked now';
  end if;
  if response.status <> 'pending' then
    raise check_violation using message = 'the form is already answered';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
     or payload - array['answers', 'signatures', 'consents', 'language'] <> '{}'::jsonb
     or jsonb_typeof(ticks) <> 'object' or jsonb_typeof(signatures) <> 'object' then
    raise invalid_parameter_value
      using message = 'complete_custom_form takes her answers by field, her signatures, her consents and her language';
  end if;
  content := live.content;
  shown_language := case when payload ->> 'language' in ('ca', 'es', 'en', 'ar', 'fa')
                         then payload ->> 'language' else her.preferred_language end;

  perform private.write_field_answers(caller, coalesce(nullif(payload -> 'answers', 'null'::jsonb), '{}'::jsonb),
                                      'player', null, true);
  perform private.apply_document_rule(caller, true, true);

  -- Every required field the version asks has an answer (shown on its condition).
  if exists (
    select 1
      from jsonb_array_elements(content -> 'placements') p
      join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived
     where (p ->> 'required')::boolean
       -- Only on a screen that opens for her (RAPP-715).
       and private.content_screen_opens(caller, content, p ->> 'screen_key')
       and (f.show_when_field_id is null or exists (
             select 1 from public.profile_fields gate
              where gate.id = f.show_when_field_id
                and private.field_answer_now(caller, gate) = to_jsonb(f.show_when_option_id::text)))
       and private.field_answer_now(caller, f) is null
  ) then
    raise not_null_violation using message = 'complete_custom_form requires an answer to a required question';
  end if;

  -- Every signature block, with the text the version published. A text or
  -- points block asks nothing (RAPP-770); a version published before names
  -- no kind, and its blocks are signatures.
  for block in select value from jsonb_array_elements(content -> 'blocks')
                where coalesce(value ->> 'kind', 'signature') = 'signature'
                  and private.content_screen_opens(caller, content, value ->> 'screen_key') loop
    given := signatures -> (block ->> 'id');
    if given is null or jsonb_typeof(given) <> 'object'
       or given - array['strokes', 'language'] <> '{}'::jsonb
       or not private.app_signature_valid(given -> 'strokes') then
      raise not_null_violation using message = 'complete_custom_form requires her signature on every signature block';
    end if;
    block_language := case when length(btrim(coalesce(block -> 'body' ->> (given ->> 'language'), ''))) > 0
                           then given ->> 'language' else 'ca' end;
    insert into public.form_signatures (
      org_id, profile_id, surface, block_id, screen_key, body, language, signer_kind,
      signer_user_id, signer_name, strokes, custom_form_id)
    values (
      her.org_id, caller, 'custom_form',
      (select b.id from public.form_blocks b where b.id = (block ->> 'id')::uuid),
      block ->> 'screen_key', block -> 'body' ->> block_language, block_language, 'player', caller,
      coalesce(nullif(concat_ws(' ', private.name_answer_text(caller, 'first_name'),
                                     private.name_answer_text(caller, 'last_name')), ''), '-'),
      given -> 'strokes', form.id);
  end loop;

  -- Her ticks of the consents the version asks, each recorded with its text.
  if exists (select 1 from jsonb_each(ticks) t
              where jsonb_typeof(t.value) <> 'boolean'
                 or not exists (
                   select 1 from jsonb_array_elements(content -> 'consent_placements') p
                     join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
                    where c.key = t.key)) then
    raise check_violation using message = 'her consents are ticks of the consents the form asks';
  end if;
  for asked in
    select c.id, c.key, c.body, (p ->> 'required')::boolean as required, p ->> 'screen_key' as screen_key
      from jsonb_array_elements(content -> 'consent_placements') p
      join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived
     where private.content_screen_opens(caller, content, p ->> 'screen_key')
     order by p ->> 'screen_key', (p ->> 'sort_order')::integer
  loop
    if asked.required and (ticks -> asked.key) is distinct from 'true'::jsonb then
      raise check_violation using message = 'every required consent must be given';
    end if;
    insert into public.consent_events
      (org_id, profile_id, consent_id, consent_key, granted, method, language, wording, required,
       form, screen_key, custom_form_id)
    values (her.org_id, her.id, asked.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), 'app',
            shown_language, private.localized_text_in(asked.body, shown_language), asked.required,
            'custom_form', asked.screen_key, form.id);
    perform private.apply_consent_effects(her.id, asked.key, coalesce((ticks ->> asked.key)::boolean, false), her.id);
  end loop;

  update public.custom_form_responses
     set status = 'done', answered_at = now(), answered_by = caller, filled_by = 'player',
         version = live.version
   where id = response.id;
end;
$function$;

-- The catalog: every block with its kind, its heading and its points.
create or replace function public.intake_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
  reads_team_forms boolean := with_archived or (select public.has_permission('participants.view'));
  forms_shown uuid[];
  forms_json jsonb;
  form_placements_json jsonb;
  form_blocks_json jsonb;
  form_consents_json jsonb;
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  if reads_team_forms then
    -- The team reads each form's draft, and designers its published versions.
    select coalesce(array_agg(f.id), array[]::uuid[]) into forms_shown
      from public.custom_forms f
     where f.org_id = actor_org and (with_archived or not f.is_archived);
    forms_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'filled_by', f.filled_by, 'mandatory', f.mandatory,
        'deadline', f.deadline,
        -- What an older build reads (RAPP-700).
        'appears', case when f.audience = 'chosen' then 'sent'
                        when f.repeats_each_season then 'every_season' else 'once' end,
        'audience', f.audience, 'repeats_each_season', f.repeats_each_season,
        'recipient_count', (select count(*) from public.custom_form_recipients r where r.form_id = f.id),
        'version', f.version, 'published_at', f.published_at, 'is_archived', f.is_archived,
        'versions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'version', v.version, 'season_id', v.season_id, 'is_correction', v.is_correction,
            'published_at', v.published_at) order by v.version desc)
            from public.custom_form_versions v where v.form_id = f.id), '[]'::jsonb),
        'screens', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'title', s.title, 'intro', s.intro, 'sort_order', s.sort_order,
            'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
            order by s.sort_order, s.created_at)
            from public.custom_form_screens s
           where s.form_id = f.id and not s.is_archived), '[]'::jsonb))
        order by f.created_at, f.id)
        from public.custom_forms f where f.id = any (forms_shown)), '[]'::jsonb);
    form_placements_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id and not f.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_blocks_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'custom_form_id', b.custom_form_id,
        'kind', b.kind, 'body', b.body, 'title', b.title, 'points', b.points,
        'sort_order', b.sort_order)
        order by b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b
       where b.surface = 'custom_form' and b.custom_form_id = any (forms_shown)), '[]'::jsonb);
    form_consents_json := coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'custom_form_id', p.custom_form_id, 'sort_order', p.sort_order, 'required', p.required)
        order by p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.surface = 'custom_form' and p.custom_form_id = any (forms_shown)), '[]'::jsonb);
  else
    -- She reads the published version of each live form she fills in (RAPP-701).
    with live as (
      select f.id, f.audience, f.repeats_each_season, f.published_at, v.version, v.content
        from public.custom_forms f
        cross join lateral private.custom_form_live_version(f.id) v
       where f.org_id = actor_org and f.filled_by = 'player' and not f.is_archived)
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.content -> 'name', 'filled_by', 'player',
        'mandatory', l.content ->> 'mandatory', 'deadline', l.content -> 'deadline',
        'appears', case when l.audience = 'chosen' then 'sent'
                        when l.repeats_each_season then 'every_season' else 'once' end,
        'audience', l.audience, 'repeats_each_season', l.repeats_each_season,
        'version', l.version, 'published_at', l.published_at, 'is_archived', false,
        'screens', l.content -> 'screens')), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'placements') p
          join public.profile_fields f on f.id = (p ->> 'field_id')::uuid and not f.is_archived), '[]'::jsonb),
      coalesce((
        -- A version published before RAPP-770 names no kind: its blocks are signatures.
        select jsonb_agg(b || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id,
                                                 'kind', coalesce(b ->> 'kind', 'signature')))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'blocks') b), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p || jsonb_build_object('surface', 'custom_form', 'custom_form_id', l2.id))
          from live l2
          cross join lateral jsonb_array_elements(l2.content -> 'consent_placements') p
          join public.consents c on c.id = (p ->> 'consent_id')::uuid and not c.is_archived), '[]'::jsonb)
      into forms_json, form_placements_json, form_blocks_json, form_consents_json
      from live l;
  end if;
  return jsonb_build_object(
    -- Ramassà screens. The fields each one asks are its placements, below.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
            -- The answer that opens it (RAPP-715); null: it always shows.
            'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    -- The app's questions as staff worded or hid them (RAPP-666): the wording
    -- of the question's first field on her onboarding, and hidden when that
    -- field is placed nowhere on it.
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', q.question, 'label', p.label_override, 'help', p.help_override,
        'is_hidden', p.id is null) order by q.question)
        from unnest(private.wizard_intake_questions()) q(question)
        join public.profile_fields f
          on f.org_id = actor_org and f.system_key = private.question_system_key(q.question)
        left join public.field_placements p on p.field_id = f.id and p.surface = 'onboarding'
       where p.id is null or p.label_override is not null or p.help_override is not null), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Staff wording of the built-in screens and their hide switch (RAPP-612).
    -- A hide counts only while none of the screen's questions is required.
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'screen', b.screen, 'texts', b.texts,
        'is_deleted', b.is_deleted,
        'is_hidden', b.is_deleted or (b.is_hidden and private.builtin_screen_hideable(b.screen)))
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    -- The wizard steps as staff arranged them (RAPP-612); null is the app's order.
    'flow_order', (
      select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    -- The built-in questions that need an answer (RAPP-611): the one list her
    -- phone, her summary and the staff preview read.
    'required_questions', to_jsonb(private.required_intake_questions(actor_org)),
    -- The app terms she accepts (RAPP-613): the current published version,
    -- or the draft for a test player when there is one (RAPP-619).
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content,
                                'is_draft', v.published_at is null)
        from private.app_terms_version_for(actor_org, (select auth.uid())) v
       where v.id is not null),
    -- The profile layout (RAPP-649): sections, fields and where each is asked.
    -- Who created a field, and whether it has answers (which fixes its
    -- privacy level), only for the people who design it.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'read_permission', f.read_permission,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived, 'created_at', f.created_at,
        'created_by', case when with_archived then f.created_by end,
        'created_by_name', case when with_archived then (
          select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
            from public.profiles p where p.id = f.created_by) end,
        'has_answers', case when with_archived then private.field_has_answers(f.id) end,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        order by f.sort_order, f.created_at)
        from public.profile_fields f
       where f.org_id = actor_org and (with_archived or not f.is_archived)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface <> 'custom_form'
         and (with_archived or not f.is_archived)), '[]'::jsonb),
    -- The blocks of each screen and of the entity form (RAPP-690), in the
    -- order they share with the placements.
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind,
        'body', b.body, 'title', b.title, 'points', b.points, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): the consents and where each is asked.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.created_at, c.key)
        from public.consents c
       where c.org_id = actor_org and (with_archived or not c.is_archived)), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'consent_id', p.consent_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required)
        order by p.surface, p.screen_key, p.sort_order, p.created_at)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id and not c.is_archived
       where p.org_id = actor_org and p.surface <> 'custom_form'), '[]'::jsonb),
    -- The forms the team created (RAPP-700, RAPP-701), with their screens in order.
    'custom_forms', forms_json,
    'custom_form_placements', form_placements_json,
    'custom_form_blocks', form_blocks_json,
    'custom_form_consent_placements', form_consents_json
  );
end;
$function$;

-- 5. The Onboarding setup file ------------------------------------------------------------------------------

create or replace function public.export_onboarding_setup(p_app_commit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  document jsonb;
begin
  if not (select private.can_design_onboarding()) or actor_org is null then
    raise insufficient_privilege using message = 'exporting the onboarding setup needs settings.organization or onboarding.design';
  end if;
  if p_app_commit is not null and p_app_commit !~ '^[0-9A-Za-z._-]{1,64}$' then
    raise check_violation using message = 'the app commit is a short version name';
  end if;

  document := jsonb_build_object(
    'format', 'ramassa.onboarding-setup',
    'schema_version', 3,
    'app_commit', p_app_commit,
    'exported_at', now(),
    -- The profile layout (RAPP-649): sections, every field with its options, and
    -- where each is asked. Version 3 (RAPP-656) carries nothing else about them.
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'key', s.key, 'title', s.title, 'sort_order', s.sort_order, 'is_builtin', s.is_builtin)
        order by s.sort_order, s.created_at, s.id)
        from public.profile_sections s where s.org_id = actor_org), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'section_id', f.section_id, 'kind', f.kind, 'system_key', f.system_key,
        'question_type', f.question_type, 'label', f.label, 'help', f.help, 'privacy', f.privacy,
        'default_required', f.default_required, 'settings', f.settings,
        'show_when_field_id', f.show_when_field_id, 'show_when_option_id', f.show_when_option_id,
        'sort_order', f.sort_order, 'is_archived', f.is_archived,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'key', o.key, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
            order by o.sort_order, o.id)
            from public.custom_question_options o where o.question_id = f.id), '[]'::jsonb))
        -- The app's fields by key, then Ramassà's in their order: the same
        -- setup always gives the same file.
        order by f.kind, f.system_key, f.sort_order, f.created_at, f.id)
        from public.profile_fields f
       where f.org_id = actor_org
         and not coalesce(f.system_key = any (private.authorization_field_keys()), false)), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', p.field_id, 'surface', p.surface, 'screen_key', p.screen_key,
        'sort_order', p.sort_order, 'required', p.required,
        'label_override', p.label_override, 'help_override', p.help_override)
        order by p.surface, p.screen_key, p.sort_order, coalesce(f.system_key, f.id::text))
        from public.field_placements p
        join public.profile_fields f on f.id = p.field_id
       where p.org_id = actor_org and p.surface not in ('authorization', 'custom_form')), '[]'::jsonb),
    -- Ramassà screens, in the order of their anchors.
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro,
        'after_screen', s.after_screen, 'sort_order', s.sort_order,
        'home_after_screen', s.home_after_screen, 'home_sort_order', s.home_sort_order,
        'is_archived', s.is_archived, 'is_hidden', s.is_hidden,
        -- The answer that opens it (RAPP-715); an older file has none.
        'show_when_field_id', s.show_when_field_id, 'show_when_values', to_jsonb(s.show_when_values))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at, s.id)
        from public.intake_screens s where s.org_id = actor_org), '[]'::jsonb),
    -- The placements above carry the wording, the hiding and the required
    -- flag of the app's questions (RAPP-666). The two lists stay in the file,
    -- empty, so it is still a version 3 file; an older file may fill them.
    'builtin_question_overrides', '[]'::jsonb,
    'builtin_screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', b.screen, 'texts', b.texts, 'is_hidden', b.is_hidden, 'is_deleted', b.is_deleted)
        order by b.screen)
        from public.intake_builtin_screens b where b.org_id = actor_org), '[]'::jsonb),
    'flow_order', (select to_jsonb(f.step_order) from public.intake_flow_orders f where f.org_id = actor_org),
    'required_questions', '[]'::jsonb,
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'states', p.states) order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb),
    'document_step_explanation', (
      select o.document_step_explanation from public.organizations o where o.id = actor_org),
    'app_terms', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version_number', v.version_number, 'published_at', v.published_at, 'content', v.content)
          order by v.version_number)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.app_terms_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Real seasons only: a test fixture season is never moved.
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'is_current', s.is_current)
        order by s.starts_on, s.name)
        from public.seasons s where s.org_id = actor_org and not s.is_test_fixture), '[]'::jsonb),
    'authorization', jsonb_build_object(
      'published', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_id', v.season_id, 'version_number', v.version_number,
          'published_at', v.published_at, 'content', v.content)
          order by s.starts_on, v.version_number)
          from public.authorization_versions v
          join public.seasons s on s.id = v.season_id and not s.is_test_fixture
         where v.org_id = actor_org and v.published_at is not null), '[]'::jsonb),
      'draft', (
        select jsonb_build_object('content', v.content)
          from public.authorization_versions v where v.org_id = actor_org and v.published_at is null)),
    -- Every block of the screens (RAPP-690, RAPP-770), in the order they share
    -- with the placements. The key keeps its first name, so an older file reads.
    'signature_blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'surface', b.surface, 'screen_key', b.screen_key, 'kind', b.kind, 'body', b.body,
        'title', b.title, 'points', b.points, 'sort_order', b.sort_order)
        order by b.surface, b.screen_key, b.sort_order, b.created_at, b.id)
        from public.form_blocks b where b.org_id = actor_org and b.surface <> 'custom_form'), '[]'::jsonb),
    -- Dades legals (RAPP-699): every consent by key, the system ones with
    -- their wording, and where each is asked on Onboarding. The
    -- authorization's consents travel in its draft.
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', c.key, 'system_key', c.system_key, 'name', c.name, 'body', c.body,
        'is_archived', c.is_archived)
        order by c.key)
        from public.consents c where c.org_id = actor_org), '[]'::jsonb),
    'consent_placements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consent_key', c.key, 'screen_key', p.screen_key, 'sort_order', p.sort_order,
        'required', p.required)
        order by p.screen_key, p.sort_order, c.key)
        from public.consent_placements p
        join public.consents c on c.id = p.consent_id
       where p.org_id = actor_org and p.surface = 'onboarding'), '[]'::jsonb)
  );

  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'onboarding.export', 'organization', actor_org,
          jsonb_build_object('schema_version', 3, 'app_commit', p_app_commit,
                             'counts', private.onboarding_setup_counts(document)));
  return document;
end;
$function$;

create or replace function private.apply_onboarding_setup(p_document jsonb, p_org_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  season_map jsonb := '{}'::jsonb;
  screen_map jsonb := '{}'::jsonb;
  option_map jsonb := '{}'::jsonb;
  section_map jsonb := '{}'::jsonb;
  field_map jsonb := '{}'::jsonb;
  -- A file of an older version is read as version 3 (RAPP-656).
  document jsonb := private.onboarding_setup_as_version_3(p_document, p_org_id);
  new_field uuid;
  placed_screen text;
  item record;
  option_item record;
  new_id uuid;
  new_screen uuid;
  question_count integer := 0;
  option_ties boolean;
  steps text[];
  legal jsonb := private.onboarding_setup_legal_plan(p_document);
  flow_problem text;
  opening text[];
  -- An older file's follow-up fields, by system key (RAPP-720).
  older_own_fields text[] := array[]::text[];
  placed_key text;
begin
  -- A file with nothing to import is refused, or an empty export could be
  -- imported again and again (pending fix 33).
  if private.onboarding_setup_is_empty(p_document) then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/EMPTY: the file holds no onboarding setup to import';
  end if;

  -- Ids inside the file are unique per type, or references are ambiguous.
  if (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'screens') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'seasons') s)
     or (select count(*) <> count(distinct s ->> 'id') from jsonb_array_elements(document -> 'sections') s)
     or (select count(*) <> count(distinct f ->> 'id') from jsonb_array_elements(document -> 'fields') f)
     or (select count(*) <> count(distinct o ->> 'id')
           from jsonb_array_elements(document -> 'fields') f, jsonb_array_elements(f -> 'options') o)
  then
    raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an id appears twice';
  end if;

  -- Seasons.
  for item in select value from jsonb_array_elements(p_document -> 'seasons') loop
    insert into public.seasons (org_id, name, starts_on, is_current)
    values (p_org_id, item.value ->> 'name', (item.value ->> 'starts_on')::date,
            coalesce((item.value ->> 'is_current')::boolean, false))
    returning id into new_id;
    season_map := season_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  -- Ramassà screens. Fields reach them through placements, below.
  for item in select value, ordinality from jsonb_array_elements(document -> 'screens') with ordinality loop
    insert into public.intake_screens (
      org_id, title, intro, after_screen, sort_order, home_after_screen, home_sort_order, is_archived,
      is_hidden, created_at, updated_at)
    values (
      p_org_id, item.value -> 'title', private.json_value_or_null(item.value -> 'intro'),
      item.value ->> 'after_screen', (item.value ->> 'sort_order')::integer,
      coalesce(item.value ->> 'home_after_screen', item.value ->> 'after_screen'),
      coalesce((item.value ->> 'home_sort_order')::integer, (item.value ->> 'sort_order')::integer),
      coalesce((item.value ->> 'is_archived')::boolean, false),
      -- An older file has no hide flag: the screen shows (RAPP-711).
      coalesce((item.value ->> 'is_hidden')::boolean, false),
      now() + item.ordinality * interval '1 microsecond', now())
    returning id into new_screen;
    screen_map := screen_map || jsonb_build_object(item.value ->> 'id', new_screen);
  end loop;

  -- The profile layout (RAPP-649): built-in sections and fields by their key,
  -- the others new; then where each is asked; then conditions.
  for item in select value from jsonb_array_elements(document -> 'sections') loop
    new_id := null;
    if coalesce((item.value ->> 'is_builtin')::boolean, false) then
      update public.profile_sections
         set title = item.value -> 'title', sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and key = item.value ->> 'key' and is_builtin
      returning id into new_id;
    end if;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.profile_sections (id, org_id, key, title, sort_order)
      values (new_id, p_org_id, 'custom_' || replace(new_id::text, '-', ''), item.value -> 'title',
              (item.value ->> 'sort_order')::integer);
    end if;
    section_map := section_map || jsonb_build_object(item.value ->> 'id', new_id);
  end loop;

  for item in select value, ordinality from jsonb_array_elements(document -> 'fields') with ordinality loop
    if section_map ->> (item.value ->> 'section_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a question names a section that is not in the file';
    end if;
    if item.value ->> 'kind' = 'builtin' then
      update public.profile_fields
         set label = item.value -> 'label', help = private.json_value_or_null(item.value -> 'help'),
             section_id = (section_map ->> (item.value ->> 'section_id'))::uuid,
             sort_order = (item.value ->> 'sort_order')::integer, updated_at = now()
       where org_id = p_org_id and system_key = private.setup_system_key(item.value)
      returning id into new_field;
      if new_field is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: an app question this app does not know';
      end if;
      -- Its options are the app's: a condition in the file finds them by key.
      for option_item in select value from jsonb_array_elements(item.value -> 'options') loop
        select o.id into new_id from public.custom_question_options o
         where o.question_id = new_field and o.key = option_item.value ->> 'key';
        if new_id is not null then
          option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
        end if;
      end loop;
    else
      question_count := question_count + 1;
      insert into public.profile_fields (
        org_id, section_id, kind, question_type, label, help, privacy, default_required, settings,
        sort_order, created_by, is_archived, created_at, updated_at)
      values (
        p_org_id, (section_map ->> (item.value ->> 'section_id'))::uuid, 'custom', item.value ->> 'question_type',
        item.value -> 'label', private.json_value_or_null(item.value -> 'help'), item.value ->> 'privacy',
        coalesce((item.value ->> 'default_required')::boolean, false),
        coalesce(private.json_value_or_null(item.value -> 'settings'), '{}'::jsonb),
        (item.value ->> 'sort_order')::integer,
        p_actor, coalesce((item.value ->> 'is_archived')::boolean, false),
        now() + question_count * interval '1 microsecond', now())
      returning id into new_field;
      select count(*) <> count(distinct o ->> 'sort_order') into option_ties
        from jsonb_array_elements(item.value -> 'options') o;
      for option_item in select value, ordinality from jsonb_array_elements(item.value -> 'options') with ordinality loop
        insert into public.custom_question_options (org_id, question_id, label, sort_order, is_archived)
        values (p_org_id, new_field, option_item.value -> 'label',
                case when option_ties then option_item.ordinality::integer - 1
                     else (option_item.value ->> 'sort_order')::integer end,
                coalesce((option_item.value ->> 'is_archived')::boolean, false))
        returning id into new_id;
        option_map := option_map || jsonb_build_object(option_item.value ->> 'id', new_id);
      end loop;
    end if;
    field_map := field_map || jsonb_build_object(item.value ->> 'id', new_field);
  end loop;

  -- The built-in fields the file names are placed as the file says. A file
  -- converted from version 1 names none, so theirs stay as they are.
  -- The parts of a split field go with their first part, and the parts shown
  -- on a condition go first, so no condition is left without its field.
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and f.show_when_field_id is not null
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  delete from public.field_placements p
   using public.profile_fields f
   where f.id = p.field_id and f.org_id = p_org_id and f.kind = 'builtin'
     and p.surface <> 'custom_form'
     and private.question_system_key(private.system_key_question(f.system_key))
         in (select private.question_system_key(private.system_key_question(private.setup_system_key(b)))
               from jsonb_array_elements(document -> 'fields') b where b ->> 'kind' = 'builtin');
  -- The follow-ups after the screens they follow, so a field's condition is
  -- placed before it (RAPP-720).
  for item in
    select value from jsonb_array_elements(document -> 'placements') with ordinality as p(value, place)
     order by private.is_app_follow_up(value ->> 'screen_key'), place
  loop
    if field_map ->> (item.value ->> 'field_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a question that is not in the file';
    end if;
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    -- An older file asks a follow-up's own field beside its question, where
    -- nothing drew it: it lands on its follow-ups as they start (RAPP-720).
    select f.system_key into placed_key from public.profile_fields f
     where f.id = (field_map ->> (item.value ->> 'field_id'))::uuid;
    if item.value ->> 'surface' = 'onboarding' and not private.is_app_follow_up(placed_screen)
       and exists (select 1 from private.app_follow_up_own_fields() o where o.system_key = placed_key) then
      older_own_fields := array_append(older_own_fields, placed_key);
      continue;
    end if;
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a placement names a screen that is not in the file';
      end if;
    end if;
    insert into public.field_placements (
      org_id, field_id, surface, screen_key, sort_order, required, label_override, help_override)
    values (
      p_org_id, (field_map ->> (item.value ->> 'field_id'))::uuid, item.value ->> 'surface', placed_screen,
      (item.value ->> 'sort_order')::integer, coalesce((item.value ->> 'required')::boolean, false),
      private.json_value_or_null(item.value -> 'label_override'),
      private.json_value_or_null(item.value -> 'help_override'));
  end loop;
  -- The blocks (RAPP-690), each on its screen; an older file has none, and a
  -- file from before RAPP-770 holds signatures only.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'signature_blocks')) loop
    placed_screen := private.json_value_or_null(item.value -> 'screen_key') #>> '{}';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a block names a screen that is not in the file';
      end if;
    end if;
    insert into public.form_blocks (org_id, surface, screen_key, kind, body, title, points, sort_order)
    values (p_org_id, item.value ->> 'surface', placed_screen,
            coalesce(item.value ->> 'kind', 'signature'),
            private.json_value_or_null(item.value -> 'body'),
            private.json_value_or_null(item.value -> 'title'),
            private.json_value_or_null(item.value -> 'points'),
            coalesce((item.value ->> 'sort_order')::integer, 0));
  end loop;
  -- Dades legals (RAPP-699); an older file has none. A system consent takes
  -- the file's wording by key; a staff consent is made by key, or takes the
  -- file's wording when the key exists.
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consents')) loop
    insert into public.consents (org_id, key, system_key, name, body, is_archived, created_by)
    values (p_org_id, item.value ->> 'key',
            case when item.value ->> 'key' = any (private.system_consent_keys()) then item.value ->> 'key' end,
            item.value -> 'name', item.value -> 'body', coalesce((item.value ->> 'is_archived')::boolean, false),
            case when item.value ->> 'key' = any (private.system_consent_keys()) then null else p_actor end)
    on conflict (org_id, key) do update
      set name = excluded.name, body = excluded.body, is_archived = excluded.is_archived, updated_at = now();
  end loop;
  for item in select value from jsonb_array_elements(private.json_array_or_empty(p_document -> 'consent_placements')) loop
    placed_screen := item.value ->> 'screen_key';
    if private.is_uuid_text(placed_screen) then
      placed_screen := screen_map ->> placed_screen;
      if placed_screen is null then
        raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent names a screen that is not in the file';
      end if;
    end if;
    select id into new_id from public.consents
     where org_id = p_org_id and key = item.value ->> 'consent_key' and not is_archived;
    if new_id is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a consent placement names a consent that is not in the file';
    end if;
    insert into public.consent_placements (org_id, consent_id, surface, screen_key, sort_order, required)
    values (p_org_id, new_id, 'onboarding', placed_screen, coalesce((item.value ->> 'sort_order')::integer, 0),
            coalesce((item.value ->> 'required')::boolean, false)
              and item.value ->> 'consent_key' <> 'image_rights')
    on conflict (consent_id, surface, custom_form_id) do nothing;
  end loop;
  -- A file from before the split places the first parts only.
  perform private.place_system_field_parts(p_org_id);
  perform private.seed_follow_up_fields(p_org_id, older_own_fields);

  for item in
    select value from jsonb_array_elements(document -> 'fields')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or option_map ->> (item.value ->> 'show_when_option_id') is null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a condition names a question or option that is not in the file';
    end if;
    update public.profile_fields
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_option_id = (option_map ->> (item.value ->> 'show_when_option_id'))::uuid
     where id = (field_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- The screens that depend on an answer (RAPP-715): the question and its
  -- answers of the file, as this organization's. An older file has none.
  for item in
    select value from jsonb_array_elements(document -> 'screens')
     where private.json_value_or_null(value -> 'show_when_field_id') is not null
  loop
    opening := array(
      select coalesce(option_map ->> v.value, case when v.value in ('yes', 'no', 'maybe') then v.value end)
        from jsonb_array_elements_text(
               case when jsonb_typeof(item.value -> 'show_when_values') = 'array'
                    then item.value -> 'show_when_values' else '[]'::jsonb end) with ordinality as v(value, n)
       order by v.n);
    if field_map ->> (item.value ->> 'show_when_field_id') is null
       or cardinality(opening) = 0 or array_position(opening, null) is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a screen depends on a question or answer that is not in the file';
    end if;
    update public.intake_screens
       set show_when_field_id = (field_map ->> (item.value ->> 'show_when_field_id'))::uuid,
           show_when_values = opening
     where id = (screen_map ->> (item.value ->> 'id'))::uuid;
  end loop;

  -- An older file's required list, then its wording, hiding and option
  -- changes of the app's questions, land on their fields and placements
  -- (RAPP-666). A hide counts only while the question is optional.
  for item in select value from jsonb_array_elements(p_document -> 'required_questions') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a required question this app does not know';
    end if;
    if jsonb_typeof(item.value -> 'is_required') is distinct from 'boolean' then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: the file is incomplete or damaged';
    end if;
    continue when item.value ->> 'question' = any (private.locked_required_intake_questions());
    perform private.set_app_question_required(p_org_id, item.value ->> 'question', (item.value ->> 'is_required')::boolean);
  end loop;
  for item in select value from jsonb_array_elements(p_document -> 'builtin_question_overrides') loop
    if not (item.value ->> 'question' = any (private.wizard_intake_questions())) then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: a change to an app question this app does not know';
    end if;
    perform private.fold_app_option_overrides(
      p_org_id, item.value ->> 'question', private.json_value_or_null(item.value -> 'option_overrides'));
    if coalesce((item.value ->> 'is_hidden')::boolean, false)
       and not (item.value ->> 'question' = any (private.required_intake_questions(p_org_id))) then
      perform private.set_app_question_hidden(p_org_id, item.value ->> 'question', true);
    end if;
    perform private.set_app_question_wording(
      p_org_id, item.value ->> 'question',
      private.json_value_or_null(item.value -> 'label'), private.json_value_or_null(item.value -> 'help'));
  end loop;

  -- The app screens' wording. An older file's single document follow-up
  -- lands on the three document screens (RAPP-715).
  insert into public.intake_builtin_screens (org_id, screen, texts, is_hidden, is_deleted, updated_by)
  select p_org_id, coalesce(split.screen, b ->> 'screen'),
         coalesce(private.json_value_or_null(b -> 'texts'), '{}'::jsonb),
         coalesce((b ->> 'is_hidden')::boolean, false), coalesce((b ->> 'is_deleted')::boolean, false), p_actor
    from jsonb_array_elements(p_document -> 'builtin_screens') b
    left join lateral unnest(
      case when b ->> 'screen' = 'documentation-details'
           then array['documentation-nie', 'documentation-passport', 'documentation-other'] end) as split(screen)
      on true
  on conflict (org_id, screen) do nothing;

  -- The flow order, staff screens remapped.
  if jsonb_typeof(document -> 'flow_order') = 'array' then
    select array_agg(
             case when step.value like 'custom:%' then 'custom:' || (screen_map ->> substr(step.value, 8))
                  else step.value end
             order by step.ordinality)
      into steps
      from jsonb_array_elements_text(document -> 'flow_order') with ordinality as step(value, ordinality);
    -- The same checks as save_intake_flow_order (pending fix 31), on the
    -- screens just created with the file's archived flags.
    flow_problem := private.intake_flow_order_problem(p_org_id, coalesce(steps, array[]::text[]));
    if flow_problem is not null then
      raise invalid_parameter_value using message = 'ONBOARDING_SETUP/MALFORMED: ' || case flow_problem
        when 'too_many' then 'the flow order has more than 200 steps'
        when 'repeated' then 'the flow order names a step twice'
        when 'fixed_end' then 'the summary, the terms and the authorization always end the onboarding'
        when 'archived_screen' then 'the flow order names an archived screen'
        else 'the flow order names a step that is not in the file' end;
    end if;
    if cardinality(steps) > 0 then
      insert into public.intake_flow_orders (org_id, step_order, updated_by) values (p_org_id, steps, p_actor);
    end if;
  end if;
  -- Every follow-up right after its parent (RAPP-715).
  perform private.keep_branches_after_parents(p_org_id, p_actor);

  -- A screen that asks something required or holds a signature shows (RAPP-711).
  update public.intake_screens s set is_hidden = false
   where s.org_id = p_org_id and s.is_hidden
     and private.screen_must_show(p_org_id, 'onboarding', s.id::text);

  -- Presets and the document step note.
  if exists (
    select 1 from jsonb_array_elements(p_document -> 'presets') p
     where jsonb_typeof(p -> 'states') is distinct from 'object'
        or exists (select 1 from jsonb_each_text(p -> 'states') entry
                    where not (entry.key = any (private.wizard_intake_questions()))
                       or entry.value not in ('ask', 'skip'))
  ) then
    raise check_violation using message = 'ONBOARDING_SETUP/MALFORMED: a preset sets ask or skip on wizard questions';
  end if;
  insert into public.intake_state_presets (org_id, name, states, created_by)
  select p_org_id, btrim(p ->> 'name'), p -> 'states', p_actor
    from jsonb_array_elements(p_document -> 'presets') p;

  update public.organizations
     set document_step_explanation = private.json_value_or_null(p_document -> 'document_step_explanation')
   where id = p_org_id;

  -- The legal texts: drafts only, through the draft functions that validate them.
  if (legal -> 'app_terms' ->> 'imported')::boolean then
    perform public.save_app_terms_draft(legal -> 'app_terms' -> 'content');
  end if;
  if (legal -> 'authorization' ->> 'imported')::boolean then
    perform public.save_authorization_draft(legal -> 'authorization' -> 'content');
  end if;

  return jsonb_build_object(
    'counts', private.onboarding_setup_import_counts(p_document),
    'legal', jsonb_build_object(
      'app_terms', (legal -> 'app_terms') - 'content',
      'authorization', (legal -> 'authorization') - 'content'));
end;
$function$;

create or replace function private.onboarding_setup_problem(p_state text, p_message text, p_constraint text, p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_message like 'ONBOARDING_SETUP/%' then p_message
    when nullif(p_constraint, '') is not null or (p_state like '23%' and nullif(p_table, '') is not null) then
      'ONBOARDING_SETUP/REFUSED_VALUE: ' || case p_table
        when 'intake_screens' then 'a screen'
        when 'profile_fields' then 'a question'
        when 'field_placements' then 'where a question is asked'
        when 'profile_sections' then 'a section of the player profile'
        when 'custom_question_options' then 'an answer option'
        when 'intake_builtin_screens' then 'the wording of an app screen'
        when 'intake_flow_orders' then 'the screen order'
        when 'intake_state_presets' then 'a preset'
        when 'organizations' then 'the document step note'
        when 'seasons' then 'a season'
        when 'app_terms_versions' then 'the app terms'
        when 'authorization_versions' then 'the authorization'
        when 'form_blocks' then 'a block of a screen'
        else 'a part' end
      || ' in the file has a value this app does not accept. Download the file again from an app at the same version.'
    when p_state like '22%' then
      'ONBOARDING_SETUP/MALFORMED: a value in the file has the wrong form (a date, a number or an id). Download the file again from an app at the same version.'
    else p_message
  end;
$function$;

-- 6. Removing a block, and the erasure registry -------------------------------------------------------------

create or replace function public.remove_form_block(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  removed public.form_blocks;
begin
  delete from public.form_blocks where id = p_id and org_id = actor_org returning * into removed;
  if removed.id is null then
    raise no_data_found using message = 'no such block';
  end if;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, (select auth.uid()), 'intake.block_remove', 'form_block', p_id,
          jsonb_build_object('surface', removed.surface, 'screen', removed.screen_key, 'kind', removed.kind,
                             'body', removed.body, 'title', removed.title, 'points', removed.points));
end;
$$;

CREATE OR REPLACE FUNCTION public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew, with the text she was shown. Anonymizing keeps them as proof without her name and clears a staff reason; deleting her account deletes them.'),
    ('consents', null, 'not_personal', 'The consents of the organization, defined once (Dades legals).'),
    ('consent_placements', null, 'not_personal', 'Where each consent is asked.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('profile_sections', null, 'not_personal', 'Sections of the player profile layout.'),
    ('profile_fields', null, 'not_personal', 'The pieces of information the profile holds, and who created each.'),
    ('field_placements', null, 'not_personal', 'Where each piece of information is asked.'),
    ('form_blocks', null, 'not_personal', 'The blocks of the forms: a signature with the text it asks to accept, a text, a list of points.'),
    ('form_signatures', 'profile_id', 'purge', 'Her signatures of the form blocks, and the entity''s for her on a referral, with the strokes.'),
    ('walk_in_consents', null, 'retain_limited', 'A walk-in''s ticks of the Onboarding consents on the tablet until staff confirm her; moved to her consent history then, or purged with the walk-in.'),
    ('walk_in_form_signatures', null, 'retain_limited', 'A walk-in''s signatures of the Onboarding blocks until staff confirm her; moved to her profile then, or purged with the walk-in.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('intake_builtin_screens', null, 'not_personal', 'Staff wording of the built-in onboarding screens and which are hidden.'),
    ('intake_flow_orders', null, 'not_personal', 'The order of the onboarding screens staff arranged.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Every answer of her record, the app''s fields and the team''s. Anonymizing deletes them all and keeps only her birth year.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.'),
    ('custom_question_states', 'profile_id', 'purge', 'Which fields staff chose to ask or not ask her, the app''s and the team''s.'),
    ('participant_search_documents', 'profile_id', 'purge', 'Her names and her Normal and Personal text answers, indexed for the participants search.'),
    ('staff_notifications', null, 'not_personal', 'The team''s bell: one row per team member; names render live from the source row and params hold no personal value.'),
    ('custom_forms', null, 'not_personal', 'Forms the team created: their names and choices.'),
    ('custom_form_screens', null, 'not_personal', 'The screens of the forms the team created.'),
    ('custom_form_responses', 'profile_id', 'purge', 'Each time she was asked a form, and when and by whom it was answered.'),
    ('custom_form_recipients', 'profile_id', 'purge', 'The forms the team picked her for.'),
    ('custom_form_versions', null, 'not_personal', 'The forms the team created as each was published.'),
    ('custom_form_reminders', null, 'not_personal', 'When the team was reminded to renew a repeating form.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

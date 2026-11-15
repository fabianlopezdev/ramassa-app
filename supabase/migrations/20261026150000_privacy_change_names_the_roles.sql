-- The privacy change warning names the roles (RAPP-692).
--
-- WHY
--
-- Fabián, 2026-10-26: when a field's privacy changes, warn before saving and
-- say who loses or gains access, by role: "Les persones amb el rol Equip (4)
-- ja no el veuran", and the reverse when access widens. The RAPP-665 preview
-- gave one total of team members; a designer could not tell which part of the
-- team it meant.
--
-- WHAT CHANGES
--
--   1. `private.readers_by_role(org, reads, not_reads)`: the active team
--      members who hold the permission `reads` and not `not_reads`, grouped
--      by their role (`team_member_access.preset_id`, the preset last
--      applied), with the role's built-in key, its name and the number of
--      people. Access is decided per person (`private.profile_has_permission`
--      reads `team_member_permissions`), so a person adjusted away from her
--      role is counted where her own toggles put her. People with no role
--      come as one group with a null role.
--   2. `public.preview_field_change` returns `roles_losing` and
--      `roles_gaining` beside the totals. Both are empty when the privacy
--      level does not change.
--
-- Docs: https://www.postgresql.org/docs/17/functions-aggregate.html (jsonb_agg with ORDER BY).

-- 1. Readers by role ----------------------------------------------------------------------------------------

create or replace function private.readers_by_role(p_org_id uuid, p_reads text, p_not_reads text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'role_id', role.id, 'builtin_key', role.builtin_key, 'name', role.name, 'people', grouped.people)
           order by role.id is null, role.builtin_key is null, role.builtin_key, role.name), '[]'::jsonb)
    from (
      select access.preset_id, count(*)::integer as people
        from public.profiles member
        left join public.team_member_access access on access.profile_id = member.id
       where member.org_id = p_org_id
         and p_reads is distinct from p_not_reads
         and private.profile_has_permission(member.id, p_reads)
         and not private.profile_has_permission(member.id, p_not_reads)
       group by access.preset_id
    ) grouped
    left join public.permission_presets role on role.id = grouped.preset_id;
$$;
revoke all on function private.readers_by_role(uuid, text, text) from public, anon, authenticated;

-- 2. The preview names them ---------------------------------------------------------------------------------

create or replace function public.preview_field_change(
  p_field_id uuid, p_type text, p_privacy text, p_options jsonb default null, p_settings jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_org uuid := private.require_question_builder();
  field public.profile_fields;
  to_type text;
  to_privacy text;
  to_settings jsonb;
  options jsonb := '[]'::jsonb;
  type_changed boolean;
  answer record;
  plain jsonb;
  converted jsonb;
  total integer := 0;
  kept integer := 0;
  not_kept integer := 0;
  to_encrypt integer := 0;
  to_decrypt integer := 0;
  permission_before text;
  permission_after text;
begin
  select * into field from public.profile_fields where id = p_field_id and org_id = actor_org;
  if field.id is null then
    raise no_data_found using message = 'no such question';
  end if;
  to_type := coalesce(p_type, field.question_type);
  to_privacy := coalesce(p_privacy, field.privacy);
  if private.is_name_field(field) and (to_type <> field.question_type or to_privacy <> field.privacy) then
    raise check_violation using message = 'her names keep their type and privacy';
  end if;
  if not (to_type = any (private.custom_question_types())) then
    raise check_violation using message = 'not a question type';
  end if;
  if to_privacy not in ('normal', 'personal', 'sensitive') then
    raise check_violation using message = 'the privacy level is normal, personal or sensitive';
  end if;
  type_changed := to_type <> field.question_type;
  to_settings := coalesce(nullif(p_settings, 'null'::jsonb),
                          case when type_changed then '{}'::jsonb else field.settings end);
  if to_type in ('single_choice', 'multiple_choice', 'search_choice') then
    if nullif(p_options, 'null'::jsonb) is null then
      options := private.field_options_json(field.id);
    elsif jsonb_typeof(p_options) <> 'array' then
      raise check_violation using message = 'options must be a list';
    else
      -- A saved option keeps its key, so an answer still matches it by key.
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', saved.id::text, 'key', saved.key, 'label', x.o -> 'label') order by x.position), '[]'::jsonb)
        into options
        from jsonb_array_elements(p_options) with ordinality as x(o, position)
        left join public.custom_question_options saved
          on saved.question_id = field.id and saved.id::text = x.o ->> 'id';
    end if;
  end if;

  for answer in
    select a.value, a.value_encrypted, false as is_referral
      from public.custom_answers a where a.question_id = field.id
    union all
    select null::jsonb, r.value_encrypted, true from public.referral_custom_answers r where r.question_id = field.id
  loop
    total := total + 1;
    if not type_changed then
      converted := '"kept"'::jsonb;
    else
      plain := coalesce(answer.value, public.decrypt_field(answer.value_encrypted)::jsonb);
      converted := private.converted_answer(field.question_type, plain, to_type, to_settings, options);
    end if;
    if converted is null then
      not_kept := not_kept + 1;
    else
      kept := kept + 1;
      if not answer.is_referral then
        if to_privacy = 'sensitive' and answer.value is not null then
          to_encrypt := to_encrypt + 1;
        elsif to_privacy <> 'sensitive' and answer.value_encrypted is not null then
          to_decrypt := to_decrypt + 1;
        end if;
      end if;
    end if;
  end loop;

  permission_before := private.privacy_permission(field.privacy);
  permission_after := private.privacy_permission(to_privacy);
  return jsonb_build_object(
    'type_from', field.question_type, 'type_to', to_type,
    'privacy_from', field.privacy, 'privacy_to', to_privacy,
    'answers', total, 'converted', kept, 'not_converted', not_kept,
    'to_encrypt', to_encrypt, 'to_decrypt', to_decrypt,
    'permission_before', permission_before, 'permission_after', permission_after,
    -- Team members who will read these answers, or stop reading them.
    'readers_gaining', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_after)
         and not private.profile_has_permission(member.id, permission_before)),
    'readers_losing', (
      select count(*) from public.profiles member
       where member.org_id = actor_org
         and private.profile_has_permission(member.id, permission_before)
         and not private.profile_has_permission(member.id, permission_after)),
    -- The same people by role (RAPP-692), for the warning that names them.
    'roles_losing', private.readers_by_role(actor_org, permission_before, permission_after),
    'roles_gaining', private.readers_by_role(actor_org, permission_after, permission_before),
    -- The registry's features that read this field (D7), before and after.
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
               'feature', r.feature,
               'fits_now', field.question_type = any (r.accepted_types),
               'fits_after', to_type = any (r.accepted_types)) order by r.feature)
        from private.field_features() r where r.system_key = field.system_key), '[]'::jsonb),
    'conditions_cleared', case when field.question_type = 'single_choice' and to_type <> 'single_choice'
      then (select count(*) from public.profile_fields child where child.show_when_field_id = field.id)
      else 0 end);
end;
$$;
revoke all on function public.preview_field_change(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.preview_field_change(uuid, text, text, jsonb, jsonb) to authenticated;

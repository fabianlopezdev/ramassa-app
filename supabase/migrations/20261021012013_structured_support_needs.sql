begin;
-- RAPP-577: bounded, versioned category answers in the existing encrypted needs value.
create function private.support_needs_valid(p_value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare answer jsonb; categories text[]; entry record;
begin
 if p_value is null then return true; end if;
 if length(p_value)>32000 then return false; end if;
 if p_value is not json object then return true; end if;
 answer:=p_value::jsonb;
 if answer->>'kind' is distinct from 'support-needs' then return true; end if;
 if answer->'version' is distinct from '1'::jsonb
    or jsonb_typeof(answer->'categories') is distinct from 'array'
    or jsonb_typeof(answer->'details') is distinct from 'object'
    or answer-array['kind','version','categories','details','explanation'] <> '{}'::jsonb then return false; end if;
 if answer ? 'explanation' and (jsonb_typeof(answer->'explanation') <> 'string' or length(answer->>'explanation')>2000) then return false; end if;
 if jsonb_array_length(answer->'categories') not between 1 and 5 then return false; end if;
 if exists(select 1 from jsonb_array_elements(answer->'categories') item where jsonb_typeof(item) <> 'string') then return false; end if;
 select array_agg(category) into categories from jsonb_array_elements_text(answer->'categories') category;
 if not categories <@ array['accessibility','health','communication','wellbeing','other','none']::text[]
    or cardinality(categories) <> (select count(distinct category) from unnest(categories) category)
    or ('none'=any(categories) and (cardinality(categories)>1 or coalesce(answer->>'explanation','')<>'')) then return false; end if;
 for entry in select * from jsonb_each(answer->'details') loop
   if entry.key='none' or not entry.key=any(categories) or jsonb_typeof(entry.value)<>'string'
      or length(entry.value #>> '{}')>2000 then return false; end if;
 end loop;
 return true;
end;
$$;
revoke all on function private.support_needs_valid(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.season_answers_valid(p_payload jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    coalesce(nullif(btrim(p_payload ->> 'applicant_status'), '') in
      ('asylum_seeker', 'refugee', 'migrant', 'other', 'prefer_not_to_say'), true)
    and coalesce(nullif(p_payload ->> 'childcare_need', '') in ('yes', 'no', 'maybe'), true)
    and coalesce(nullif(p_payload ->> 'season_number', '') in ('1', '2', '3', '4', '5'), true)
    and (not (p_payload ? 'applicant_status_details') or jsonb_typeof(p_payload -> 'applicant_status_details') in ('null', 'string'))
    and coalesce(length(p_payload ->> 'applicant_status_details') <= 2000, true)
    and (not(p_payload ? 'specific_needs') or jsonb_typeof(p_payload->'specific_needs') in ('null','string'))
    and private.support_needs_valid(p_payload ->> 'specific_needs')
    and (
      not (p_payload ? 'supporting_entities')
      or jsonb_typeof(p_payload -> 'supporting_entities') = 'null'
      or (
        jsonb_typeof(p_payload -> 'supporting_entities') = 'array'
        and jsonb_array_length(p_payload -> 'supporting_entities') <= 20
        and not exists (
          select 1 from jsonb_array_elements(p_payload -> 'supporting_entities') item
           where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 200
        )
      )
    );
$function$

;
commit;

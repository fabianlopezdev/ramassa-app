-- Country and municipality answer types (RAPP-660, D6).
--
-- WHY
--
-- Fabián, 2026-10-25: every field, the app's own included, is defined on
-- Dades de les jugadores, and every answer lives in `custom_answers`. Two of
-- the app's fields answer from a list the app ships: her nationality from the
-- countries (`packages/shared/i18n/countries.json`, 249 names) and her
-- municipality from the IDESCAT catalog (`public.municipality_catalog`, 947
-- names). Staff lists stop at 500 options and store option ids, so neither
-- fits a hand-made list. They become two answer types of their own.
--
-- WHAT CHANGES
--
--   1. `private.custom_question_types()` gains `country` and `municipality`.
--      They take no settings and have no options.
--   2. The answer is the canonical name the pickers already store: the Catalan
--      country name (`Síria`) and the municipality's canonical name (`Vic`),
--      whatever language she reads. `private.custom_answer_value_valid` checks
--      it against `private.country_names()` and the catalog; the shared Zod
--      schema states the same rule (`customAnswerSchema`, kept equal by
--      `tests/custom-answer-parity.test.ts`).
--   3. `private.country_names()` is generated from `countries.json` between
--      the `country-names` markers; `tests/country-names-parity.test.ts`
--      keeps the two equal.
--
-- Nothing else moves here: the next migration moves the app's fields onto the
-- two types.
--
-- Docs: https://www.postgresql.org/docs/17/functions-comparisons.html (ANY with
-- an array), https://supabase.com/docs/guides/database/functions (security
-- definer functions with an empty search path).

-- 1. The lists ---------------------------------------------------------------------------------------------

-- The canonical name of every country: the Catalan one, as her picker saves it.
create or replace function private.country_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- country-names:start
    'Afganistan', 'Albània', 'Alemanya', 'Algèria', 'Andorra', 'Angola', 'Anguilla', 'Antàrtida',
    'Antigua i Barbuda', 'Aràbia Saudí', 'Argentina', 'Armènia', 'Aruba', 'Austràlia', 'Àustria',
    'Azerbaidjan', 'Bahames', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarús', 'Bèlgica', 'Belize', 'Benín',
    'Bermudes', 'Bhutan', 'Bolívia', 'Bòsnia i Hercegovina', 'Botswana', 'Brasil', 'Brunei', 'Bulgària',
    'Burkina Faso', 'Burundi', 'Cambodja', 'Camerun', 'Canadà', 'Cap Verd', 'Carib Neerlandès',
    'Ciutat del Vaticà', 'Colòmbia', 'Comores', 'Congo - Brazzaville', 'Congo - Kinshasa', 'Corea del Nord',
    'Corea del Sud', 'Costa Rica', 'Côte d’Ivoire', 'CQ', 'Croàcia', 'Cuba', 'Curaçao', 'Dinamarca',
    'Djibouti', 'Dominica', 'Egipte', 'El Salvador', 'Emirats Àrabs Units', 'Equador', 'Eritrea',
    'Eslovàquia', 'Eslovènia', 'Espanya', 'Estats Units', 'Estònia', 'Eswatini', 'Etiòpia', 'Fiji',
    'Filipines', 'Finlàndia', 'França', 'Gabon', 'Gàmbia', 'Geòrgia', 'Ghana', 'Gibraltar', 'Grècia',
    'Grenada', 'Groenlàndia', 'Guadalupe', 'Guaiana Francesa', 'Guam', 'Guatemala', 'Guernsey', 'Guinea',
    'Guinea Bissau', 'Guinea Equatorial', 'Guyana', 'Haití', 'Hondures', 'Hong Kong (RAE Xina)', 'Hongria',
    'Iemen', 'Illa Christmas', 'Illa de la Reunió', 'Illa de Man', 'Illa Norfolk', 'Illes Åland',
    'Illes Caiman', 'Illes Cocos (Keeling)', 'Illes Cook', 'Illes Falkland', 'Illes Fèroe',
    'Illes Geòrgia del Sud i Sandwich del Sud', 'Illes Marianes del Nord', 'Illes Marshall',
    'Illes Menors Allunyades dels Estats Units', 'Illes Pitcairn', 'Illes Salomó', 'Illes Turks i Caicos',
    'Illes Verges Britàniques', 'Illes Verges dels Estats Units', 'Índia', 'Indonèsia', 'Iran', 'Iraq',
    'Irlanda', 'Islàndia', 'Israel', 'Itàlia', 'Jamaica', 'Japó', 'Jersey', 'Jordània', 'Kazakhstan', 'Kenya',
    'Kirguizstan', 'Kiribati', 'Kosovo', 'Kuwait', 'Lao', 'Lesotho', 'Letònia', 'Líban', 'Libèria', 'Líbia',
    'Liechtenstein', 'Lituània', 'Luxemburg', 'Macau (RAE Xina)', 'Macedònia del Nord', 'Madagascar',
    'Malàisia', 'Malawi', 'Maldives', 'Mali', 'Malta', 'Marroc', 'Martinica', 'Maurici', 'Mauritània',
    'Mayotte', 'Mèxic', 'Micronèsia', 'Moçambic', 'Moldàvia', 'Mònaco', 'Mongòlia', 'Montenegro',
    'Montserrat', 'Myanmar (Birmània)', 'Namíbia', 'Nauru', 'Nepal', 'Nicaragua', 'Níger', 'Nigèria', 'Niue',
    'Noruega', 'Nova Caledònia', 'Nova Zelanda', 'Oman', 'Països Baixos', 'Pakistan', 'Palau', 'Panamà',
    'Papua Nova Guinea', 'Paraguai', 'Perú', 'Polinèsia Francesa', 'Polònia', 'Portugal', 'Puerto Rico',
    'Qatar', 'Regne Unit', 'República Centreafricana', 'República Dominicana', 'Romania', 'Ruanda', 'Rússia',
    'Sàhara Occidental', 'Saint Kitts i Nevis', 'Saint Lucia', 'Saint Martin',
    'Saint Vincent i les Grenadines', 'Saint-Barthélemy', 'Saint-Pierre-et-Miquelon', 'Samoa',
    'Samoa Americana', 'San Marino', 'Santa Helena', 'São Tomé i Príncipe', 'Senegal', 'Sèrbia', 'Seychelles',
    'Sierra Leone', 'Singapur', 'Sint Maarten', 'Síria', 'Somàlia', 'Sri Lanka', 'Sud-àfrica', 'Sudan',
    'Sudan del Sud', 'Suècia', 'Suïssa', 'Surinam', 'Svalbard i Jan Mayen', 'Tadjikistan', 'Tailàndia',
    'Taiwan', 'Tanzània', 'Terres Australs Antàrtiques Franceses', 'Territori Britànic de l’Oceà Índic',
    'Territoris palestins', 'Timor-Leste', 'Togo', 'Tokelau', 'Tonga', 'Trinidad i Tobago', 'Tunísia',
    'Turkmenistan', 'Turquia', 'Tuvalu', 'Txad', 'Txèquia', 'Ucraïna', 'Uganda', 'Uruguai', 'Uzbekistan',
    'Vanuatu', 'Veneçuela', 'Vietnam', 'Wallis i Futuna', 'Xile', 'Xina', 'Xipre', 'Zàmbia', 'Zimbàbue'
    -- country-names:end
  ]::text[];
$$;

-- The catalog denies every client, so the check reads it as its owner.
create or replace function private.is_municipality(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.municipality_catalog m where m.canonical = p_name);
$$;

revoke all on function private.country_names() from public, anon, authenticated;
revoke all on function private.is_municipality(text) from public, anon, authenticated;

-- 2. The types ---------------------------------------------------------------------------------------------

create or replace function private.custom_question_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['short_text', 'long_text', 'yes_no_maybe', 'single_choice', 'multiple_choice',
               'number', 'date', 'yes_no', 'phone', 'email', 'search_choice', 'item_list',
               'consent', 'file_upload', 'signature', 'country', 'municipality']::text[];
$$;

CREATE OR REPLACE FUNCTION private.custom_answer_value_valid(p_type text, p_settings jsonb, p_value jsonb, p_live_options text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  kind text := jsonb_typeof(p_value);
  number_value numeric;
  date_value date;
  years integer;
  item text;
  accepted text[];
begin
  if p_value is null then
    return false;
  end if;
  case p_type
    when 'short_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 500;
    when 'long_text' then
      return kind = 'string' and length(private.js_trim(p_value #>> '{}')) between 1 and 4000;
    when 'yes_no_maybe' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no', 'maybe');
    when 'yes_no' then
      return kind = 'string' and p_value #>> '{}' in ('yes', 'no');
    when 'single_choice', 'search_choice' then
      return kind = 'string' and (p_value #>> '{}') = any (coalesce(p_live_options, '{}'));
    when 'multiple_choice' then
      return kind = 'array' and jsonb_array_length(p_value) > 0
        and not exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
        and (select count(distinct e) from jsonb_array_elements_text(p_value) e) = jsonb_array_length(p_value)
        and not exists (
          select 1 from jsonb_array_elements_text(p_value) e
           where not (e = any (coalesce(p_live_options, '{}'))));
    when 'number' then
      if kind <> 'number' then return false; end if;
      number_value := (p_value #>> '{}')::numeric;
      return abs(number_value) <= 1000000000
        and (not coalesce((p_settings ->> 'integer')::boolean, false) or number_value = trunc(number_value))
        and (not (p_settings ? 'min') or number_value >= (p_settings ->> 'min')::numeric)
        and (not (p_settings ? 'max') or number_value <= (p_settings ->> 'max')::numeric);
    when 'date' then
      if kind <> 'string' or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        return false;
      end if;
      begin
        date_value := (p_value #>> '{}')::date;
      exception when others then
        return false;
      end;
      -- A typed date that does not exist (30 February) is refused, not rolled over.
      if to_char(date_value, 'YYYY-MM-DD') <> p_value #>> '{}'
         or extract(year from date_value) not between 1900 and 2100 then
        return false;
      end if;
      years := extract(year from age(current_date, date_value))::integer;
      return (not (p_settings ? 'min_age') or years >= (p_settings ->> 'min_age')::integer)
        and (not (p_settings ? 'max_age') or years <= (p_settings ->> 'max_age')::integer);
    when 'phone' then
      return kind = 'string' and (p_value #>> '{}') ~ '^\+[1-9][0-9]{7,14}$';
    when 'email' then
      return kind = 'string' and length(p_value #>> '{}') <= 254
        and (p_value #>> '{}') ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
    when 'item_list' then
      if kind <> 'array' or jsonb_array_length(p_value) < 1
         or jsonb_array_length(p_value) > coalesce((p_settings ->> 'max_items')::integer, 20)
         or exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string')
         or (select count(distinct e) from jsonb_array_elements_text(p_value) e) <> jsonb_array_length(p_value) then
        return false;
      end if;
      for item in select e from jsonb_array_elements_text(p_value) e loop
        if length(item) not between 1 and 120 or item <> private.js_trim(item) then
          return false;
        end if;
      end loop;
      return true;
    when 'consent' then
      return p_value = 'true'::jsonb;
    when 'file_upload' then
      accepted := case p_settings ->> 'accept'
        when 'photo' then array['image/jpeg', 'image/png', 'image/webp']
        else array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] end;
      return kind = 'object'
        and p_value - array['key', 'name', 'content_type', 'size'] = '{}'::jsonb
        and jsonb_typeof(p_value -> 'key') = 'string'
        and (p_value ->> 'key') ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/intake-answers/'
                                   '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                                   '[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\.(jpg|png|webp|pdf)$')
        and jsonb_typeof(p_value -> 'name') = 'string'
        and length(p_value ->> 'name') between 1 and 120
        and jsonb_typeof(p_value -> 'content_type') = 'string'
        and (p_value ->> 'content_type') = any (accepted)
        and private.json_int_between(p_value -> 'size', 1, 10485760);
    when 'signature' then
      return private.app_signature_valid(p_value);
    -- The two lists the app ships: the canonical name, exactly as stored.
    when 'country' then
      return kind = 'string' and (p_value #>> '{}') = any (private.country_names());
    when 'municipality' then
      return kind = 'string' and private.is_municipality(p_value #>> '{}');
    else
      return false;
  end case;
end;
$function$;
